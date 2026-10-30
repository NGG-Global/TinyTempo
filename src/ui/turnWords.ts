import type Phaser from 'phaser';
import { RHYTHM } from '@/config/rhythm';
import { PALETTE, SHELL } from '@/config/theme';
import { vibrate } from '@/core/haptics';
import { numeralStyle, turnCount, turnCountExit, turnCountPose } from '@/game/beatTrack';
import { tapTiming } from '@/game/timingReport';
import type { Judgement } from '@/rhythm/judge';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { mix } from './colour';
import { FxKey, type Feedback } from './feedback';
import { FLAWLESS, flawlessPose, socketGlint } from './flourish';
import { verdictPose, verdictWord, type VerdictGrade } from './hitPose';
import { TRACK, verdictLine } from './trackMetrics';
import { display, resize } from './type';
import { VerdictTag } from './verdictTag';

/** The count's numerals: "3", "2", "1" on the beats before the player's first target, "Go!" on it. */
export const NUMERALS = ['3', '2', '1', 'Go!'] as const;
/** A numeral's size in design units, from the faintest "3" to the full "Go!" (`numeralStyle`'s weight). */
export const TURN_CALL = { min: 42, max: 54 } as const;

/** The sparks a Perfect throws from its socket; a level's groove gives richer ones. */
export interface Sparks {
  readonly tints: readonly number[];
  readonly count: number;
}
export const PERFECT_SPARKS: Sparks = { tints: [PALETTE.coral, SHELL.cream], count: 8 };

/** The verdict word's pose on the scene, for the pill drawn behind it. */
interface WordPose {
  readonly alpha: number;
  readonly y: number;
  readonly scale: number;
  readonly tilt: number;
  readonly tag: number;
}

/**
 * The words a task says around the turn block — the count-in's numerals under the face,
 * the verdict word with its EARLY/LATE tag on the verdict's line, and *Flawless!* over
 * the shelf — as one object the three run scenes (a level, the Daily Tempo and Endless)
 * share instead of each carrying its own copy.
 *
 * Every Text is made once, here, and dressed at `layout` or `dress`, never on a beat:
 * the numerals are rasterised per numeral (`numeralStyle`) so a strike only shows one, and
 * the verdict word is one instance a quick double replaces rather than stacks. The pill
 * behind the word and the count's backing and ring are drawn onto the Graphics the block
 * is drawn with, so they clear with it; the sparks and confetti go through the scene's
 * `Feedback`. Everything is `f(age)` from the clock the beat is on, which the scenes pass
 * in, and nothing here reads the plan beyond what `turnCount` already says.
 *
 * What stays in a scene is what differs between them: what a judgement means for the
 * act, the struck socket the block itself draws, and whether a Perfect warms the room.
 */
export class TurnWords {
  private readonly verdict: Phaser.GameObjects.Text;
  /** EARLY or LATE beside the verdict word, for an off-centre tap. */
  private readonly verdictTag: VerdictTag;
  private readonly turnCalls: readonly Phaser.GameObjects.Text[];
  private readonly flawless: Phaser.GameObjects.Text;
  private readonly flawlessHalo: Phaser.GameObjects.Image;
  private ink: number;
  private s = 1;
  private blockS = 1;
  private centreX = 0;
  private trackY = 0;
  private verdictLineY = 0;
  private callY = 0;
  private verdictAt = -Infinity;
  /** The grade the word is showing and the beat it answered, for its pose (`verdictPose`). */
  private verdictGrade: VerdictGrade = 'Good';
  private verdictIndex = 0;
  /** The numeral currently shown, so a strike pays for its show and nothing else does. */
  private turnCalled: number | null = null;
  /** Whether the "Go!" of the current task has thrown its sparks; once per task, on the strike. */
  private goStruck = false;
  private flawlessAt = -Infinity;
  /** How many sockets the flawless sweep has passed and thrown sparks from. */
  private flawlessSwept = 0;
  /** Whether this flourish's chorus has thrown its confetti; once per flourish. */
  private flawlessChorused = false;

  public constructor(scene: Phaser.Scene, private readonly fx: Feedback, ink: number, depth: number) {
    this.ink = ink;
    this.verdict = display(scene, '', { size: 38, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(depth);
    this.verdictTag = new VerdictTag(scene, depth, ink);
    this.turnCalls = NUMERALS.map(word => display(scene, word, { size: 46, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(depth));
    this.flawlessHalo = scene.add.image(0, 0, FxKey.glow).setTint(0xffe7a0).setAlpha(0).setDepth(depth);
    this.flawless = display(scene, 'Flawless!', { size: 54, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(depth);
  }

  /** The verdict's line, from the block's face (`verdictLine`). */
  public get verdictY(): number { return this.verdictLineY; }
  /** The count's line, in the free band under the face. */
  public get turnCallY(): number { return this.callY; }

  /**
   * Places and dresses every word for the block at `trackY`, drawn at `blockS` on a scene
   * at `s`. A resize leaves the shown numeral dressed at the old scale, so the next strike
   * shows it afresh.
   */
  public layout(centreX: number, trackY: number, s: number, blockS: number): void {
    this.centreX = centreX;
    this.trackY = trackY;
    this.s = s;
    this.blockS = blockS;
    this.verdictLineY = verdictLine(trackY, s);
    this.verdict.setPosition(centreX, this.verdictLineY);
    this.flawless.setPosition(centreX, this.verdictLineY);
    // Under the player's row, not in the verdict's band above the shelf. The two would
    // otherwise want the same line at the same instant: a tap landing on the downbeat is
    // judged there and then, so the verdict would wipe the "Go!" for exactly the player
    // who got it right. Below the face is also the furthest point on the screen from the
    // act, which is where a count-in belongs — it is counting the player in, not narrating
    // the example — and the band is free for it because the scenes hide their action block
    // for the whole of a task.
    this.callY = trackY + (TRACK.plateHeight / 2 + TRACK.plateDepth + 44) * blockS;
    for (const text of this.turnCalls) text.setPosition(centreX, this.callY);
    this.dress(this.ink);
    this.turnCalled = null;
  }

  /**
   * Re-dresses the word and the count in an act's ink, at the last layout's scale: the
   * numeral warms from the ink toward coral one strike at a time, so the count is the row's
   * colour arriving rather than a caption in a third colour. Endless changes act every step.
   */
  public dress(ink: number): void {
    this.ink = ink;
    resize(this.verdict, 38 * this.s, this.verdictColour());
    this.verdictTag.layout(this.s, this.verdictColour());
    this.turnCalls.forEach((text, i) => {
      const { heat, weight } = numeralStyle(RHYTHM.turnCountBeats - i);
      resize(text, (TURN_CALL.min + (TURN_CALL.max - TURN_CALL.min) * weight) * this.blockS, mix(ink, PALETTE.coral, heat));
    });
  }

  /** A new task, or a run's boundary: nothing shown and nothing remembered. */
  public reset(): void {
    this.verdictAt = this.flawlessAt = -Infinity;
    this.flawlessSwept = 0;
    this.flawlessChorused = false;
    this.goStruck = false;
    this.verdict.setAlpha(0);
    this.verdictTag.clear();
    this.settle();
  }

  /**
   * The block is not being drawn — idle, paused, or under the result — so the count and
   * the flourish go. The verdict word fades on its own pose and is left to it.
   */
  public settle(): void {
    this.hideCall();
    if (this.flawless.alpha !== 0) this.flawless.setAlpha(0);
    if (this.flawlessHalo.alpha !== 0) this.flawlessHalo.setAlpha(0);
  }

  public verdictColour(result?: Judgement): number {
    if (!result) return this.ink;
    // A darker grey than the track's, because the word is read against whatever the
    // act has behind it — on the pale stages the palette's muted all but disappears.
    return result.grade === 'Perfect' ? PALETTE.coral : result.grade === 'Good' ? this.ink : PALETTE.muted;
  }

  /**
   * A judged tap's word, struck on the verdict's line, and which side of the beat it fell
   * beside it. A Perfect throws its sparks from the socket it answered (`socketX`).
   */
  public say(result: Judgement, now: number, socketX: number, still: boolean, sparks: Sparks = PERFECT_SPARKS): void {
    const word = verdictWord(result);
    this.verdictAt = now;
    this.verdictGrade = word;
    this.verdictIndex = result.index ?? this.verdictIndex + 1;
    this.verdict.setText(word);
    resize(this.verdict, 38 * this.s, this.verdictColour(result));
    // The result's lean, a tap at a time, while the player can still do something about the next one.
    this.verdictTag.set(tapTiming(result));
    if (result.grade === 'Perfect' && result.kind === 'hit' && !still) this.fx.burst('sparks', socketX, this.trackY, [...sparks.tints], sparks.count);
  }

  /**
   * A task answered Perfect throughout: the flourish starts, and it takes the verdict's
   * line — the last tap's "Perfect" is what it is summing up.
   */
  public flawlessNow(now: number): void {
    this.flawlessAt = now;
    this.flawlessSwept = 0;
    this.flawlessChorused = false;
    this.verdictAt = -Infinity;
    this.verdict.setAlpha(0);
    this.verdictTag.clear();
  }

  /** How long since the flourish began, for the block's own sweep and chorus (`drawBlock`). */
  public flawlessAge(now: number): number { return now - this.flawlessAt; }

  /** Every frame: the verdict word rises, pops and fades, and its tag rides with it. */
  public pose(now: number, still: boolean): void {
    const pose = this.wordPose(now, still);
    if (pose) this.verdict.setAlpha(pose.alpha).setY(pose.y).setScale(pose.scale).setRotation(pose.tilt);
    else if (this.verdict.alpha !== 0) this.verdict.setAlpha(0);
    this.verdictTag.pose(this.verdict, this.centreX, pose);
  }

  /** The cut card behind the verdict word and its tag, on the act's paper, from the same pose. */
  public drawVerdictPill(g: Phaser.GameObjects.Graphics, now: number, paper: number, still: boolean): void {
    const pose = this.wordPose(now, still);
    if (!pose || pose.alpha <= 0.01 || this.verdict.text === '') return;
    const s = this.s;
    const w = this.verdictTag.width(this.verdict, pose.scale) + 28 * s;
    const h = 38 * s * 1.3 * pose.scale;
    const x = this.centreX - w / 2;
    const y = pose.y - h / 2;
    g.fillStyle(0x000000, pose.alpha * 0.12).fillRoundedRect(x, y + 3 * s, w, h, h / 2);
    g.fillStyle(paper, pose.alpha * 0.9).fillRoundedRect(x, y, w, h, h / 2);
    // The same faint line the block's sheet carries, so the pill is a cut card and not a blur.
    g.lineStyle(1.5 * s, mix(paper, this.ink, 0.5), pose.alpha * 0.2).strokeRoundedRect(x, y, w, h, h / 2);
  }

  /**
   * The count into the player's turn, "3", "2", "1", "Go!", each numeral struck on its
   * beat: dropped in oversized, stamped to size, leaning alternate ways, a ring left on the
   * line, the fill warming from ink to coral (`turnCountPose`). The numeral it replaces is
   * knocked down under it (`turnCountExit`), so the slot is never empty on a beat and "Go!"
   * visibly displaces the "1" rather than succeeding it.
   */
  public drawCall(g: Phaser.GameObjects.Graphics, plan: RoundPlan | null, now: number, paper: number, still: boolean): void {
    const call = plan && turnCount(plan, now);
    if (!plan || !call) { this.hideCall(); return; }
    // The count belongs to the block and is drawn at its scale.
    const s = this.blockS;
    const go = call.count === 0;
    const beat = 60 / plan.bpm;
    const pose = turnCountPose(call, beat, still);
    const turnCall = this.turnCalls[RHYTHM.turnCountBeats - call.count] ?? this.turnCalls[0]!;
    if (call.count !== this.turnCalled) {
      this.hideCall();
      this.turnCalled = call.count;
    }
    const previous = this.turnCalls[RHYTHM.turnCountBeats - call.count - 1];
    if (previous) {
      const exit = turnCountExit(call.age, beat, call.count + 1, still);
      if (exit) previous.setAlpha(exit.alpha).setScale(exit.scale).setRotation(exit.tilt).setY(this.callY + exit.rise * s);
      else if (previous.alpha !== 0) previous.setAlpha(0);
    }
    // A patch of the act's paper under the numeral, at the numeral's own weight and
    // stamped down with it. Dark ink has no outline to carry (`typeStroke`) and its pale
    // drop was nothing on the hammer's wood at "3": this is the backing the dressed type
    // cannot be, and it makes the count legible without making it louder.
    const size = (TURN_CALL.min + (TURN_CALL.max - TURN_CALL.min) * call.weight) * s;
    const pw = Math.max(turnCall.width * pose.scale + 18 * s, size * 1.3);
    const ph = size * 1.2 * pose.scale;
    const px = this.centreX - pw / 2;
    const py = this.callY + pose.rise * s - ph / 2;
    g.fillStyle(0x000000, pose.alpha * 0.12).fillRoundedRect(px, py + 3 * s, pw, ph, ph / 2);
    g.fillStyle(paper, pose.alpha * 0.88).fillRoundedRect(px, py, pw, ph, ph / 2);
    g.lineStyle(1.5 * s, mix(paper, this.ink, 0.5), pose.alpha * 0.2).strokeRoundedRect(px, py, pw, ph, ph / 2);
    turnCall.setAlpha(pose.alpha).setScale(pose.scale).setRotation(pose.tilt).setY(this.callY + pose.rise * s);
    if (pose.ring.alpha > 0.01) {
      // The ring a strike leaves, on the block's own Graphics so it clears with it.
      const reach = (30 + 70 * pose.ring.spread) * s;
      g.lineStyle((5 - 3.5 * pose.ring.spread) * s, mix(this.ink, PALETTE.coral, pose.heat), pose.ring.alpha).strokeCircle(this.centreX, this.callY, reach);
    }
    // The "Go!" throws sparks once, on its strike. Under reduced motion the word alone.
    if (go && !this.goStruck) {
      this.goStruck = true;
      if (!still) this.fx.burst('sparks', this.centreX, this.callY, [PALETTE.coral, SHELL.cream], 12);
    }
  }

  /**
   * The flourish's word over the shelf and its halo, a burst from each socket as the
   * band crosses it, and the chorus's confetti from the face. The block draws the band
   * and the rings itself, from `flawlessAge`; this is the part that reaches the emitter.
   */
  public drawFlawless(columnX: number, centres: readonly number[], faceY: number, now: number, still: boolean): void {
    const age = now - this.flawlessAt;
    const pose = flawlessPose(age, still);
    if (!pose) {
      if (this.flawless.alpha !== 0) this.flawless.setAlpha(0);
      if (this.flawlessHalo.alpha !== 0) this.flawlessHalo.setAlpha(0);
      return;
    }
    const s = this.s;
    this.flawless.setAlpha(pose.alpha).setScale(pose.scale).setRotation(pose.tilt).setY(this.verdictLineY + pose.rise * s);
    if (pose.glow > 0.01) {
      // A warm halo behind the word: one soft image, the texture the stage's pool is made
      // of, sized to the word. It used to be three fainter offset passes of an ellipse,
      // since Graphics cannot blur, and frame by frame those read as a smeared double
      // image rather than as light.
      const w = this.flawless.width * pose.scale;
      this.flawlessHalo.setPosition(this.centreX, this.verdictLineY + pose.rise * s).setDisplaySize(w * 2, 170 * s * pose.scale).setAlpha(pose.glow * 0.8);
    } else if (this.flawlessHalo.alpha !== 0) this.flawlessHalo.setAlpha(0);
    if (still) return;
    while (this.flawlessSwept < centres.length && socketGlint(age, this.flawlessSwept, centres.length) >= 0) {
      const x = columnX + centres[this.flawlessSwept]!;
      this.fx.burst('sparks', x, faceY, [SHELL.sun, 0xffe7a0, PALETTE.coral], 6);
      this.flawlessSwept++;
    }
    if (!this.flawlessChorused && age >= FLAWLESS.chorusAt) {
      this.flawlessChorused = true;
      this.fx.burst('confetti', columnX, faceY - 10 * s, [PALETTE.coral, SHELL.cream, SHELL.sun], 22);
      vibrate('hit');
    }
  }

  private hideCall(): void {
    for (const text of this.turnCalls) if (text.alpha !== 0) text.setAlpha(0);
    this.turnCalled = null;
  }

  private wordPose(now: number, still: boolean): WordPose | null {
    const pose = verdictPose(now - this.verdictAt, this.verdictGrade, this.verdictIndex, still);
    return pose && { alpha: pose.alpha, y: this.verdictLineY + pose.rise * this.s, scale: pose.scale, tilt: pose.tilt, tag: pose.tag };
  }
}
