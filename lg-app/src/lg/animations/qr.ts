import type {
  AnimationFrame,
  AnimationPhaseState,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { roundRect } from "../../utils/canvas.js";

const INTRO_MS = 1400;
const OUTRO_MS = 1000;
const DROP = 210;
const SCREEN_CENTER_X = 200;
const QR_SIZE = 112;
const QR_TOP = 20;
// Device pixels per scene unit at the TV's 1080p render, so QR edges land on whole pixels.
const HD_SCALE = 4.8;
const TAU = Math.PI * 2;

function easeOutBack(progress: number): number {
  return 1 + 2 * Math.pow(progress - 1, 3) + Math.pow(progress - 1, 2);
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

/**
 * The login QR on the projector screen: it drops from above during the intro, sways while it hangs,
 * and rolls back up during the outro.
 */
export class QrAnimation extends BaseAnimation<CanvasContext> {
  private readonly modules: boolean[][];

  constructor(modules: boolean[][]) {
    super(INTRO_MS, OUTRO_MS);
    this.modules = modules;
  }

  protected override draw(
    { ctx, elapsedMs }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    ctx.save();
    ctx.translate(0, this.offsetAt(state, elapsedMs / 1000));
    this.drawScreen(ctx);
    ctx.restore();
  }

  private offsetAt(state: AnimationPhaseState, seconds: number): number {
    switch (state.phase) {
      case "intro":
        return -DROP * (1 - easeOutBack(state.elapsedInPhaseMs / INTRO_MS));
      case "loop":
        return Math.sin(seconds * 1.1) * 0.8;
      case "outro":
        return -DROP * easeInCubic(state.elapsedInPhaseMs / OUTRO_MS);
      case "done":
        return -DROP;
    }
  }

  private drawScreen(ctx: CanvasContext): void {
    ctx.beginPath();
    ctx.moveTo(142, -300);
    ctx.lineTo(142, 0);
    ctx.moveTo(258, -300);
    ctx.lineTo(258, 0);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#aab4bb";
    ctx.stroke();

    roundRect(ctx, 96, -5, 208, 11, 5.5);
    ctx.fillStyle = "#8a949c";
    ctx.fill();

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(105, 6, 190, 162);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#dfe5e9";
    ctx.strokeRect(105, 6, 190, 162);

    this.drawModules(ctx);

    ctx.fillStyle = "#44505a";
    ctx.font = "600 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Scan to log in", SCREEN_CENTER_X, 152);

    roundRect(ctx, 105, 164, 190, 6, 3);
    ctx.fillStyle = "#aab4bb";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(SCREEN_CENTER_X, 170);
    ctx.lineTo(SCREEN_CENTER_X, 182);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#aab4bb";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(SCREEN_CENTER_X, 185, 3.5, 0, TAU);
    ctx.fillStyle = "#c9a36a";
    ctx.fill();
  }

  private drawModules(ctx: CanvasContext): void {
    const rows = this.modules.length;
    const columns = this.modules[0]?.length ?? 0;
    if (rows === 0 || columns === 0) return;

    const cell = QR_SIZE / Math.max(rows, columns);
    const left = SCREEN_CENTER_X - (columns * cell) / 2;
    const top = QR_TOP + (QR_SIZE - rows * cell) / 2;
    const snap = (value: number) => Math.round(value * HD_SCALE);

    ctx.fillStyle = "#111111";
    this.modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (!dark) return;
        const x0 = snap(left + x * cell);
        const x1 = snap(left + (x + 1) * cell);
        const y0 = snap(top + y * cell);
        const y1 = snap(top + (y + 1) * cell);
        ctx.fillRect(
          x0 / HD_SCALE,
          y0 / HD_SCALE,
          (x1 - x0) / HD_SCALE,
          (y1 - y0) / HD_SCALE,
        );
      });
    });
  }
}
