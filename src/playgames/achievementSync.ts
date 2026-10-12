import { ACHIEVEMENTS } from '@/config/achievements';
import { endlessRecord, loadEndlessProgress, type EndlessRecord } from '@/game/endlessProgress';
import type { Progress } from '@/game/progress';
import { playGames } from './boot';
import { achievementsFrom, createAchievementSync, type AchievementSync } from './achievements';
import { stubPlayGames } from './playGames';

/**
 * The achievements, wired to the game: the configured ids and the installed Play Games
 * adapter. Scenes use this and nothing below it — no scene names an achievement id.
 *
 * Two calls: `syncAchievements(progress)` after anything that can clear a level (PlayScene's
 * record step), after a finished Endless run (`EndlessScene`'s record step) and at boot
 * once signed in, never awaited; and `openAchievements()` from the Settings button. The
 * Endless record is read from the device at each sync, so a sync from the road also
 * carries an Endless milestone earned while signed out.
 */

let instance: AchievementSync | null = null;

export function achievementSync(): AchievementSync {
  instance ??= createAchievementSync({
    games: playGames,
    achievements: achievementsFrom(ACHIEVEMENTS),
    // The browser keeps the stub; only a native build installs anything else.
    native: () => playGames() !== stubPlayGames,
  });
  return instance;
}

export function syncAchievements(progress: Progress, endless: EndlessRecord = endlessRecord(loadEndlessProgress())) {
  return achievementSync().sync({ progress, endless });
}

export function openAchievements() {
  return achievementSync().open();
}

/** Whether the achievements button should exist on this build, right now. */
export function achievementsOffered(): boolean {
  return achievementSync().available;
}
