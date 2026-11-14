import type { Rgb } from "./color.js";

export interface SkySnapshot {
  skyTop: string;
  skyBottom: string;
  hillFar: string;
  hillNear: string;
  ground: string;
  groundEdge: string;
  cloud: string;
  /** 0 = full day, 1 = deepest night; darkens the whole scene. */
  night: number;
  /** 0..1 star visibility; the scene adds the twinkle. */
  stars: number;
  isDay: boolean;
  /** Sun or moon centre, as fractions of the scene width and height. */
  bodyX: number;
  bodyY: number;
  bodyColor: string;
  glowColor: string;
  glowOpacity: number;
}

// The palette keyframes and sun path of the TV scene's reference, in a 400x225 stage.
const REFERENCE_WIDTH = 400;
const REFERENCE_HEIGHT = 225;
const DAY_START = 5.5;
const DAY_END = 18.5;
const SUN_CORE = "#fff4b8";
const SUNSET_CORE = "#ffa56b";
const GLOW = "#fff3c9";
const SUNSET_GLOW = "#ff9a5c";
const MOON_CORE = "#f4f1de";
const MOON_GLOW = "#becdff";

interface SkyKeyframe {
  hour: number;
  // Top, bottom, far hill, near hill, ground, ground edge, cloud.
  colors: readonly [string, string, string, string, string, string, string];
  night: number;
}

const KEYFRAMES: readonly SkyKeyframe[] = [
  {
    hour: 0,
    colors: [
      "#0b1233",
      "#1c2750",
      "#1d3a3a",
      "#17302f",
      "#1b3a2c",
      "#24493a",
      "#4a5580",
    ],
    night: 0.4,
  },
  {
    hour: 5,
    colors: [
      "#1c2552",
      "#5a5f93",
      "#2b4a4a",
      "#223f3d",
      "#27503a",
      "#31604a",
      "#7c82ad",
    ],
    night: 0.32,
  },
  {
    hour: 6.5,
    colors: [
      "#f08a6b",
      "#ffd2a0",
      "#a8b98a",
      "#8fae7f",
      "#76b36b",
      "#8fc77c",
      "#ffe3d0",
    ],
    night: 0.08,
  },
  {
    hour: 9,
    colors: [
      "#7fc3ee",
      "#dff3fb",
      "#a9d8a4",
      "#8ccb88",
      "#7cc47a",
      "#93d68d",
      "#ffffff",
    ],
    night: 0,
  },
  {
    hour: 13,
    colors: [
      "#6fb9ec",
      "#d9f1fb",
      "#a4d59f",
      "#87c883",
      "#78c276",
      "#8fd488",
      "#ffffff",
    ],
    night: 0,
  },
  {
    hour: 17,
    colors: [
      "#8fb7e3",
      "#ffe3b8",
      "#b5cf92",
      "#9bc27c",
      "#7ab668",
      "#92c978",
      "#fff1dc",
    ],
    night: 0.03,
  },
  {
    hour: 19,
    colors: [
      "#e8745f",
      "#ffb98a",
      "#9a9a78",
      "#7f9468",
      "#5f9a58",
      "#78ad66",
      "#ffd2b8",
    ],
    night: 0.14,
  },
  {
    hour: 21,
    colors: [
      "#2a2f66",
      "#6a5f93",
      "#34505a",
      "#2b4549",
      "#2f5c42",
      "#3a6d51",
      "#8b8bb8",
    ],
    night: 0.32,
  },
  {
    hour: 24,
    colors: [
      "#0b1233",
      "#1c2750",
      "#1d3a3a",
      "#17302f",
      "#1b3a2c",
      "#24493a",
      "#4a5580",
    ],
    night: 0.4,
  },
];

const STOPS = KEYFRAMES.map((keyframe) => ({
  hour: keyframe.hour,
  colors: keyframe.colors.map(hexToRgb),
  night: keyframe.night,
}));

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function mix(from: Rgb, to: Rgb, progress: number): string {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * progress);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Sky, hills, ground and sun/moon for the hour of the day (local, 0..24). The palette is
 * interpolated between keyframes, and the sun or moon follows a half-circle above the horizon.
 */
export function skyAt(hour: number): SkySnapshot {
  const h = ((hour % 24) + 24) % 24;
  let index = 0;
  while (index < STOPS.length - 2 && h >= STOPS[index + 1]!.hour) index++;

  const from = STOPS[index]!;
  const to = STOPS[index + 1]!;
  const progress = (h - from.hour) / (to.hour - from.hour);
  const color = (slot: number): string =>
    mix(from.colors[slot]!, to.colors[slot]!, progress);

  const night = from.night + (to.night - from.night) * progress;
  const isDay = h >= DAY_START && h < DAY_END;
  const arc = isDay ? (h - 6) / 12 : ((((h - 18) % 24) + 24) % 24) / 12;
  const height = Math.sin(Math.PI * arc);
  const low = 1 - Math.sin(Math.PI * clamp01(arc));

  return {
    skyTop: color(0),
    skyBottom: color(1),
    hillFar: color(2),
    hillNear: color(3),
    ground: color(4),
    groundEdge: color(5),
    cloud: color(6),
    night,
    stars: clamp01((night - 0.1) / 0.25),
    isDay,
    bodyX: (40 + arc * 320) / REFERENCE_WIDTH,
    bodyY: (150 - height * (isDay ? 110 : 105)) / REFERENCE_HEIGHT,
    bodyColor: isDay
      ? mix(hexToRgb(SUN_CORE), hexToRgb(SUNSET_CORE), low)
      : MOON_CORE,
    glowColor: isDay
      ? mix(hexToRgb(GLOW), hexToRgb(SUNSET_GLOW), low)
      : MOON_GLOW,
    glowOpacity: isDay ? 1 : 0.45,
  };
}
