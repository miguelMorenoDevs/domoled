//! The native half of the Fire TV app: the Spotify Connect device (see `connect.rs`). The AAudio
//! sink arrives in #198; until then the session plays into a discard sink.

mod connect;

use jni::objects::{JObject, JString};
use jni::sys::{jboolean, jstring};
use jni::JNIEnv;

#[no_mangle]
pub extern "system" fn Java_com_domo_led_Librespot_nativeVersion<'local>(
    env: JNIEnv<'local>,
    _this: JObject<'local>,
) -> jstring {
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
