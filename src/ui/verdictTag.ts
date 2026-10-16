import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import type { TapTiming } from '@/game/timingReport';
import { verdictGroup } from './hitPose';
import { label, resize } from './type';

/** The tag's size and its gap from the word, in design units. */
const TAG = { size: 24, gap: 12 } as const;

/** The verdict word's pose, as the scenes already compute it. */
interface VerdictPose {
  readonly alpha: number;
  readonly y: number;
  readonly scale: number;
  readonly tilt: number;
  /** The tag's own presence, 0 → 1, a few frames behind the word's; whole when omitted. */
  readonly tag?: number;
}

/**
 * EARLY or LATE beside the verdict word, for a tap that was off-centre (`tapTiming`).
 *
 * Both words are made once, in `build`, and only shown, hidden and posed after that: the tag
 * appears on the frame of a judged tap, and a `setText` there is a raster on the frame that
 * matters most. It rides the word's own pose — its alpha, its line, its scale and lean — so
 * the two land and leave together, and the pair is centred as one group on the verdict's line.
 */
export class VerdictTag {
  private readonly texts: Readonly<Record<TapTiming, Phaser.GameObjects.Text>>;
  private shown: TapTiming | null = null;
  private s = 1;

  public constructor(scene: Phaser.Scene, depth: number, colour: number) {
    const make = (word: string) => label(scene, word, { size: TAG.size, colour, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(depth);
    this.texts = { early: make('Early'), late: make('Late') };
  }

  /** Sized and dressed at layout, in the word's ink, never on a tap's frame. */
  public layout(s: number, colour: number): void {
    this.s = s;
    for (const text of Object.values(this.texts)) resize(text, TAG.size * s, colour, STYLE.current, false);
  }

  /** What the next pose shows: the tap's side, or nothing. */
  public set(timing: TapTiming | null): void {
    this.shown = timing;
    for (const [key, text] of Object.entries(this.texts)) if (key !== timing && text.alpha !== 0) text.setAlpha(0);
  }

  public clear(): void { this.set(null); }

  /** The word and the tag's combined width at this scale, for the pill drawn behind them. */
  public width(word: Phaser.GameObjects.Text, scale: number): number {
    return this.group(word, scale).width;
  }

  /**
   * Places the word and the tag on the verdict's line for this frame. A null pose hides the
   * tag; the word's own alpha is the caller's, as it always was.
   */
  public pose(word: Phaser.GameObjects.Text, centreX: number, pose: VerdictPose | null): void {
    const tag = this.shown === null ? null : this.texts[this.shown];
    if (!pose) {
      if (tag && tag.alpha !== 0) tag.setAlpha(0);
      word.setX(centreX);
      return;
    }
    const { wordX, tagX } = this.group(word, pose.scale);
    word.setX(centreX + wordX);
    // The tag pops in behind the word — fainter and a little under size until it has
    // arrived — so "Good … early" reads as a verdict and its qualifier, in that order.
    const present = pose.tag ?? 1;
    if (tag) tag.setAlpha(pose.alpha * present).setPosition(centreX + tagX, pose.y).setScale(pose.scale * (0.8 + 0.2 * present)).setRotation(pose.tilt);
  }

  private group(word: Phaser.GameObjects.Text, scale: number): ReturnType<typeof verdictGroup> {
    const tag = this.shown === null ? null : this.texts[this.shown];
    return verdictGroup(word.width, tag ? tag.width : 0, scale, TAG.gap * this.s);
  }
}
