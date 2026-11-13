// Global declarations only: the app is one classic script (see tsconfig.json), so nothing is exported.

// Defined by config.js, which loads before app.js.
declare var LED_SERVER_URL: string;

interface TrackData {
  imageUrl: string;
  durationMs: number;
  progressMs: number;
  contentType: "track" | "episode";
}

// Mirrors AnimatorState in src/led/types.ts on the server; keep the two in sync.
type ScreenState =
  | { kind: "track"; track: TrackData; positionMs: number }
  | { kind: "idle" }
  | { kind: "qr"; modules: boolean[][] };

interface CdTimingConfig {
  introDurationMs: number;
  outroDurationMs: number;
}

interface CalicoTimingConfig {
  introJumpMs: number;
  introSettleMs: number;
  sleepMs: number;
  stretchMs: number;
  outroDurationMs: number;
}

interface AnimationFrame {
  ctx: CanvasContext;
  width: number;
  height: number;
  elapsedMs: number;
}

type CanvasContext = CanvasRenderingContext2D;

type AnimationPhase = "intro" | "loop" | "outro" | "done";

interface AnimationPhaseState {
  phase: AnimationPhase;
  elapsedInPhaseMs: number;
}

interface CatPose {
  x: number;
  jump: number;
  lie: number;
  stretch: number;
  eyesClosed: boolean;
}

interface LedAnimation {
  /** Starts the outro once the intro has ended; idempotent. */
  exit(elapsedMs: number): void;
  readonly exiting: boolean;
  /** True once the outro has ended; the animator then starts the next content. */
  readonly finished: boolean;
  /** Draws one frame into the canvas context. The animator clears the canvas first. */
  render(frame: AnimationFrame): void;
}
