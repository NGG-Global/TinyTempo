import Phaser from 'phaser';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/design';
import { PALETTE } from '@/config/theme';
import { getGameRootId } from '@/core/shell';
import { BootScene } from '@/scenes/BootScene';
import { CalibrateScene } from '@/scenes/CalibrateScene';
import { MapScene } from '@/scenes/MapScene';
import { MenuScene } from '@/scenes/MenuScene';
import { PlayScene } from '@/scenes/PlayScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { TransferScene } from '@/scenes/TransferScene';
import { TutorialScene } from '@/scenes/TutorialScene';

/**
 * Builds the Phaser game configuration.
 *
 * Every non-default value here is a mobile-first decision; the comments record
 * the reasoning so the settings are not "cargo-culted" forward on the next
 * change.
 */
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    /**
     * WebGL where available, 2D canvas otherwise. Every Android WebView worth
     * targeting has WebGL, but the fallback costs nothing and keeps the game
     * running on a device with a blocklisted driver.
     */
    type: Phaser.AUTO,

    parent: getGameRootId(),
    backgroundColor: PALETTE.paper,
    // The rhythm engine owns the only AudioContext and its scheduling/cancellation.
    audio: { noAudio: true },

    scale: {
      /**
       * `EXPAND` over `FIT`.
       *
       * `FIT` preserves the 9:16 design box and letterboxes the remainder,
       * which on a 20:9 handset means black bars across roughly a fifth of the
       * screen. `EXPAND` grows the logical game size to fill the parent while
       * still scaling the design box to fit inside it, so the extra space
       * becomes usable world instead of dead space.
       *
       * The cost is that the logical game size is no longer constant — which
       * is exactly why layout goes through `Viewport` rather than reading the
       * design constants directly.
       */
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,

      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,

      /*
       * `min` / `max` are deliberately not set.
       *
       * They clamp the *display* size in CSS pixels, not the logical game size.
       * A floor of 480 CSS px forces the canvas wider than a 393 px handset
       * screen, and `autoCenter` then centres the overflow so content is
       * clipped off both edges. Arbitrary logical sizes are handled by
       * `Viewport` instead, which is the correct layer for it.
       */

      /**
       * The parent is already sized by CSS (`#game-root`, fixed to `100dvh`),
       * so Phaser must not apply inline styles to it — that would fight the
       * dynamic-viewport handling for Android Chrome's collapsing URL bar.
       */
      expandParent: false,

      /** Integer canvas dimensions; fractional sizes render soft on mobile. */
      autoRound: true,
    },

    input: {
      /**
       * Two simultaneous touch points. Enough for the common mobile pattern of
       * one thumb per side, and cheap — Phaser allocates pointer objects up
       * front. Raise this for pinch, rotate, or other multi-finger gestures.
       */
      activePointers: 2,
      touch: { capture: true },
      /** Mouse stays enabled so the game is testable on a desktop browser. */
      mouse: { preventDefaultDown: true, preventDefaultMove: false },
      keyboard: false,
      gamepad: false,
      /**
       * Raw pointer positions, no smoothing.
       *
       * Note the direction of this setting: Phaser applies
       * `x = newX * smoothFactor + previousX * (1 - smoothFactor)`, so the
       * value is the weight of the *new* sample. A low non-zero value such as
       * 0.2 keeps 80% of the previous position and lags the finger badly —
       * measured at roughly 45 game units behind the end of a fast swipe.
       * Both 0 and 1 mean "use the exact position".
       *
       * Direct manipulation is the case where lag is felt most, since the
       * dragged object is supposed to sit under the fingertip. Digitiser
       * jitter is a couple of units and invisible at this scale, so there is
       * nothing to filter out.
       */
      smoothFactor: 0,
      /** Keeps pointer state correct when a touch ends outside the canvas. */
      windowEvents: true,
    },

    render: {
      /** Smooth edges on the rounded shapes this project draws. */
      antialias: true,
      /**
       * Left at the browser default rather than `'high-performance'`. A phone
       * has one GPU, so the hint mostly opts out of power management — a poor
       * trade for a 2D game that is nowhere near GPU-bound, and it shortens
       * battery life and brings on thermal throttling sooner.
       */
      powerPreference: 'default',
      /**
       * Do not refuse a WebGL context on a device the browser flags as slow;
       * falling back to canvas is better than failing to start.
       */
      failIfMajorPerformanceCaveat: false,
    },

    fps: {
      target: 60,
      /**
       * `0` means "follow the display refresh rate".
       *
       * Deliberately uncapped: many Android handsets run at 90 or 120 Hz, and
       * a touch-drag game is exactly the case where the extra frames are felt,
       * since the dragged object tracks the finger. If battery or thermal
       * headroom matters more than that for a given game, set this to 60.
       */
      limit: 0,
      smoothStep: true,
    },

    /** A long-press on the canvas must not open the browser context menu. */
    disableContextMenu: true,

    /** Console banner is useful while developing, noise in production. */
    banner: import.meta.env.DEV,

    scene: [BootScene, PreloadScene, MenuScene, MapScene, PlayScene, SettingsScene, CalibrateScene, TransferScene, TutorialScene],
  };
}
