/** Which record a lap of the rotation shows. A bad lap is the first, and the list repeats. */
export function lookAt<T>(looks: readonly T[], lap: number): T {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % looks.length : 0;
  return looks[index]!;
}
