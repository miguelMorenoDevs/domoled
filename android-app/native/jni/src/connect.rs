//! The Spotify Connect device: one session, registered as a TV, that plays through the AAudio sink.
//! The access token comes from the server (`GET /spotify/stream-token`) and is only used to log
//! in; the session keeps its own connection afterwards.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use librespot_connect::{ConnectConfig, Spirc};
use librespot_core::authentication::Credentials;
use librespot_core::config::{DeviceType, SessionConfig};
use librespot_core::Session;
use librespot_playback::config::PlayerConfig;
use librespot_playback::mixer::softmixer::SoftMixer;
use librespot_playback::mixer::{Mixer, MixerConfig};
use librespot_playback::player::{Player, PlayerEvent};
use tokio::runtime::Runtime;
use tokio::task::JoinHandle;

use crate::sink::AaudioSink;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// The action codes the Kotlin `Librespot` object sends. Keep in sync with `Librespot.kt`.
pub const ACTION_PLAY: i32 = 0;
pub const ACTION_PAUSE: i32 = 1;
pub const ACTION_PLAY_PAUSE: i32 = 2;
pub const ACTION_NEXT: i32 = 3;
pub const ACTION_PREVIOUS: i32 = 4;

struct Live {
    session: Session,
    spirc: Spirc,
    task: JoinHandle<()>,
    events: JoinHandle<()>,
}

static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static LIVE: Mutex<Option<Live>> = Mutex::new(None);
static PLAYING: AtomicBool = AtomicBool::new(false);

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

/// Logs in with `access_token` and registers the device as `name`. `client_id` is the one that
/// minted the token: login5 only accepts a stored credential presented by its own client. Blocks
/// until the session is up or fails. Replaces any session that is already running.
pub fn start(access_token: &str, client_id: &str, name: &str) -> Result<(), String> {
    stop();
    let runtime = runtime()?;
    let credentials = Credentials::with_access_token(access_token);

    let live = runtime.block_on(async {
        tokio::time::timeout(CONNECT_TIMEOUT, async {
            // Spirc::new logs in with these credentials; connecting here as well makes its own
            // connect fail with "Session is not connected" and the device never registers.
            let session = Session::new(
                SessionConfig {
                    client_id: client_id.to_owned(),
                    ..SessionConfig::default()
                },
                None,
            );

            let mixer: std::sync::Arc<dyn Mixer> = std::sync::Arc::new(
                SoftMixer::open(MixerConfig::default())
                    .map_err(|error| format!("could not open the mixer: {error}"))?,
            );
            let player = Player::new(
                PlayerConfig::default(),
                session.clone(),
                mixer.get_soft_volume(),
                || Box::new(AaudioSink::open()),
            );
            let mut player_events = player.get_player_event_channel();
            let events = tokio::spawn(async move {
                while let Some(event) = player_events.recv().await {
                    match event {
                        PlayerEvent::Playing { .. } => PLAYING.store(true, Ordering::SeqCst),
                        PlayerEvent::Paused { .. }
                        | PlayerEvent::Stopped { .. }
                        | PlayerEvent::EndOfTrack { .. } => PLAYING.store(false, Ordering::SeqCst),
                        _ => {}
                    }
                }
            });

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
                events,
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
        live.events.abort();
    }
    PLAYING.store(false, Ordering::SeqCst);
}

/// Plays, pauses, skips. A no-op when no session is running.
pub fn control(action: i32) {
    let Ok(guard) = LIVE.lock() else { return };
    let Some(live) = guard.as_ref() else { return };
    match action {
        ACTION_PLAY => {
            let _ = live.spirc.play();
        }
        ACTION_PAUSE => {
            let _ = live.spirc.pause();
        }
        ACTION_PLAY_PAUSE => {
            let _ = live.spirc.play_pause();
        }
        ACTION_NEXT => {
            let _ = live.spirc.next();
        }
        ACTION_PREVIOUS => {
            let _ = live.spirc.prev();
        }
        _ => {}
    }
}

/// True while the player reports a track playing.
pub fn is_playing() -> bool {
    PLAYING.load(Ordering::SeqCst)
}

/// False once the session has dropped its connection or the Connect task has ended.
pub fn is_alive() -> bool {
    let Ok(guard) = LIVE.lock() else { return false };
    guard
        .as_ref()
        .is_some_and(|live| !live.session.is_invalid() && !live.task.is_finished())
}
