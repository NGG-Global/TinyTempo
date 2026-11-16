import { loadProgress, type Progress } from './progress';
import { levelStars } from './stars';

/**
 * The keepsakes players held before the act schedule changed, kept for them.
 *
 * A keepsake is owned by three stars on the level where its act plays a given lap
 * (`game/scrapbook.ts`), and that is derived, never stored. When acts moved from eras to
 * debut levels (`vignettes/rotation.ts`), levels 10 onward changed act, so a keepsake a
 * player had earned on, say, level 28 would have moved to another level and vanished from
 * their Scrapbook. Nobody had passed level 50 at the change.
 *
 * So on the first launch of the new schedule the device records which keepsakes its save
 * owned under the old one, read from these levels, and keeps them owned from then on
 * (`keptKeepsakes`). It is the one stored fact in the Scrapbook, and it only ever adds:
 * a keepsake owned by the current rule is owned whether or not it is recorded here.
 *
 * **What it does not cover:** the record is this device's. A save code or a Saved Games
 * restore onto a device that never ran the old schedule carries the progress, so the
 * current rule's keepsakes come back, but not one held only under the old schedule.
 * Auto Backup carries the record with everything else in the WebView's storage.
 */

/** Where each keepsake was earned before the debut schedule: frozen, never edited. */
export const LEGACY_KEEPSAKE_LEVELS: Readonly<Record<string, number>> = Object.freeze({
  'hammer-lucky-nail': 1, 'window-squeegee': 2, 'bug-plum-beetle': 3, 'saw-pine-round': 4,
  'tomato-slice': 5, 'curl-coach-ribbon': 6, 'cucumber-coin': 7, 'banana-sticker': 8,
  'paper-star': 9, 'egg-painted': 10, 'bubble-square': 11, 'light-salon-switch': 12,
  'doorbell-ginger-bell': 13, 'roller-swatch': 14, 'bell-desk-bell': 15, 'balloon-red': 16,
  'stapler-note': 17, 'fisherman-lure': 18, 'scratch-record': 19, 'trombone-mouthpiece': 20,
  'clap-encore-ticket': 21, 'snare-sticks': 22, 'bongos-charm': 23, 'slushy-berry-cup': 24,
  'apple-shiny': 25, 'hammer-brass-head': 26, 'window-harbour-frame': 27, 'bug-ladybird': 28,
  'saw-cherry-round': 29, 'tomato-gold-slice': 30, 'curl-sprinter-ribbon': 31,
  'cucumber-dark-coin': 32, 'banana-green-sticker': 33, 'paper-butterfly': 34, 'egg-brown': 35,
  'bubble-pink-square': 36, 'light-kitchen-switch': 37, 'doorbell-crimson-knocker': 38,
  'roller-sage-swatch': 39, 'bell-brass-bell': 40, 'balloon-teal': 41, 'stapler-teal': 42,
  'fisherman-navy-mac': 43, 'scratch-amber-label': 44, 'trombone-silver-horn': 45,
  'clap-plum-cuffs': 46, 'snare-blue-shell': 47, 'bongos-walnut': 48, 'slushy-blue-cup': 49,
  'apple-pear': 50, 'barber-pole': 51, 'popcorn-butter-bowl': 52, 'toothbrush-teal': 53,
  'barber-ginger-lock': 79, 'popcorn-cinema-tub': 80, 'toothbrush-berry-paste': 81,
  'paintbrush-studio': 107, 'paintbrush-sail': 136, 'nose-tissue-box': 165, 'dish-sponge': 166,
  'nose-pocket-tissue': 196, 'dish-glass': 197, 'prospector-nugget': 227,
  'prospector-diamond': 259, 'icecream-cone': 291, 'icecream-pop': 324, 'frog-pond-frog': 357,
  'glasses-party-flute': 358, 'frog-firefly-jar': 392, 'glasses-lemonade': 393,
});

const KEY = 'tiny-tempo.keepsakes.v1';

interface KeptRecordV1 {
  readonly version: 1;
  /** Keepsake ids owned under the old schedule when this device first ran the new one. */
  readonly kept: readonly string[];
}

/** The keepsakes a save owned under the old schedule, by id. Pure. */
export function legacyOwned(progress: Progress): readonly string[] {
  return Object.entries(LEGACY_KEEPSAKE_LEVELS)
    .filter(([, level]) => levelStars(progress, level) === 3)
    .map(([id]) => id);
}

/** A stored record, validated: known ids only, each once. Null for anything else. */
export function parseKept(raw: string | null): ReadonlySet<string> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { version, kept } = parsed as { version?: unknown; kept?: unknown };
    if (version !== 1 || !Array.isArray(kept)) return null;
    return new Set(kept.filter((id): id is string => typeof id === 'string' && id in LEGACY_KEEPSAKE_LEVELS));
  } catch {
    return null;
  }
}

const memo = new WeakMap<Storage, ReadonlySet<string>>();
const NONE: ReadonlySet<string> = new Set();

/**
 * The keepsakes this device keeps from before the debut schedule. Read once per storage
 * and remembered, since the record never changes once written. The first call on a device
 * without a record takes it, from the save as it stands: that is the first launch of this
 * build, before a level has been played on the new schedule, because the title screen
 * asks on its first frame. A damaged record is read as empty and never rewritten, so a
 * repair cannot be mistaken for a first launch and grant keepsakes the save did not hold
 * on the old schedule.
 */
export function keptKeepsakes(storage: Storage | null = safeStorage(), progress: () => Progress = () => loadProgress(storage)): ReadonlySet<string> {
  if (!storage) return NONE;
  const remembered = memo.get(storage);
  if (remembered) return remembered;
  let kept: ReadonlySet<string>;
  let raw: string | null;
  try { raw = storage.getItem(KEY); } catch { return NONE; }
  if (raw === null) {
    kept = new Set(legacyOwned(progress()));
    const record: KeptRecordV1 = { version: 1, kept: [...kept] };
    try { storage.setItem(KEY, JSON.stringify(record)); } catch { /* kept for this session only */ }
  } else {
    kept = parseKept(raw) ?? NONE;
  }
  memo.set(storage, kept);
  return kept;
}

/**
 * Reset progress: the kept keepsakes were the save's, and the save is gone. The memo is
 * forgotten with the record, so the next read does not answer from before the reset — and
 * does not take a new baseline either, since the save it would read is now empty.
 */
export function clearKeptKeepsakes(storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false;
  memo.delete(storage);
  try { storage.removeItem(KEY); return true; } catch { return false; }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
