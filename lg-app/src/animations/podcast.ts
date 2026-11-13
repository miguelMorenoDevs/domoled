const PODCAST_SAMPLE_SIZE = 16;
const PODCAST_SHADOW_BRIGHTNESS = 0.25;
const PODCAST_SHADOW_MAX_RISE = 0.55;
const PODCAST_WAVE_AMPLITUDE = 4;

/**
 * A podcast episode: the artwork, with a dark shadow tinted from the artwork's dominant colour that
 * rises from the bottom edge, ripples across the matrix and sinks back. Same intro, loop and outro as the CD.
 * The outro starts at the end of the episode unless exit() ends it earlier.
 */
class PodcastAnimation extends BaseLedAnimation {
  private readonly art: HTMLImageElement;
  private readonly durationMs: number;
  private readonly shadowColor: string;

  constructor(track: TrackData, art: HTMLImageElement) {
    super(DEFAULT_CD_TIMING.introDurationMs, DEFAULT_CD_TIMING.outroDurationMs);
    this.art = art;
    this.durationMs = track.durationMs;

    const sample = document.createElement("canvas");
    sample.width = PODCAST_SAMPLE_SIZE;
    sample.height = PODCAST_SAMPLE_SIZE;
    const sampleCtx = sample.getContext("2d")!;
    sampleCtx.drawImage(art, 0, 0, PODCAST_SAMPLE_SIZE, PODCAST_SAMPLE_SIZE);
    const { r, g, b } = dominantColor(
      sampleCtx.getImageData(0, 0, PODCAST_SAMPLE_SIZE, PODCAST_SAMPLE_SIZE)
        .data,
    );
    const shade = (channel: number) =>
      Math.round(channel * PODCAST_SHADOW_BRIGHTNESS);
    this.shadowColor = `rgb(${shade(r)}, ${shade(g)}, ${shade(b)})`;
  }

  protected override scheduledExitMs(): number {
    return this.durationMs - DEFAULT_CD_TIMING.outroDurationMs;
  }

  protected draw(
    { ctx, width, height, elapsedMs: elapsed }: AnimationFrame,
    state: AnimationPhaseState,
  ): void {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.art, 0, 0, width, height);

    const rise = this.riseAt(state);
    if (rise <= 0) return;

    const top = height - rise * height * PODCAST_SHADOW_MAX_RISE;
    const amplitude = PODCAST_WAVE_AMPLITUDE * rise;
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
