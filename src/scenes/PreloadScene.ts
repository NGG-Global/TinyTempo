import Phaser from 'phaser';

import { SceneKey } from '@/config/scenes';
import { hideBootOverlay } from '@/core/shell';
import { keptKeepsakes } from '@/game/keepsakeLegacy';
import { recordGateBaseline } from '@/game/areaGates';
import { loadProgress } from '@/game/progress';
import { generateMaterials } from '@/textures/materials';
import { generateFeedbackTextures } from '@/ui/feedback';

/** Family name, relative URL, and the variable font's weight range for `font-weight` matching. */
const FONTS: readonly (readonly [string, string, string])[] = [
  ['Fredoka', 'fonts/fredoka/Fredoka.ttf', '300 700'],
  ['Nunito', 'fonts/nunito/Nunito.ttf', '200 1000'],
];

/**
 * Generates every texture the game draws with and registers the two typefaces, then
 * hands off to the menu.
 *
 * There is deliberately no in-canvas progress bar. The DOM boot panel covers the
 * canvas until `create()`, so anything drawn here was never seen; the panel's spinner
 * is the loading indicator, and it is up for well under a second on a device.
 */
export class PreloadScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Preload);
  }

  public preload(): void {
    // Textures are generated here rather than in `create` so they are in the
    // cache before any scene that draws them starts.
    generateMaterials(this);
    generateFeedbackTextures(this);

    // The bundled typefaces, both SIL Open Font Licence, with each family's OFL.txt beside
    // it. Registered as FontFaces before Menu builds, because Phaser Text rasterises at
    // creation and will not reflow when a font arrives later. Relative paths: the APK
    // serves from a file origin where an absolute `/fonts/...` would 404.
    for (const [family, url, weight] of FONTS) {
      this.load.font({ key: family, url, format: 'truetype', descriptors: { weight, style: 'normal' } });
    }
  }

  public create(): void {
    // The DOM boot panel stays up until a scene is genuinely on screen, so a
    // slow first paint never shows a blank canvas.
    hideBootOverlay();

    // Before any level can be played on the debut schedule: the keepsakes this save held
    // under the old one are recorded once, from the save as it stands (`keepsakeLegacy.ts`).
    keptKeepsakes();
    // And the gates its stars already meet count as opened: tap-to-open is for gates met from
    // here on, not for a road already walked under the old rule (`areaGates.ts`).
    recordGateBaseline(loadProgress());

    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search);
      const level = Number(params.get('level'));
      if (params.has('debug') && Number.isInteger(level) && level >= 1 && level <= 100_000) {
        this.scene.start(SceneKey.Play, { level });
        return;
      }
    }
    this.scene.start(SceneKey.Menu);
  }
}
