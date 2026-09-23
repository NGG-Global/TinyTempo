import { ACHIEVEMENTS } from '@/config/achievements';
import type { Progress } from '@/game/progress';
import { playGames } from './boot';
import { achievementsFrom, createAchievementSync, type AchievementSync } from './achievements';
import { stubPlayGames } from './playGames';

/**
 * The achievements, wired to the game: the configured ids and the installed Play Games
 * adapter. Scenes use this and nothing below it — no scene names an achievement id.
 *
 * Two calls: `syncAchievements(progress)` after anything that can clear a level (PlayScene's
 * record step) and at boot once signed in, never awaited; and `openAchievements()` from the
 * Settings button.
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

export function syncAchievements(progress: Progress) {
  return achievementSync().sync(progress);
}

export function openAchievements() {
  return achievementSync().open();
}

/** Whether the achievements button should exist on this build, right now. */
export function achievementsOffered(): boolean {
  return achievementSync().available;
}
