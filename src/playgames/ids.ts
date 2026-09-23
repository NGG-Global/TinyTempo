/**
 * A Play Games item id — a leaderboard's or an achievement's — as the game will use it, or
 * null. The Console generates them from URL-safe characters (`CgkI…`). An all-digit value
 * is the Games *project* id pasted into the wrong field, which fails on every call, so it is
 * refused here. Deeper checking (that the id names this project) is observed rather than
 * documented, so it lives in `scripts/check-android-config.mjs` as a warning, not here.
 */
export function playGamesId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || /^\d+$/.test(id)) return null;
  return id;
}
