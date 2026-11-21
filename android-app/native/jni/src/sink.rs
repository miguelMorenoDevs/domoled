//! The AAudio sink: librespot's decoded samples go to the TV's media output. The stream is opened
//! on `start` and closed on `stop`, so a paused player holds no audio device. Writes block in the
//! player thread until the device has room.

use std::ffi::{c_char, c_int, c_void, CString};
use std::ptr;

use librespot_playback::audio_backend::{Sink, SinkError, SinkResult};
use librespot_playback::convert::Converter;
use librespot_playback::decoder::AudioPacket;
use librespot_playback::{NUM_CHANNELS, SAMPLE_RATE};

type Builder = *mut c_void;
type Stream = *mut c_void;

const OK: i32 = 0;
const ERROR_TIMEOUT: i32 = -885;
const DIRECTION_OUTPUT: i32 = 0;
const FORMAT_PCM_FLOAT: i32 = 2;
const PERFORMANCE_MODE_NONE: i32 = 10;
// Media usage follows the system's media volume, which is the TV's volume.
const USAGE_MEDIA: i32 = 1;
const CONTENT_TYPE_MUSIC: i32 = 2;
const WRITE_TIMEOUT_NS: i64 = 1_000_000_000;
const ANDROID_LOG_INFO: c_int = 4;
const ANDROID_LOG_WARN: c_int = 5;
const TAG: &std::ffi::CStr = c"AaudioSink";

#[link(name = "aaudio")]
extern "C" {
    fn AAudio_createStreamBuilder(builder: *mut Builder) -> i32;
    fn AAudioStreamBuilder_setDirection(builder: Builder, direction: i32);
    fn AAudioStreamBuilder_setSampleRate(builder: Builder, sample_rate: i32);
    fn AAudioStreamBuilder_setChannelCount(builder: Builder, channels: i32);
    fn AAudioStreamBuilder_setFormat(builder: Builder, format: i32);
    fn AAudioStreamBuilder_setPerformanceMode(builder: Builder, mode: i32);
    fn AAudioStreamBuilder_setUsage(builder: Builder, usage: i32);
    fn AAudioStreamBuilder_setContentType(builder: Builder, content_type: i32);
    fn AAudioStreamBuilder_openStream(builder: Builder, stream: *mut Stream) -> i32;
    fn AAudioStreamBuilder_delete(builder: Builder) -> i32;
    fn AAudioStream_getSampleRate(stream: Stream) -> i32;
    fn AAudioStream_getChannelCount(stream: Stream) -> i32;
    fn AAudioStream_getFormat(stream: Stream) -> i32;
    fn AAudioStream_getFramesWritten(stream: Stream) -> i64;
    fn AAudioStream_getFramesRead(stream: Stream) -> i64;
    fn AAudioStream_requestStart(stream: Stream) -> i32;
    fn AAudioStream_requestStop(stream: Stream) -> i32;
    fn AAudioStream_write(
        stream: Stream,
        buffer: *const c_void,
        frames: i32,
        timeout_ns: i64,
    ) -> i32;
    fn AAudioStream_close(stream: Stream) -> i32;
}

#[link(name = "log")]
extern "C" {
    fn __android_log_write(priority: c_int, tag: *const c_char, text: *const c_char) -> c_int;
}

pub struct AaudioSink {
    stream: Option<Stream>,
    underruns: u64,
}

impl AaudioSink {
    pub fn open() -> Self {
        Self {
            stream: None,
            underruns: 0,
        }
    }

    fn close(&mut self) {
        let Some(stream) = self.stream.take() else {
            return;
        };
        unsafe {
            AAudioStream_requestStop(stream);
            AAudioStream_close(stream);
        }
        if self.underruns > 0 {
            log(
                ANDROID_LOG_WARN,
                &format!("{} audio underruns while playing", self.underruns),
            );
        }
        self.underruns = 0;
    }
}

impl Drop for AaudioSink {
    fn drop(&mut self) {
        self.close();
    }
}

impl Sink for AaudioSink {
    fn start(&mut self) -> SinkResult<()> {
        if self.stream.is_some() {
            return Ok(());
        }
        let stream = open_stream().map_err(SinkError::StateChange)?;
        let result = unsafe { AAudioStream_requestStart(stream) };
        if result != OK {
            unsafe { AAudioStream_close(stream) };
            return Err(SinkError::StateChange(format!(
                "AAudio did not start: {result}"
            )));
        }
        let (rate, channels, format) = unsafe {
            (
                AAudioStream_getSampleRate(stream),
                AAudioStream_getChannelCount(stream),
                AAudioStream_getFormat(stream),
            )
        };
        log(
            ANDROID_LOG_INFO,
            &format!("AAudio stream started: {rate} Hz, {channels} channels, format {format}"),
        );
        self.stream = Some(stream);
        Ok(())
    }

    fn stop(&mut self) -> SinkResult<()> {
        self.close();
        Ok(())
    }

    fn write(&mut self, packet: AudioPacket, converter: &mut Converter) -> SinkResult<()> {
        let samples = packet
            .samples()
            .map_err(|error| SinkError::InvalidParams(error.to_string()))?;
        let stream = self
            .stream
            .ok_or_else(|| SinkError::NotConnected("the AAudio stream is closed".to_owned()))?;

        // Once audio has been written, an empty device buffer means the device went silent.
        let (written, read) = unsafe {
            (
                AAudioStream_getFramesWritten(stream),
                AAudioStream_getFramesRead(stream),
            )
        };
        if written > 0 && written == read {
            self.underruns += 1;
        }

        let floats = converter.f64_to_f32(samples);
        let channels = NUM_CHANNELS as usize;
        let mut data = floats.as_slice();
        while !data.is_empty() {
            let frames = (data.len() / channels) as i32;
            let result = unsafe {
                AAudioStream_write(stream, data.as_ptr().cast(), frames, WRITE_TIMEOUT_NS)
            };
            if result == ERROR_TIMEOUT {
                continue;
            }
            if result < 0 {
                return Err(SinkError::OnWrite(format!("AAudio write failed: {result}")));
            }
            data = &data[result as usize * channels..];
        }
        Ok(())
    }
}

fn open_stream() -> Result<Stream, String> {
    let mut builder: Builder = ptr::null_mut();
    check(
        unsafe { AAudio_createStreamBuilder(&mut builder) },
        "create the builder",
    )?;
    let mut stream: Stream = ptr::null_mut();
    unsafe {
        AAudioStreamBuilder_setDirection(builder, DIRECTION_OUTPUT);
        AAudioStreamBuilder_setSampleRate(builder, SAMPLE_RATE as i32);
        AAudioStreamBuilder_setChannelCount(builder, NUM_CHANNELS as i32);
        AAudioStreamBuilder_setFormat(builder, FORMAT_PCM_FLOAT);
        AAudioStreamBuilder_setPerformanceMode(builder, PERFORMANCE_MODE_NONE);
        AAudioStreamBuilder_setUsage(builder, USAGE_MEDIA);
        AAudioStreamBuilder_setContentType(builder, CONTENT_TYPE_MUSIC);
    }
    let result = unsafe { AAudioStreamBuilder_openStream(builder, &mut stream) };
    unsafe { AAudioStreamBuilder_delete(builder) };
    check(result, "open the stream")?;
    Ok(stream)
}

fn check(result: i32, what: &str) -> Result<(), String> {
    if result == OK {
        Ok(())
    } else {
        Err(format!("could not {what}: AAudio error {result}"))
    }
}

fn log(priority: c_int, message: &str) {
    if let Ok(text) = CString::new(message) {
        unsafe { __android_log_write(priority, TAG.as_ptr(), text.as_ptr()) };
    }
}
