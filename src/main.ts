import Phaser from 'phaser';

import { installAnalyticsProvider } from '@/analytics/boot';
import { createGameConfig } from '@/config/game';
import { SUPPORT } from '@/config/support';
import { breadcrumb, reportError } from '@/core/errors';
import { showBootError } from '@/core/shell';
import { installDiagnostics } from '@/diagnostics/boot';
import { bootMonetization } from '@/monetization/boot';
import { bootPlayGames } from '@/playgames/boot';

declare global {
  interface Window {
    /**
     * The running game, exposed for debugging in development builds only.
     * Handy for poking at scenes and the Scale Manager from a device's remote
     * console; stripped from production so nothing can reach into the game.
     */
    __PHASER_GAME__?: Phaser.Game;
    /**
     * Throws Sentry's verification error, to confirm reporting works against a real
     * project. Development builds only; see `diagnostics/boot.ts`.
     */
    __TINY_TEMPO_TEST_ERROR__?: () => string;
  }
}

/**
 * Entry point.
 *
 * Starting the game is wrapped so a failure surfaces in the UI rather than
 * only in a console nobody can reach on a handset. The most likely cause is a
 * WebGL context the device declined to create.
 */
function start(): void {
  // Before anything that can throw, so the most likely failure on a strange device —
  // a WebGL context the driver declines — is the first thing the reporter sees.
  installDiagnostics();
  try {
    void bootMonetization();
    // Nothing waits on this: Play Games is an enhancement, and a device without it plays
    // the game exactly as before.
    void bootPlayGames();
    // After `installDiagnostics`, which puts the crash-breadcrumb wrapper on the event
    // bus: the provider composes with whatever is installed, so the later it attaches
    // the more it inherits, and attaching first would leave it to be wrapped instead.
    void installAnalyticsProvider();
    const game = new Phaser.Game(createGameConfig());

    if (import.meta.env.DEV) {
      window.__PHASER_GAME__ = game;
    }

    // Release the WebGL context and audio on navigation away. Without this,
    // Android Chrome can hold the context across a page transition and refuse
    // the next one.
    window.addEventListener('pagehide', event => {
      // A cached page is restored with the same JS objects. Play interrupts its round.
      if (!event.persisted) {
        breadcrumb('pagehide');
        game.destroy(true);
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Reported before the panel is drawn: `showBootError` touches the DOM, and on a
    // device broken enough to fail here that is not a safe last action.
    reportError(error, { kind: 'boot', fatal: true });
    showBootError(`The game could not start on this device. (${detail})`, SUPPORT.address);
    throw error;
  }
}

start();
