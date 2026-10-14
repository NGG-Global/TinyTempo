import type Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';

import { reportError } from './errors';
import { dismissShellOverlay } from './shell';

/**
 * A scene that answers Android's back. `handleBack` returns whether it took the press; a
 * scene that returns false lets the press go on, and a press nothing takes sends the app
 * to the background — what back on a root screen does.
 */
export interface BackAware {
  handleBack(): boolean;
}

export function isBackAware(scene: unknown): scene is BackAware {
  return typeof scene === 'object' && scene !== null && typeof (scene as { handleBack?: unknown }).handleBack === 'function';
}

/**
 * Hands one back press to whatever is on top. A DOM sheet first, since it covers the
 * canvas — the save-code entry, the update prompt — then the active scenes from the top
 * of the scene list down. Pure: the scenes and the sheet are passed in.
 */
export function dispatchBack(dismissOverlay: () => boolean, scenes: readonly unknown[]): boolean {
  if (dismissOverlay()) return true;
  for (let i = scenes.length - 1; i >= 0; i--) {
    const scene = scenes[i];
    if (isBackAware(scene) && scene.handleBack()) return true;
  }
  return false;
}

/** What a level's facts at the moment of a back press are. */
export interface LevelBackFacts {
  /** A transition, a Continue under way, or an ad or purchase in flight. */
  readonly busy: boolean;
  readonly sheetOpen: boolean;
  readonly sheetBusy: boolean;
  /** Starting, the first-run pass, or the controller between its first beat and its result. */
  readonly running: boolean;
}

export type LevelBackAction = 'ignore' | 'closeSheet' | 'pause' | 'leave';

/**
 * Back in a level is two presses, never one, because leaving can end an attempt a heart
 * paid for: the first pauses — or closes the restart sheet — and only a second, from a
 * paused level, leaves. A level that is waiting to start or showing its result has
 * nothing running to lose, and leaves on the first.
 */
export function levelBackAction(facts: LevelBackFacts): LevelBackAction {
  if (facts.busy) return 'ignore';
  if (facts.sheetOpen) return facts.sheetBusy ? 'ignore' : 'closeSheet';
  return facts.running ? 'pause' : 'leave';
}

/**
 * Android's back button, through `@capacitor/app`.
 *
 * Without a listener the WebView's activity took back itself, from any screen: the app
 * left mid-level, mid-lesson and from the middle of Settings, and on Android 11 and older
 * it finished the activity, so the next launch was a cold start. With one, back means what
 * the screen's own way out means — a sheet closes, a level pauses and then leaves, a
 * sub-screen goes back to the one that opened it — and only the title screen lets the app
 * go to the background, by `minimizeApp` rather than `exitApp`, as Android's own root back
 * does. The plugin registers an `OnBackPressedCallback`, which still receives the press
 * under Android 16's predictive back.
 *
 * Native-only and lazily imported: the browser has no back button to take, and its own
 * history is left alone.
 */
export async function bootBackButton(game: Phaser.Game): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      let handled = false;
      try {
        handled = dispatchBack(dismissShellOverlay, game.scene.getScenes(true));
      } catch (error) {
        // A screen that threw has not been left: report it, and keep the app where it is
        // rather than backgrounding it from a state nobody chose.
        reportError(error, { kind: 'handled', context: { stage: 'back-button' } });
        return;
      }
      if (!handled) void App.minimizeApp().catch(() => { /* the press is simply lost */ });
    });
  } catch {
    // No plugin: the platform's own back stays, as it was before this existed.
  }
}
