export function parseRetryAfter(res: Response): number | undefined {
  const value = res.headers.get("retry-after");
  if (value === null) return undefined;

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
