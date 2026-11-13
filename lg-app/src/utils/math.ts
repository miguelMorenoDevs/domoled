export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
