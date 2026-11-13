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

const source = new EventSource(LED_SERVER_URL + "/led/state");
source.onmessage = (event) => {
  const state = JSON.parse(event.data) as ScreenState;
  pendingArt = null;
  if (state.kind === "track") loadTrack(state.track, state.positionMs);
  else if (state.kind === "qr") animator.showQr(state.modules);
  else animator.startIdle();
};
