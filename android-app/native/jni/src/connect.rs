//! The Spotify Connect device: one session, registered as a TV, that plays into a discard sink.
//! The access token comes from the server (`GET /spotify/stream-token`) and is only used to log
//! in; the session keeps its own connection afterwards.

use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use librespot_connect::{ConnectConfig, Spirc};
use librespot_core::authentication::Credentials;
use librespot_core::config::{DeviceType, SessionConfig};
use librespot_core::Session;
use librespot_playback::audio_backend::{Sink, SinkResult};
use librespot_playback::config::PlayerConfig;
use librespot_playback::convert::Converter;
use librespot_playback::decoder::AudioPacket;
use librespot_playback::mixer::softmixer::SoftMixer;
use librespot_playback::mixer::{Mixer, MixerConfig};
use librespot_playback::player::Player;
use tokio::runtime::Runtime;
use tokio::task::JoinHandle;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

// Spotify streams 44.1 kHz stereo; the discard sink paces itself to that rate so the player
// keeps the track's real timing and does not run to the end of it in seconds.
const SAMPLE_RATE: f64 = 44_100.0;
const CHANNELS: f64 = 2.0;

/// Consumes decoded audio at real-time speed and drops it. Replaced by the AAudio sink in #198.
struct DiscardSink;

impl Sink for DiscardSink {
    fn write(&mut self, packet: AudioPacket, _converter: &mut Converter) -> SinkResult<()> {
        if let Ok(samples) = packet.samples() {
            let seconds = samples.len() as f64 / (SAMPLE_RATE * CHANNELS);
            thread::sleep(Duration::from_secs_f64(seconds));
        }
        Ok(())
    }
}

struct Live {
    session: Session,
    spirc: Spirc,
    task: JoinHandle<()>,
}

static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static LIVE: Mutex<Option<Live>> = Mutex::new(None);

fn runtime() -> Result<&'static Runtime, String> {
    if let Some(runtime) = RUNTIME.get() {
        return Ok(runtime);
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("could not start the runtime: {error}"))?;
    Ok(RUNTIME.get_or_init(|| runtime))
}

/// Logs in with `access_token` and registers the device as `name`. Blocks until the session is
/// up or fails. Replaces any session that is already running.
pub fn start(access_token: &str, name: &str) -> Result<(), String> {
    stop();
    let runtime = runtime()?;
    let credentials = Credentials::with_access_token(access_token);

    let live = runtime.block_on(async {
        tokio::time::timeout(CONNECT_TIMEOUT, async {
            let session = Session::new(SessionConfig::default(), None);
            session
                .connect(credentials.clone(), false)
                .await
                .map_err(|error| format!("Spotify login failed: {error}"))?;

            let mixer: std::sync::Arc<dyn Mixer> = std::sync::Arc::new(
                SoftMixer::open(MixerConfig::default())
                    .map_err(|error| format!("could not open the mixer: {error}"))?,
            );
            let player = Player::new(
                PlayerConfig::default(),
                session.clone(),
                mixer.get_soft_volume(),
                || Box::new(DiscardSink),
            );

            let config = ConnectConfig {
                name: name.to_owned(),
                device_type: DeviceType::Tv,
                ..ConnectConfig::default()
            };
            let (spirc, task) = Spirc::new(config, session.clone(), credentials, player, mixer)
                .await
                .map_err(|error| format!("could not register the device: {error}"))?;

            Ok::<Live, String>(Live {
                session,
                spirc,
                task: tokio::spawn(task),
            })
        })
        .await
        .map_err(|_| "Spotify did not answer in time".to_owned())?
    })?;

    *LIVE
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())? = Some(live);
    Ok(())
}

/// Shuts the running session down, if any. The device disappears from the phone's list.
pub fn stop() {
    let Ok(mut guard) = LIVE.lock() else { return };
    if let Some(live) = guard.take() {
        let _ = live.spirc.shutdown();
        live.session.shutdown();
        live.task.abort();
    }
}

/// False once the session has dropped its connection or the Connect task has ended.
pub fn is_alive() -> bool {
    let Ok(guard) = LIVE.lock() else { return false };
    guard
        .as_ref()
        .is_some_and(|live| !live.session.is_invalid() && !live.task.is_finished())
}
