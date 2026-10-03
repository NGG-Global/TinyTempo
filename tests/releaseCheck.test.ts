import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingMarkers, RELEASE_MARKERS, sourceVerdict } from '../scripts/release-check.mjs';

/**
 * The release build's own guard. 0.1.15 reached Play built from a checkout that was behind
 * main, without the timing details and everything merged with them, and nothing noticed.
 */
describe('the release check', () => {
  it('refuses a checkout that is behind main, and one that cannot be checked', () => {
    expect(sourceVerdict({ behind: 0 }).ok).toBe(true);
    const behind = sourceVerdict({ behind: 7 });
    expect(behind.ok).toBe(false);
    expect(behind.errors[0]).toContain('7 commits behind origin/main');
    expect(sourceVerdict({ behind: null }).ok).toBe(false);
    // Offline is allowed only on purpose, and still said out loud.
    const offline = sourceVerdict({ behind: null, offlineAllowed: true });
    expect(offline.ok).toBe(true);
    expect(offline.warnings).toHaveLength(1);
    // A known-behind checkout is never let through by the offline switch.
    expect(sourceVerdict({ behind: 3, offlineAllowed: true }).ok).toBe(false);
  });

  it('refuses a version that is not committed, and names other uncommitted changes', () => {
    // 0.1.15 was built from an uncommitted bump while the repository said 0.1.10.
    expect(sourceVerdict({ behind: 0, versionUncommitted: true }).ok).toBe(false);
    const dirty = sourceVerdict({ behind: 0, dirty: ['src/scenes/MenuScene.ts'] });
    expect(dirty.ok).toBe(true);
    expect(dirty.warnings[0]).toContain('src/scenes/MenuScene.ts');
  });

  it('finds a feature missing from a built bundle', () => {
    const all = RELEASE_MARKERS.map(marker => marker.text).join('\n');
    expect(missingMarkers(all)).toEqual([]);
    // The 0.1.15 bundle carried the tutorial and none of what came after it.
    const old = missingMarkers('…Count down…On the beat…');
    expect(old.map(marker => marker.feature)).toContain('Timing details on the result');
    expect(old.map(marker => marker.feature)).not.toContain('Tutorial count-in and tap-along pass');
  });

  it('checks only for text the source still writes', () => {
    for (const marker of RELEASE_MARKERS) {
      expect(readFileSync(marker.source, 'utf8'), `${marker.feature} in ${marker.source}`).toContain(marker.text);
    }
  });

  it('runs both checks around the release build, the source before it and the bundle after', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
    const release = scripts['android:sync:release']!;
    expect(release.indexOf('release-check.mjs source')).toBeGreaterThan(-1);
    expect(release.indexOf('release-check.mjs source')).toBeLessThan(release.indexOf('npm run build:release'));
    expect(release.indexOf('npm run build:release')).toBeLessThan(release.indexOf('release-check.mjs contents'));
    expect(release.indexOf('release-check.mjs contents')).toBeLessThan(release.indexOf('cap sync'));
    expect(scripts['android:bundle']).toContain('npm run android:sync:release');
  });
});
