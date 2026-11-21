import { STAGE_HEIGHT, STAGE_WIDTH } from "./scene.js";

const PANEL_WIDTH = 240;
const PANEL_TOP = 38;
const PANEL_BOTTOM = STAGE_HEIGHT - 10;
const MAX_ROW_HEIGHT = 30;
const ROW_GAP = 3;
const CLOSE_BOX: Box = { x: STAGE_WIDTH - 66, y: 8, width: 58, height: 20 };
const ADD_BOX: Box = { x: 8, y: 8, width: 58, height: 20 };
const ACTIVE_COLOR = "#1db954";

function inside(box: Box, x: number, y: number): boolean {
  return (
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height
  );
}

/**
 * The account list drawn over the scene when the viewer clicks the profile badge. Clicking a row
 * switches the active user; Add user starts a login, Close, or the badge again, returns to the
 * animation.
 */
export class UserScreen {
  private readonly onChange: () => void;
  private readonly onAddUser: () => void;
  private open = false;
  private users: LoggedUser[] = [];
  private activeId: string | null = null;
  private notice = "";
  private readonly avatars = new Map<string, HTMLImageElement>();

  constructor(onChange: () => void, onAddUser: () => void) {
    this.onChange = onChange;
    this.onAddUser = onAddUser;
  }

  isOpen(): boolean {
    return this.open;
  }

  setActiveId(activeId: string | null): void {
    if (this.activeId === activeId) return;
    this.activeId = activeId;
    if (this.open) this.onChange();
  }

  toggle(): void {
    if (this.open) this.close();
    else void this.show();
  }

  /** Takes a click in stage units. Does nothing while the screen is closed. */
  handleClick(x: number, y: number): void {
    if (!this.open) return;
    if (inside(CLOSE_BOX, x, y)) {
      this.close();
      return;
    }
    if (inside(ADD_BOX, x, y)) {
      this.onAddUser();
      return;
    }
    const row = this.layout().find((r) => inside(r.box, x, y));
    if (row) void this.switchTo(row.user.id);
  }

  /** The controls a remote can select, in arrow order. Empty while the list is closed. */
  focusTargets(): FocusTarget[] {
    if (!this.open) return [];
    return [
      { key: "add", box: ADD_BOX },
      ...this.layout().map(({ user, box }) => ({
        key: `user:${user.id}`,
        box,
      })),
      { key: "close", box: CLOSE_BOX },
    ];
  }

  /** The row of the active user, or Add user when no account is logged in. */
  defaultFocusKey(): string {
    return this.users.some((user) => user.id === this.activeId)
      ? `user:${this.activeId}`
      : "add";
  }

  /** Draws over the stage; the caller draws the profile badge after it so the badge stays on top. */
  draw(ctx: CanvasContext): void {
    if (!this.open) return;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Accounts", STAGE_WIDTH / 2, 18);

    for (const [box, label] of [
      [ADD_BOX, "Add user"],
      [CLOSE_BOX, "Close"],
    ] as const) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.font = "bold 10px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2);
    }

    const rows = this.layout();
    if (rows.length === 0) {
      ctx.font = "12px sans-serif";
      ctx.fillText(this.notice, STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
    }
    for (const { user, box } of rows) this.drawRow(ctx, user, box);
    ctx.restore();
  }

  /** Opens the list and loads the accounts. */
  async show(): Promise<void> {
    this.open = true;
    this.users = [];
    this.notice = "Loading accounts...";
    this.onChange();
    try {
      const res = await fetch(LED_SERVER_URL + "/spotify/users", {
        cache: "no-store",
        headers: { "X-TV-Token": TV_TOKEN },
      });
      this.users = (await res.json()) as LoggedUser[];
      this.notice = "No accounts logged in.";
    } catch {
      this.notice = "Cannot load accounts.";
    }
    this.onChange();
  }

  close(): void {
    this.open = false;
    this.onChange();
  }

  private async switchTo(userId: string): Promise<void> {
    if (userId !== this.activeId) {
      try {
        const res = await fetch(LED_SERVER_URL + "/spotify/users/active", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-TV-Token": TV_TOKEN,
          },
          body: JSON.stringify({ userId }),
        });
        if (res.ok) this.activeId = userId;
      } catch {
        // The highlight stays on the current user; the next status poll corrects it.
      }
    }
    this.onChange();
  }

  private layout(): { user: LoggedUser; box: Box }[] {
    const rowHeight = Math.min(
      MAX_ROW_HEIGHT,
      (PANEL_BOTTOM - PANEL_TOP) / Math.max(this.users.length, 1),
    );
    const x = (STAGE_WIDTH - PANEL_WIDTH) / 2;
    return this.users.map((user, i) => ({
      user,
      box: {
        x,
        y: PANEL_TOP + i * rowHeight,
        width: PANEL_WIDTH,
        height: rowHeight - ROW_GAP,
      },
    }));
  }

  private drawRow(ctx: CanvasContext, user: LoggedUser, box: Box): void {
    const active = user.id === this.activeId;
    const radius = Math.min(10, box.height / 2 - 2);
    const cx = box.x + 8 + radius;
    const cy = box.y + box.height / 2;

    ctx.fillStyle = active
      ? "rgba(29, 185, 84, 0.3)"
      : "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(box.x, box.y, box.width, box.height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1c1c";
    ctx.fill();
    ctx.clip();
    const image = this.avatar(user.avatarUrl);
    if (image) {
      ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.font = `bold ${radius}px sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(this.initial(user), cx, cy + 1);
    }
    ctx.restore();

    const label = user.displayName ?? user.id;
    const textX = cx + radius + 6;
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      label,
      textX,
      cy,
      box.x + box.width - textX - (active ? 50 : 8),
    );

    if (active) {
      ctx.font = "bold 9px sans-serif";
      ctx.fillStyle = ACTIVE_COLOR;
      ctx.textAlign = "right";
      ctx.fillText("Active", box.x + box.width - 8, cy);
    }
  }

  private avatar(url: string | null): HTMLImageElement | null {
    if (!url) return null;
    let image = this.avatars.get(url);
    if (!image) {
      image = new Image();
      image.onload = () => {
        if (this.open) this.onChange();
      };
      image.crossOrigin = "anonymous";
      image.src = url;
      this.avatars.set(url, image);
    }
    return image.naturalWidth > 0 ? image : null;
  }

  private initial(user: LoggedUser): string {
    return Array.from(user.displayName?.trim() ?? "")[0]?.toUpperCase() ?? "?";
  }
}
