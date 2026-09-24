import { ARRANGEMENT_CYCLE, type ArrangementId } from '../config/music';
import { ROTATION } from '../vignettes/registry';

/** Music chapters preserve the requested 25-level ranges even as new acts are added.
 * The original rotation era owns that length; visual laps count each act's appearances
 * and no longer describe uniform chapters after the registry expanded at level 51.
 */
export function arrangementForLevel(level: number, chapterSize = ROTATION[0]!.acts): ArrangementId {
  if (!Number.isInteger(level) || level < 1 || !Number.isInteger(chapterSize) || chapterSize < 1) {
    throw new Error('Music selection requires a positive level and chapter size.');
  }
  return ARRANGEMENT_CYCLE[Math.floor((level - 1) / chapterSize) % ARRANGEMENT_CYCLE.length]!;
}
