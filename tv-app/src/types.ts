// Global declarations only: the app is one classic script (see tsconfig.json), so nothing is exported.

// Defined by config.js, which loads before app.js.
declare var LED_SERVER_URL: string;

interface TrackData {
  title: string;
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

// Mirrors SpotifyStatus in src/spotify/types/api.ts on the server, for the fields the TV reads; keep the two in sync.
interface SpotifyStatus {
  activeUser: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

// Mirrors LoggedUser in src/spotify/types/api.ts on the server; keep the two in sync.
interface LoggedUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Mirrors LoginQr in src/spotify/types/api.ts on the server; keep the two in sync.
interface LoginQr {
  url: string;
  modules: boolean[][];
}

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

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The CD colours derived from the album art; see artPalette() in utils/color.ts. */
interface ArtPalette {
  main: Rgb;
  deep: Rgb;
  light: Rgb;
  opposite: Rgb;
  oppositeDeep: Rgb;
}

/** A rectangle in stage units (400x225). */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A control a remote can select. `key` keeps the selection across redraws. */
interface FocusTarget {
  key: string;
  box: Box;
}
