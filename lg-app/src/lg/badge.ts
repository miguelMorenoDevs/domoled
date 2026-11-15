import { STAGE_HEIGHT, STAGE_WIDTH } from "./scene.js";

const RADIUS = 12;
const MARGIN = 8;

/**
 * The active user's round profile picture in the stage's bottom-right corner. Without a picture, or
 * while it loads or fails, it shows the first letter of the display name.
 */
export class ProfileBadge {
  private displayName: string | null = null;
  private avatarUrl: string | null = null;
  private image: HTMLImageElement | null = null;

  setProfile(profile: Pick<SpotifyStatus, "displayName" | "avatarUrl">): void {
    this.displayName = profile.displayName;
    if (profile.avatarUrl === this.avatarUrl) return;

    const avatarUrl = profile.avatarUrl;
    this.avatarUrl = avatarUrl;
    this.image = null;
    if (!avatarUrl) return;

    const image = new Image();
    image.onload = () => {
      if (this.avatarUrl === avatarUrl) this.image = image;
    };
    image.crossOrigin = "anonymous";
    image.src = avatarUrl;
  }

  /** Whether a stage point lands on the badge, with a little slack for the pointer. */
  contains(x: number, y: number): boolean {
    const { cx, cy } = center();
    return Math.hypot(x - cx, y - cy) <= RADIUS + 4;
  }

  /** Draws over the current transform, which the caller sets to the 400x225 stage. */
  draw(ctx: CanvasRenderingContext2D): void {
    const { cx, cy } = center();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1c1c";
    ctx.fill();
    ctx.clip();

    if (this.image) {
      const side = Math.min(this.image.width, this.image.height);
      ctx.drawImage(
        this.image,
        (this.image.width - side) / 2,
        (this.image.height - side) / 2,
        side,
        side,
        cx - RADIUS,
        cy - RADIUS,
        RADIUS * 2,
        RADIUS * 2,
      );
    } else {
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.initial(), cx, cy + 1);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  private initial(): string {
    return Array.from(this.displayName?.trim() ?? "")[0]?.toUpperCase() ?? "?";
  }
}

function center(): { cx: number; cy: number } {
  return {
    cx: STAGE_WIDTH - MARGIN - RADIUS,
    cy: STAGE_HEIGHT - MARGIN - RADIUS,
  };
}
