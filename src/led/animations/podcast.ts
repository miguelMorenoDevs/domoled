import { createCanvas } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import type { CanvasContext, TrackData } from "../types.js";
import type {
  AnimationFrame,
  AnimationPhaseState,
} from "../../animator/types.js";
import { BaseAnimation } from "../../animator/base.js";
import { DEFAULT_CD_TIMING } from "../../animator/timing.js";
import { dominantColor } from "../../utils/color.js";
import { lerp } from "../../utils/math.js";

const SAMPLE_SIZE = 16;
const SHADOW_BRIGHTNESS = 0.25;
const SHADOW_MAX_RISE = 0.55;
const WAVE_AMPLITUDE = 4;

/**
 * A podcast episode: the artwork, with a dark shadow tinted from the artwork's dominant colour that
 * rises from the bottom edge, ripples across the matrix and sinks back. Same intro, loop and outro as the CD.
 * At the end of the episode it holds its last frame until the poller calls exit().
 */
export class PodcastAnimation extends BaseAnimation<CanvasContext> {
  private readonly art: Image;
  private readonly shadowColor: string;

  constructor(track: TrackData, art: Image) {
    super(
      DEFAULT_CD_TIMING.introDurationMs,
      DEFAULT_CD_TIMING.outroDurationMs,
      track.durationMs,
    );
    this.art = art;

    const sample = createCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const sampleCtx = sample.getContext("2d");
    sampleCtx.drawImage(art, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { r, g, b } = dominantColor(
      sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
    );
    const shade = (channel: number) => Math.round(channel * SHADOW_BRIGHTNESS);
    this.shadowColor = `rgb(${shade(r)}, ${shade(g)}, ${shade(b)})`;
  }

  protected draw(
    { ctx, width, height, elapsedMs: elapsed }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.art, 0, 0, width, height);

    const rise = this.riseAt(state);
    if (rise <= 0) return;

    const top = height - rise * height * SHADOW_MAX_RISE;
    const amplitude = WAVE_AMPLITUDE * rise;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x++) {
      const wave = Math.sin((x / width) * Math.PI * 3 + elapsed / 600);
      ctx.lineTo(x, top + amplitude * wave);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = this.shadowColor;
    ctx.fill();
  }

  /** 0 = below the matrix, 1 = fully risen. Eases in during the intro and out during the outro. */
  private riseAt(state: AnimationPhaseState): number {
    if (state.phase === "intro") {
      const progress =
        state.elapsedInPhaseMs / DEFAULT_CD_TIMING.introDurationMs;
      return 1 - Math.pow(1 - progress, 3);
    }
    if (state.phase === "outro") {
      const progress =
        state.elapsedInPhaseMs / DEFAULT_CD_TIMING.outroDurationMs;
      return lerp(1, 0, progress);
    }
    return 1;
  }
}
