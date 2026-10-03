/** Types for `release-check.mjs`, which runs under plain node and is tested from TypeScript. */
export interface ReleaseMarker {
  readonly feature: string;
  readonly text: string;
  readonly source: string;
}

export interface ReleaseVerdict {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export const RELEASE_MARKERS: readonly ReleaseMarker[];

export function missingMarkers(bundle: string, markers?: readonly ReleaseMarker[]): ReleaseMarker[];

export function sourceVerdict(input: {
  readonly behind: number | null;
  readonly offlineAllowed?: boolean;
  readonly versionUncommitted?: boolean;
  readonly dirty?: readonly string[];
}): ReleaseVerdict;
