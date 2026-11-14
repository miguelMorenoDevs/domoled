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
  | { kind: "qr"; modules: boolean[][] }
  | { kind: "error"; message: string };

type CanvasContext = CanvasRenderingContext2D;

interface CatPose {
  x: number;
  jump: number;
  lie: number;
  stretch: number;
  eyesClosed: boolean;
}
