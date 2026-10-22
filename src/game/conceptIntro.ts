import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import { endsOffBeat, parsePattern, parseSubdivided, type Pattern } from '../rhythm/patterns';
import { isCleared } from './health';
import { difficulty, levelSpec, type Grid, type LevelSpec, type LevelTask } from './levels';
import type { Progress } from './progress';

/**
 * The first meeting with a new kind of rhythm: one short, judged-but-forgiving task in
 * front of the first level that asks for it, and never again.
 *
 * Five things on the road are new in kind rather than in degree. The **offbeat** — the first
 * tap that falls between two beats — the **last-beat offbeat**, a phrase that ends on the "and"
 * of 4, half a beat before the next one begins (held back to `PROGRESSION.lastOffbeat.from`
 * because user testing found it the most confusing offbeat), and the **long phrase**, two bars
 * to hold instead of one, arrive through the tiers; **triplets** and **sixteenths** through the curve's second
 * stage (`PROGRESSION.subdivision`). Each used to arrive unannounced, a task two-thirds of the
 * way into a level simply asking for it. This is the introduction, and it is deliberately not
 * a tutorial. It is one task on the level's own act, turn block, judge and music, played
 * before the level's first task:
 *
 * - a count-in bar, under a two-line title — "New rhythm" and what to listen for;
 * - one demonstration of a simple phrase: the smallest change from what the player plays;
 * - the player's answer, judged by the level's own controller at the teaching tempo.
 *
 * **It never counts.** Its result is not a task result: it adds nothing to the level's
 * accuracy, stars or analytics tasks, and a miss in it is not called a miss. The judge's
 * windows are the ones every task gets — forgiving here means slower, simpler and
 * unscored, never wider — so nothing about how later tasks are judged moves.
 *
 * **A weak answer gets one more go**, straight away and without the count-in, and then the
 * level begins whatever happened. Nothing in this game waits for a tap, and a first
 * meeting that could not be got past would be the frustration it exists to prevent.
 */

/** What an introduction teaches: a rhythm new in kind, not just in speed or density. */
export type Concept = 'offbeat' | 'lastOffbeat' | 'longPhrase' | Grid;

/** In the order the road reaches them. */
export const CONCEPTS: readonly Concept[] = ['offbeat', 'lastOffbeat', 'longPhrase', 'triplet', 'sixteenth'];

export const CONCEPT_INTRO = {
  /** Fraction of the level's opening tempo the introduction plays at: the first-run pass's. */
  tempo: 0.75,
  /** Answer accuracy that counts as having got it. Below it, one more go. */
  passAccuracy: 50,
  /** Tries in all, the retry included. */
  maxTries: 2,
} as const;

/**
 * The phrase each introduction plays, the smallest change from what the player already
 * plays: quarter notes with one "and" on beat three for the offbeat; three quarters and then,
 * in place of beat four, its "and" for the last-beat offbeat, so the only new thing is where
 * the phrase ends; the familiar three quarters held for two bars for the long phrase, so only
 * the length is new; quarters with
 * the new group once on beat three for each finer grid.
 */
export const INTRO_PATTERNS: Readonly<Record<Concept, Pattern>> = Object.freeze({
  offbeat: parsePattern('intro-offbeat', 'X - X - X X X -', 0.5),
  lastOffbeat: parsePattern('intro-last-offbeat', 'X - X - X - - X', 0.5),
  longPhrase: parsePattern('intro-long-phrase', 'X - X - X - - - X - X - X - - -', 0.5),
  triplet: parseSubdivided('intro-triplet', 'X - - X - - X X X X - -', 3),
  sixteenth: parseSubdivided('intro-sixteenth', 'X - - - X - - - X X X X X - - -', 4),
});

const CAPTIONS: Readonly<Record<Concept, string>> = Object.freeze({
  offbeat: 'Between the beats',
  lastOffbeat: 'Ends after beat 4',
  longPhrase: 'Two bars to remember',
  triplet: '3 inside the beat',
  sixteenth: '4 inside the beat',
});

/** Two short lines: what this is, and what to listen for. The retry says it once more. */
export function introCopy(concept: Concept, retry: boolean): { readonly title: string; readonly caption: string } {
  return { title: retry ? 'Once more' : 'New rhythm', caption: CAPTIONS[concept] };
}

/**
 * Whether a task asks for a concept. A tier phrase with a hit off the beat carries the
 * offbeat; one whose last tap is the "and" of its last beat carries the last-beat offbeat too.
 */
export function taskCarries(task: LevelTask, concept: Concept): boolean {
  switch (concept) {
    case 'offbeat': return task.grid === null && task.pattern.hits.some(hit => !Number.isInteger(hit));
    case 'lastOffbeat': return task.grid === null && endsOffBeat(task.pattern);
    case 'longPhrase': return task.pattern.lengthBeats > RHYTHM.beatsPerBar;
    default: return task.grid === concept;
  }
}

/** Whether a finer grid may appear at a level, by the same test `subdivide` applies. */
export function gridEligible(grid: Grid, level: number): boolean {
  const S = PROGRESSION.subdivision;
  return difficulty(level) >= (grid === 'triplet' ? S.tripletsFrom : S.sixteenthsFrom);
}

/**
 * The first level the curve allows a grid on. Derived from the thresholds rather than
 * written down, so moving `tripletsFrom` moves this with it.
 */
export function firstEligibleLevel(grid: Grid): number {
  let level = 1;
  while (!gridEligible(grid, level)) level++;
  return level;
}

const firstLevels = new Map<Concept, number | null>();

/**
 * The first level whose tasks actually ask for a concept: where a new player meets its
 * introduction. Read from the road, never written down.
 */
export function firstLevelWith(concept: Concept, limit = 1_000): number | null {
  if (firstLevels.has(concept)) return firstLevels.get(concept)!;
  let found: number | null = null;
  for (let level = 1; level <= limit && found === null; level++) {
    if (levelSpec(level).tasks.some(task => taskCarries(task, concept))) found = level;
  }
  firstLevels.set(concept, found);
  return found;
}

/** The first level that uses a grid, no earlier than the curve allows it. */
export function firstLevelWithGrid(grid: Grid, limit = 1_000): number | null {
  return firstLevelWith(grid, limit);
}

export type SeenConcepts = Readonly<Record<Concept, boolean>>;

/**
 * Which concept this level start should introduce, or null.
 *
 * The level must actually ask for it — teaching a rhythm the level then never uses would be
 * a lesson with nothing to apply it to — and the player must not have met the introduction
 * before. **One per level start**: where two are new, the one the level reaches first, and
 * the other waits for the next level that asks for it.
 *
 * The two kinds differ for a player who was already past them when introductions arrived.
 * A finer grid is still news to a veteran, so a save without the flag meets its
 * introduction on the next level that uses one. The offbeats and the long phrase are
 * not: anyone who has cleared the level where one first appears has played it many times
 * since, so none is introduced to a save that has cleared that level (`isCleared`).
 * Nothing new is stored to know it.
 */
export function introConcept(spec: LevelSpec, seen: SeenConcepts, progress: Progress): Concept | null {
  const wanted = (concept: Concept): boolean => {
    if (seen[concept]) return false;
    if (concept === 'triplet' || concept === 'sixteenth') return true;
    const first = firstLevelWith(concept);
    return first === null || !isCleared(progress, first);
  };
  for (const task of spec.tasks) {
    for (const concept of CONCEPTS) if (taskCarries(task, concept) && wanted(concept)) return concept;
  }
  return null;
}

export type IntroStep = 'try' | 'done';

/** One introduction's progress: how many tries, the best answer, and whether it is over. */
export class ConceptIntroRun {
  public step: IntroStep = 'try';
  public tries = 0;
  public best = 0;

  public constructor(public readonly concept: Concept) {}

  public get pattern(): Pattern { return INTRO_PATTERNS[this.concept]; }
  public get passed(): boolean { return this.best >= CONCEPT_INTRO.passAccuracy; }
  /** The try under way is the retry, which gets no count-in and says "Once more". */
  public get retrying(): boolean { return this.tries > 1; }

  public begin(): void {
    if (this.step === 'try') this.tries++;
  }

  /** A try was judged. `retry` for one more go, `done` to hand over to the level. */
  public complete(accuracy: number): 'retry' | 'done' {
    if (this.step === 'done') return 'done';
    if (Number.isFinite(accuracy)) this.best = Math.max(this.best, Math.max(0, Math.min(100, accuracy)));
    if (this.passed || this.tries >= CONCEPT_INTRO.maxTries) {
      this.step = 'done';
      return 'done';
    }
    return 'retry';
  }
}
