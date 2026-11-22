//! The native half of the Fire TV app: the Spotify Connect device (see `connect.rs`) and the AAudio
//! sink it plays through (see `sink.rs`).

mod connect;
mod sink;

use jni::objects::{JObject, JString};
use jni::sys::{jboolean, jint, jstring};
use jni::JNIEnv;
use std::ffi::CString;
use std::sync::Once;

#[link(name = "log")]
extern "C" {
    fn __android_log_write(priority: i32, tag: *const i8, text: *const i8) -> i32;
}

struct Logcat;

impl log::Log for Logcat {
    fn enabled(&self, _: &log::Metadata<'_>) -> bool {
        true
    }

    fn log(&self, record: &log::Record<'_>) {
        let priority = match record.level() {
            log::Level::Error => 6,
            log::Level::Warn => 5,
            log::Level::Info => 4,
            _ => 3,
        };
        let (Ok(tag), Ok(text)) = (
            CString::new("librespot"),
            CString::new(record.args().to_string()),
        ) else {
            return;
        };
        // SAFETY: both pointers are NUL-terminated and outlive the call.
        unsafe { __android_log_write(priority, tag.as_ptr(), text.as_ptr()) };
    }

    fn flush(&self) {}
}

static LOGGER: Logcat = Logcat;

/// librespot reports why it cannot register or play through `log`; send it to logcat once.
fn init_logging() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        if log::set_logger(&LOGGER).is_ok() {
            log::set_max_level(log::LevelFilter::Trace);
        }
    });
}

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeVersion<'local>(
    env: JNIEnv<'local>,
    _this: JObject<'local>,
) -> jstring {
    init_logging();
    let version = format!(
        "{} (librespot {})",
        env!("CARGO_PKG_VERSION"),
        librespot_core::version::SEMVER
    );
    match env.new_string(version) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Returns null when the session is up, or the reason it could not start. The token is never
/// logged or returned.
#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeStart<'local>(
    mut env: JNIEnv<'local>,
    _this: JObject<'local>,
    access_token: JString<'local>,
    device_name: JString<'local>,
) -> jstring {
    init_logging();
    let result = (|| -> Result<(), String> {
        let token: String = env
            .get_string(&access_token)
            .map_err(|error| error.to_string())?
            .into();
        let name: String = env
            .get_string(&device_name)
            .map_err(|error| error.to_string())?
            .into();
        connect::start(&token, &name)
    })();
    match result {
        Ok(()) => std::ptr::null_mut(),
        Err(reason) => match env.new_string(reason) {
            Ok(value) => value.into_raw(),
            Err(_) => std::ptr::null_mut(),
        },
    }
}

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeStop<'local>(
    _env: JNIEnv<'local>,
    _this: JObject<'local>,
) {
    connect::stop();
}

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeIsAlive<'local>(
    _env: JNIEnv<'local>,
    _this: JObject<'local>,
) -> jboolean {
    connect::is_alive() as jboolean
}

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeControl<'local>(
    _env: JNIEnv<'local>,
    _this: JObject<'local>,
    action: jint,
) {
    connect::control(action);
}

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeIsPlaying<'local>(
    _env: JNIEnv<'local>,
    _this: JObject<'local>,
) -> jboolean {
    connect::is_playing() as jboolean
}
