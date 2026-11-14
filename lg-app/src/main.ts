import { LgAnimator } from "./lg/animator.js";

const animator = new LgAnimator(
  document.getElementById("screen") as HTMLCanvasElement,
);

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
  const state = JSON.parse(event.data) as ScreenState;
  pendingArt = null;
  if (state.kind === "track") loadTrack(state.track, state.positionMs);
  else if (state.kind === "qr") animator.showQr(state.modules);
  else if (state.kind === "error") animator.showError(state.message);
  else animator.startIdle();
};
