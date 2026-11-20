import { LgAnimator } from "./lg/animator.js";
import { holdScreenSaver } from "./lg/screensaver.js";

// The Fire TV dream loads index.html?passive=1; the app and the browser preview load index.html.
const passive =
  new URLSearchParams(window.location.search).get("passive") === "1";
const animator = new LgAnimator(
  document.getElementById("screen") as HTMLCanvasElement,
  passive,
);
holdScreenSaver();

// Only the newest track's art is played; an older one still loading is dropped.
let pendingArt: HTMLImageElement | null = null;

function loadTrack(track: TrackData, positionMs: number): void {
  const art = new Image();
  pendingArt = art;
  art.onload = () => {
    if (pendingArt === art) animator.play(art, track, positionMs);
  };
  art.onerror = () => {
    if (pendingArt === art) animator.startIdle();
  };
  art.crossOrigin = "anonymous";
  art.src = track.imageUrl;
}

async function refreshProfile(): Promise<void> {
  try {
    const res = await fetch(LED_SERVER_URL + "/spotify/status", {
      cache: "no-store",
    });
    animator.setProfile((await res.json()) as SpotifyStatus);
  } catch {
    // Keep the last picture; the next poll retries.
  }
}
refreshProfile();
window.setInterval(refreshProfile, 5000);

const CONNECTION_ERROR = "Cannot reach the LED server.";
// Without this, a stream that never opens leaves the TV black.
const startupTimer = window.setTimeout(
  () => animator.showError(CONNECTION_ERROR),
  3000,
);

const source = new EventSource(LED_SERVER_URL + "/led/state");
source.onerror = () => animator.showError(CONNECTION_ERROR);
source.onmessage = (event) => {
  window.clearTimeout(startupTimer);
  animator.setOffline(false);
  const state = JSON.parse(event.data) as ScreenState;
  pendingArt = null;
  if (state.kind === "track") loadTrack(state.track, state.positionMs);
  else if (state.kind === "qr") void animator.showQr(state.modules);
  else if (state.kind === "error") animator.showError(state.message);
  else animator.startIdle();
};
