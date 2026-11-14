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

type CatPoseName = "sit" | "sleep" | "crouch" | "leap" | "stretch";

/** The scene cat's body parameters, all in the reference's 400x225 scene units. */
interface CatPoseParams {
  by: number;
  pitch: number;
  head: number;
  fS: number;
  hS: number;
  reach: number;
  tBase: number;
  tAmp: number;
  breath: number;
  eye: number;
}

/** Where the cat should be and which pose it should hold, for one animation phase. */
interface CatTarget {
  pose: CatPoseName;
  x: number;
  jump: number;
}

interface CdParticle {
  angle: number;
  speed: number;
  offset: number;
  radius: number;
  travel: number;
  size: number;
  color: string;
}

interface CdSparkle {
  angle: number;
  radius: number;
  color: string;
}
