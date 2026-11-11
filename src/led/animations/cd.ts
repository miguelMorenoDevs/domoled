import type { Image } from "@napi-rs/canvas";
import type {
  AnimationFrame,
  CdTimingConfig,
  LedAnimation,
  TrackData,
} from "../types.js";

export const DEFAULT_CD_TIMING: CdTimingConfig = {
  introDurationMs: 2000,
  outroDurationMs: 5000,
};

/**
 * The spinning CD: album art on a silver disc, with a slide-in intro and a fade-out outro.
 */
export class CdAnimation implements LedAnimation {
  private art: Image | null = null;
  private durationMs: number = 0;
  private timing: CdTimingConfig;

  constructor(timing: CdTimingConfig = DEFAULT_CD_TIMING) {
    this.timing = timing;
  }

  onLoad(track: TrackData, art: Image): void {
    this.art = art;
    this.durationMs = track.durationMs;
  }

  onExit(): void {
    this.art = null;
  }

  render({ ctx, width, height, elapsedMs: elapsed }: AnimationFrame): void {
    const art = this.art;
    if (!art) return;

    // --- 1. Sizing Math ---
    // Create a 6-pixel padding so the CD isn't touching the edges
    const padding = 6;
    const cdRadius = width / 2 - padding;

    let yPos = height / 2;
    const xPos = width / 2;
    let opacity = 1.0;

    const rotation = (elapsed / 1000) * (Math.PI / 2);
    let floatOffset = 0;

    const { introDurationMs, outroDurationMs } = this.timing;

    // --- 2. Timings & Position Math ---
    if (elapsed < introDurationMs) {
      const progress = elapsed / introDurationMs;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const startY = height + cdRadius * 2; // Start below the screen
      yPos = startY - (startY - height / 2) * easeOut;
    } else if (elapsed > this.durationMs - outroDurationMs) {
      const timeInOutro = elapsed - (this.durationMs - outroDurationMs);
      const progress = Math.min(1, timeInOutro / outroDurationMs);
      opacity = Math.max(0, 1 - progress);
      floatOffset = Math.sin(elapsed / 500) * 1.5;
    } else {
      floatOffset = Math.sin(elapsed / 500) * 1.5;
    }

    yPos += floatOffset;

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
