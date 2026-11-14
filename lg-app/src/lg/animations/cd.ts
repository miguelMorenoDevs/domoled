import type {
  AnimationFrame,
  AnimationPhaseState,
  CdTimingConfig,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CD_TIMING } from "../../../../src/animator/timing.js";
import { cdCurveAt } from "../../../../src/utils/cd-curve.js";

/**
 * The spinning CD: album art on a silver disc, with a slide-in intro and a fade-out outro.
 * The outro starts at the end of the track unless exit() ends it earlier.
 */
export class CdAnimation extends BaseAnimation<CanvasContext> {
  private readonly art: HTMLImageElement;
  private readonly durationMs: number;
  private readonly timing: CdTimingConfig;

  constructor(
    track: TrackData,
    art: HTMLImageElement,
    timing: CdTimingConfig = DEFAULT_CD_TIMING,
  ) {
    super(timing.introDurationMs, timing.outroDurationMs);
    this.art = art;
    this.durationMs = track.durationMs;
    this.timing = timing;
  }

  protected override scheduledExitMs(): number {
    return this.durationMs - this.timing.outroDurationMs;
  }

  protected draw(
    { ctx, width, height, elapsedMs: elapsed }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    const art = this.art;

    // --- 1. Sizing Math ---
    // Create a 6-pixel padding so the CD isn't touching the edges
    const padding = 6;
    const cdRadius = width / 2 - padding;

    const xPos = width / 2;

    const rotation = (elapsed / 1000) * (Math.PI / 2);

    // --- 2. Timings & Position Math ---
    const { opacity, offscreen } = cdCurveAt(
      state,
      this.timing.introDurationMs,
      this.timing.outroDurationMs,
    );
    const startY = height + cdRadius * 2; // Start below the screen
    let yPos = height / 2 + offscreen * (startY - height / 2);
    if (state.phase !== "intro") {
      yPos += Math.sin(elapsed / 500) * 1.5;
    }

    // --- 3. RENDER LAYERS ---
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(xPos, yPos); // Move origin to center

    ctx.save();
    ctx.rotate(rotation); // Rotate the CD

    // A. Outer Silver Rim
    ctx.beginPath();
    ctx.arc(0, 0, cdRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#b5b5ba";
    ctx.fill();

    // B. Clip and Draw the Album Art
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, cdRadius - 1.5, 0, Math.PI * 2); // Leave a 1.5px silver rim
    ctx.clip();

    const imageScale = 0.9; // 0.75 = 75% of the CD size. Adjust to taste!
    const scaledSize = cdRadius * 2 * imageScale;
    const offset = -scaledSize / 2; // Centers the smaller image
    // -------------------------

    ctx.imageSmoothingEnabled = false;

    // Use the scaled variables here
    ctx.drawImage(art, offset, offset, scaledSize, scaledSize);
    ctx.restore();

    // C. The Center Hole
    // LEDs love pure black. Instead of erasing pixels, we just paint them #000 (Off).
    const holeRadius = 4;
    ctx.beginPath();
    ctx.arc(0, 0, holeRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    // D. Subtle inner plastic ring
    ctx.beginPath();
    ctx.arc(0, 0, holeRadius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore(); // <--- STOP ROTATION HERE

    // E. Static Light Sheen
    // Reduced from 0.35 to 0.15 so it doesn't wash out the album art
    const sheenGradient = ctx.createLinearGradient(
      -cdRadius,
      -cdRadius,
      cdRadius,
      cdRadius,
    );
    sheenGradient.addColorStop(0.0, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(0.4, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)"); // The glare
    sheenGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, cdRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sheenGradient;
    ctx.fillRect(-cdRadius, -cdRadius, cdRadius * 2, cdRadius * 2);
    ctx.restore();

    ctx.restore(); // Complete Canvas Cleanup
  }
}
