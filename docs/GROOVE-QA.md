# Groove and mastery refinement

## Scope

The repository was pulled before work; the checkout was already current at `ecdf8af`.
The game was run and its existing presentation inspected before edits. Groove's pure
rules, scoring, judgement windows, difficulty and BPM progression are unchanged.
Existing local package/Android configuration edits were preserved.

## What changed

1. **Previous weakness:** the room largely communicated higher Groove through a muted
   glow and rim intensity. Level 3 lacked a distinct material response. Mastery competed
   with the finale fanfare and its text needed a more physical identity.
2. **Functional fixes:** between-task/null-plan rendering no longer requests Groove 0;
   interrupted fades resume from their fractional brightness; a future plan cannot switch
   the decorative clock before its audible start. The next-task scheduler used to cancel
   the already queued shaker, which now schedules after that cancellation. Perfect targets
   with extra taps no longer qualify as flawless. Duplicate completions cannot increment
   Groove twice. Mastery audio schedules on the shared audio clock when the summary opens,
   rather than late from a drawing callback. Restart/shutdown clear pending presentation.
3. **Files:** `src/ui/groove.ts`, `grooveStage.ts`, new `grooveReaction.ts`;
   `src/scenes/PlayScene.ts`; `src/audio/grooveSounds.ts`, `AudioEngine.ts`;
   `src/core/motionPreference.ts`; `src/vignettes/HouseholdVignette.ts`,
   `DjScratchVignette.ts`, `DoorbellVignette.ts`, `SnareDrumVignette.ts`,
   `PopcornVignette.ts`, `WindowCleaningVignette.ts`, `HammerNailVignette.ts`;
   `tests/audio.test.ts`, new `tests/groovePresentation.test.ts`, and this document.
4. **Groove 2 versus 1:** level 1 retains the existing Flawless payoff. Level 2 brings in
   a warm ambient pool, cream/brass edges, subtle downbeat breathing and local material
   highlights. Entering it produces a 650 ms light bloom at the task coda contact.
5. **Groove 3 versus 2:** two side lights and fixed brass corner catches join the room;
   selected objects gain a second highlight/light shape. Beat 1 has more emphasis than
   beats 2–4. Perfect responses briefly flare the room and selected materials. The target
   row, camera and scored objects retain their normal positions.
6. **Six acts:** DJ booth tape/back-wall lamps; Doorbell porch reflection; Snare lower rim
   and shell sheen; Popcorn hob/worktop reflection; Window glass/frame sheen; Hammer bench
   edge and fixed brass fasteners. One optional shared renderer supports the material
   patterns. No scored prop is moved, consumed or added.
7. **Audio:** a midrange brushed shaker, damped wooden F chime, and rolled Bb/F/C/G mastery
   voicing replace the thinner accents. The chime follows the existing music playback
   ratio. These are coda/handoff/result accents, never extra response-pattern information.
8. **Mastery:** stars and their normal three-star payoff retain first attention. Mastery
   begins 1.5 seconds after the normal summary opens, with a smaller halo, restrained
   plaque movement, fewer particles and a compact riveted `IN THE POCKET` tag.
9. **Finale hierarchy:** Area Complete starts at 1 second; its 1.7-second fanfare finishes
   before mastery begins at 2.75 seconds. Finale mastery has quieter audio and fewer
   particles. Keepsake entry waits for the badge's initial 650 ms settling period.
   Continue remains available; none of these timings gates navigation.
10. **Reduced Motion:** warm static lighting, brass edges, side lights and material
    highlights remain. State changes ease in opacity. Repeated scale pulses, beat-driven
    material oscillation and Perfect flares stop. Mastery retains its tag, glow and audio.
11. **Cost:** two extra images reuse the existing disc texture; one stage Graphics is
    drawn during layout, and one local Graphics belongs to each opted-in active act.
    Pose/pulse outputs are reused. No filters, new textures, emitters per hit, or extra
    AudioContexts. Three procedural buffers are cached per shared context. Android GPU
    frame-time and thermal behavior still require device measurement.
12. **DEV tools:** the existing debug panel now has room levels, Perfect flare, Reduced
    Motion, a repeating room study, and mastery result previews. The debug readout includes
    current/peak Groove, scored/flawless task counts and mastery. See usage below.
13. **Tests:** new coverage checks fractional fade reversals, threshold activation once
    per crossing (including regain), qualitative level-3 layers, static Reduced Motion,
    output/object reuse, null/future-plan clocks, resize/reset/destruction, all six
    materials, extra-tap disqualification, scheduling/cancellation, context buffer reuse,
    playback-rate support and fanfare/mastery separation. Existing rule, progression,
    intro/tutorial, scoring, rhythm, mastery and finale tests remain intact. Some scene
    orchestration checks are source contracts rather than full Phaser integration tests.
14. **Android follow-up:** listen on a phone speaker and headphones; check accent audibility
    at low volume, masking against each music layer, harshness and harmonic fit at all
    task tempos. Inspect the full first-time finale + mastery + keepsake combination,
    short screens/safe areas, early Continue, restart, background/resume, Bluetooth,
    system Reduced Motion and sustained low-end frame pacing.

## DEV preview usage

Run `npm run dev -- --host 0.0.0.0`, then open `/?debug&level=7`.
Open **Groove preview**, click **Loop room study**, and wait for the task to start.
This DEV rehearsal repeats the actual pattern without charging a new heart or recording
completed tasks. Choose **Room 0–3**; try 3 → 2 → 1 → 0 and 2 → 3. **Perfect flare**
previews the stage reaction; the study's actual Perfect hits exercise local reactions.
**Reduced motion** toggles a temporary override. Press **H** to hide/show debug overlays.
Restart or leave the scene to clear previews. Production builds omit these controls.

Use **Accurate replay** to exercise real progression through tasks and mastery; unlike
the room study, the existing replay tool uses the normal attempt/progress path.
**Mastery result** previews the current level's result without saving the fabricated
result. Use level 10 for Area Complete. The preview intentionally omits a newly earned
keepsake; test the first-time combined reward flow through real progression.

Representative starting levels: Hammer 1, Window 2, Doorbell 13, DJ 19, Snare 22,
Popcorn 52. Level 7 is useful for comparing the generic room treatment.

## Audio audit evidence and limits

The shipped stems were inspected with a 32,768-sample Hann-window FFT, sampling every
24,000 samples and accumulating pitch-class energy between 60 and 1,600 Hz. The bass
emphasized Eb/F/G/Bb; keyboard emphasized Bb/F/D/C/Eb/G; brass strongly emphasized Bb.
This motivated the open Bb/F/C/G voicing instead of the previous C-major-seventh E/B
tones. This is spectral evidence, not a verified transcription or a listening test.
Procedural buffer bounds, repeatability, envelopes, scheduling and reuse are tested;
the final subjective mix still needs listening on Android hardware.

## Verification record

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --reporter=dot`: 90 files, 1,149 tests passed.
- `npm run build`: passed. Vite reports unresolved runtime font references and ineffective
  dynamic imports in existing font/progress/Play Games paths; those paths were not changed.
- Browser inspection at 393 × 852 included real accurate gameplay through 100% mastery,
  room 0/1/2/3, threshold previews, Perfect feedback at 3, 3 → 2 decay, 2 → 3 regain,
  Reduced Motion, normal mastery, finale mastery, and the six selected acts.
- The brass corner catches and side/material lighting make level 3 distinguishable from
  level 2 in still frames. The target row remains visually stable and primary in motion.
- The final compact-screen retry hit repeated in-app browser renderer/input failures,
  including a later retry at 393 pixels. Console attachment also failed, so the cause
  could not be established. The 320 × 568 final result check remains unverified; this
  is not counted as a passing QA check. Earlier phone-size result inspection succeeded.
- No physical Android device, perceptual audio audition, or device performance profile
  was available in this pass.
