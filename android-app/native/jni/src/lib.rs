//! The native half of the Fire TV app. One symbol for now: the app logs which librespot it
//! ships, so the build proves the whole dependency tree links for the device ABI. The Connect
//! session arrives in #196 and the AAudio sink in #198.

use jni::objects::JObject;
use jni::sys::jstring;
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
