export interface MatrixDimensions {
  rows: 16 | 32 | 64;
  cols: 16 | 32 | 64;
}

export interface AnimatorConfig {
  fps?: number;
  introDurationMs?: number;
  outroDurationMs?: number;
  matrixDimensions?: MatrixDimensions;
}

export interface TrackData {
  imageUrl: string;
  durationMs: number;
}
