import type Phaser from 'phaser';
import type { GrooveLevel } from '../game/groove';
import type { RoundPlan } from '../rhythm/RhythmScheduler';
import { beatPulse, GrooveEnvelope } from './groove';

export type GrooveMaterial = 'booth' | 'porch' | 'snare' | 'hob' | 'glass' | 'bench';

/** Optional material light, in the object's authored coordinates. Owns no gameplay props.
 * One reusable Graphics, parented to the act so layout and table slides carry it along.
 */
export class GrooveReaction {
  private readonly light: Phaser.GameObjects.Graphics;
  private readonly envelope = new GrooveEnvelope();
  private readonly pulse = { beat: 0, phase: 0, strength: 0 };
  private level: GrooveLevel = 0;
  private hitAt = -Infinity;
  private barOrigin = NaN;
  private bpm = 0;
  public constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private readonly material: GrooveMaterial) {
    this.light = scene.add.graphics();
    parent.add(this.light);
  }
  public show(level: GrooveLevel, now: number): void {
    this.level = level;
    if (level === 0) { this.envelope.reset(); this.hitAt = -Infinity; }
    else this.envelope.show(level, now);
  }
  public perfect(now: number): void { if (this.level === 3) this.hitAt = now; }
  public update(now: number, plan: RoundPlan | null, still: boolean): void {
    const g = this.light.clear();
    const amount = this.envelope.amount(now);
    const warm = Math.max(0, Math.min(1, amount - 1));
    if (warm < 0.001) return;
    const locked = Math.max(0, amount - 2);
    if (plan && now >= plan.start) { this.barOrigin = plan.demo; this.bpm = plan.bpm; }
    const pulse = beatPulse(now, this.barOrigin, this.bpm, still, this.pulse).strength;
    const age = now - this.hitAt;
    const hit = still || age < 0 || age > 0.24 ? 0 : Math.sin(age / 0.24 * Math.PI) * locked;
    const alpha = warm * 0.22 + locked * 0.22 + pulse * (0.05 * warm + 0.18 * locked) + hit * 0.16;
    const cream = 0xffefc6, brass = 0xe9c177;
    switch (this.material) {
      case 'booth':
        // LED tape, then a pair of fixed back-wall lamps at 3. Never the level meter.
        g.fillStyle(brass, alpha).fillRoundedRect(-328, -185, 656, 5, 2);
        g.fillStyle(cream, locked * (0.11 + pulse * 0.1)).fillTriangle(-312, -230, -242, -186, -322, -186)
          .fillTriangle(312, -230, 242, -186, 322, -186);
        break;
      case 'porch':
        // Porch transom reflection, above the door and well away from the button.
        g.fillStyle(brass, alpha * 0.45).fillRoundedRect(-120, -196, 210, 35, 5);
        g.lineStyle(3, cream, alpha).lineBetween(-140, -222, 113, -222);
        g.fillStyle(cream, locked * (0.12 + pulse * 0.1)).fillTriangle(-120, -160, 90, -160, -90, -90);
        break;
      case 'snare':
        // Lower chrome rim and shell reflection; the head and sticks remain untouched.
        g.lineStyle(4, cream, alpha).beginPath().moveTo(-143, 117).lineTo(-80, 131).lineTo(45, 134).strokePath();
        g.fillStyle(brass, alpha * 0.4).fillRoundedRect(-137, 22, 23, 68, 5);
        g.lineStyle(2, cream, locked * (0.28 + pulse * 0.3)).lineBetween(145, 48, 145, 94);
        break;
      case 'hob':
        // Heat reflected in the fixed hob and the wooden worktop, never extra kernels.
        g.fillStyle(brass, alpha * 0.4).fillEllipse(-158, 151, 190, 14, 20);
        g.lineStyle(3, cream, alpha).lineBetween(-300, 106, -218, 106);
        g.lineStyle(2, cream, locked * (0.3 + pulse * 0.3)).lineBetween(130, 203, 278, 203);
        break;
      case 'glass':
        g.lineStyle(8, cream, alpha * 0.65).lineBetween(-196, -8, -89, -187);
        g.lineStyle(3, brass, alpha).lineBetween(-230, -212, -230, 186);
        g.lineStyle(4, cream, locked * (0.25 + pulse * 0.25 + hit * 0.2)).lineBetween(148, 178, 202, 89);
        break;
      case 'bench':
        // Bench edge and two stationary brass fasteners; no motion on the scored nail.
        g.lineStyle(4, cream, alpha).lineBetween(90, 4, 238, 4).lineBetween(385, 4, 490, 4);
        g.fillStyle(brass, alpha).fillEllipse(128, 19, 10, 4, 12).fillEllipse(470, 19, 10, 4, 12);
        g.lineStyle(2, cream, locked * (0.32 + pulse * 0.32 + hit * 0.2)).lineBetween(395, 12, 475, 12);
        break;
    }
  }
  // The parent container destroys the Graphics with the act.
}
