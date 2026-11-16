import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Daily Tempo scene is Phaser-bound, so what is pinned here is read from its source:
 * the rules the mode's design turns on, each a line that is easy to lose in a refactor.
 */
const scene = readFileSync('src/scenes/DailyScene.ts', 'utf8');
const slice = (from: string, to: string) => scene.slice(scene.indexOf(from), scene.indexOf(to));

describe('the Daily Tempo scene', () => {
  it('is registered as a scene of its own, a sibling of PlayScene and EndlessScene', () => {
    expect(readFileSync('src/config/scenes.ts', 'utf8')).toContain("Daily: 'daily'");
    expect(readFileSync('src/config/game.ts', 'utf8')).toContain('EndlessScene, DailyScene]');
    expect(scene).toContain('super(SceneKey.Daily)');
    // Nothing a level owns: no hearts spent, no progress written, no restart sheet.
    expect(scene).not.toMatch(/beginAttempt|finishAttempt|saveProgress|RestartSheet|useDailyRestart/);
  });

  it('reads the day from the one day key, and the chart from it, and redraws when the day turns under the card', () => {
    expect(scene).toContain('this.day = dailyTempoDay();');
    expect(scene).toContain('this.chart = dailyChart(this.day);');
    expect(scene).toContain("if (dailyTempoDay() !== this.day) { this.refreshChart(); this.drawCard(); }");
    expect(scene).toContain('definitionForLap(VIGNETTES[this.chart.actIndex]!, this.chart.lap)');
  });

  it('runs the chart as a level runs its tasks: each task’s own lead-in, the next on the downbeat the coda lands on', () => {
    const begin = slice('  private beginTask(', '  private showPhase(');
    expect(begin).toContain('startAt, task.leadBeats,');
    expect(begin).toContain('new TaskSequence(task.bpm, startAt, 1)');
    const tick = slice('  private tick(): void {', '  private recordDaily(): void {');
    expect(tick).toContain("if (!canPlaceNextTask(this.audio.context.currentTime, transition.next)) { this.invalidate('timing'); return; }");
    expect(tick).toContain('this.audio.music.setRate(next.bpm / MUSIC.sourceBpm, transition.next);');
    expect(tick).toContain('this.beginTask(this.taskIndex + 1, transition.next);');
    // The act's ending and the stems read the chart's own bar, as a level's read the level's.
    const result = slice('  private showResult(result: RoundResult): void {', '  private tick(): void {');
    expect(result).toContain('const bars = levelBars(this.chart);');
    expect(result).toContain('this.layers = advanceLayers(this.layers, result.accuracy, this.stems, bars);');
    // The meter moves here, once per finished task, and nowhere a tap lands.
    expect(result).toContain('this.drawMeter();');
    expect(slice('  private presentJudgement(', '  private releaseHeldJudgements(')).not.toContain('drawMeter');
  });

  it('scores and pays a finished run once, local first, and sends the leaderboard the run’s own day', () => {
    const record = slice('  private recordDaily(): void {', '  private invalidate(');
    expect(record).toContain('if (this.applied || this.invalid) return;');
    expect(record).toContain('const accuracy = meanAccuracy(this.results);');
    expect(record).toContain('const stars = starsFor(accuracy, this.chart);');
    expect(record).toContain('applyDailyRewards({ stars, band: this.chart.band, accuracy }, Date.now())');
    expect(record).toContain('if (applied.grants.timerMinutes !== null) queueCloudSave();');
    expect(record).toContain('recordObjectives(dailyObjectiveReport(this.chart, this.tally), Date.now(), objectiveContext(loadProgress()));');
    expect(record).toContain('if (dailyTempoLeaderboardOffered()) {');
    expect(record).toContain('void recordDailyTempo(accuracy, this.runStartedAt)');
    expect(record.indexOf('applyDailyRewards(')).toBeLessThan(record.indexOf('recordDailyTempo('));
    expect(scene.match(/applyDailyRewards\(/g)).toHaveLength(1);
  });

  it('ends an interrupted run once with nothing scored, and lets the pause sheet keep the run going', () => {
    const invalidate = slice('  private invalidate(reason: AbandonReason): void {', '  // ---------------------------------------------------------------- input');
    expect(invalidate).toContain("if (this.disposed || this.phase !== 'run' || this.invalid !== null || this.over) return;");
    expect(invalidate).toContain("track('daily_abandoned', { reason, tasks_done: this.results.length });");
    expect(invalidate).not.toContain('applyDailyRewards');
    for (const reason of ["this.invalidate('background')", "this.invalidate('orientation')", "this.invalidate('timing')", "this.invalidate('audio')"]) expect(scene).toContain(reason);
    // The sheet is a question over a run that goes on; only Leave ends it.
    expect(scene).toContain("if (this.leaveRect.contains(tap.x, tap.y)) { this.press('leave', wall); this.abandon(); return; }");
    expect(slice('  private showSheet(): void {', '  private hideSheet(): void {')).not.toMatch(/interrupt|cancel|pause/);
  });

  it('keeps the music of the screen that opened it on the card, and stops the theme before a run', () => {
    expect(scene).toContain('ensureScreenMusic(this, this.from === SceneKey.Menu);');
    const start = slice('  private async start(): Promise<void> {', '  /** The day\'s act on the stage.');
    expect(start).toContain('stopTheme(audio);');
    expect(start).toContain('await audio.music.load(shellTrack());');
    expect(start).toContain("void setMusicBed(audio, 'level');");
    // The act is on the stage before the track has loaded, so the screen is never bare.
    expect(start.indexOf('this.mountAct();')).toBeLessThan(start.indexOf('await audio.unlock();'));
  });

  it('answers Android’s back on every phase', () => {
    const back = slice('  public handleBack(): boolean {', '  /** The player chose to leave the run');
    expect(back).toContain("if (this.phase === 'card') { this.leave(); return true; }");
    expect(back).toContain('if (this.sheetOpen) { this.hideSheet(); return true; }');
    expect(back).toContain("if (this.phase === 'result') { this.showCard(); return true; }");
    expect(back).toContain('this.showSheet();');
  });
});
