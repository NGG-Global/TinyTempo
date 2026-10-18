# The instant camera

Act 36. Requested as "a Polaroid camera with the shutter sound as the beat; success produces
a Polaroid picture". It is on the household lifecycle (`HouseholdVignette`), stands on the
shared shelf under the key light (`docs/STAGING.md`), and is synthesized throughout: nothing
is downloaded.

**It is never called a Polaroid on screen.** Polaroid is a registered trademark, and nothing
else in the game names a brand. The act is titled *Snapshot*, the camera is drawn as a generic
instant camera (no rainbow stripe, no logo) and the print as an instant print with its wide
bottom border. `tests/camera.test.ts` checks that no title, intro or verdict says "polaroid".

## Where it plays

It is appended to `VIGNETTES` with **debut level 171**, the opener of area 18 (Snow II), the
first area after the glasses. Appending an act moves every level from its debut on
(`docs/ACT_SCHEDULE.md`). Nobody has passed level 50, so the three keepsakes that moved
(ice cream's ice pop to 177, the frog's firefly jar to 187, the glasses' lemonade tumbler to
197) were re-pinned in `tests/fixtures/keepsakes.json` rather than grandfathered. The debut
is past 100, so Endless Mode's v1 pool is unchanged.

| Lap | Level | Subject and room | Camera | Title | Keepsake |
| --- | --- | --- | --- | --- | --- |
| 0 | 171 | A ginger cat on a cushion, at home | Cream, coral stripe | Snapshot | Cat snapshot |
| 1 | 207 | A birthday cake under bunting | Black, teal stripe | Party snapshot | Birthday snapshot |
| 2 | 243 | A sandcastle at the seaside | Sky blue | Holiday snapshot | — |

Laps then repeat every 36 levels. Each look has its own words (`CAMERA_LOOKS` in
`cameraLooks.ts`, through `VignetteDefinition.looks`), so a cake is never announced as a cat.

Development previews: `?debug&level=171`, `207` and `243`.

## The beat

Each beat is a press of the red shutter button, a flash and the shutter's click
(`shutterPress`, `flashLife` in `cameraMotion.ts`). The press is back up within 0.18 s, or
0.35 of a beat when that is shorter, so a sixteenth at the fastest tempo still reads.

**Only judged hits hang prints.** A clothesline runs across the top of the card with six peg
slots. Each judged hit adds to the share of the round answered, and `printsHung` fills the
slots in proportion. The demonstration flashes and clicks but hangs nothing, because nothing
waits between it and the response (`CLAUDE.md`). An extra tap is a soft half-press (`scrape`).
A missed beat stutters the motor (`judder`).

## The ending

The coda is one last shutter. The camera ejects its print (`ejectOut`), which then rises to an
upright frame beside the camera (`printRise`) and develops from a dark film to the picture
(`developed`). The ending lasts `CAMERA_REVEAL_SEC` (1.25 s) inside a five-beat hold, like
every household act.

- **Success:** the print shows the room and its subject, sharp and glossy, with a gleam and
  sparkles. The subject in the room smiles. Two chimes play.
- **Rough:** the same print comes out washed out, with a ghost of the subject beside itself,
  an orange light leak, and it sags as it develops. The subject has looked away. The motor chokes and
  falls on two low notes.

The two codas are identical up to `CAMERA_PARTING_SEC` (0.34 s), just after the motor's whir.
That keeps the outcome hidden until the print starts to come out, which `tests/camera.test.ts`
pins. Under reduced motion the print appears fully developed, with no slide or rise.

## Sounds

All synthesized in `audio/cameraSounds.ts`. The action has two takes, which the engine
alternates so the beat does not repeat one sample (`Voice` in `AudioEngine`). Each take is a
two-part shutter click and a spring ping. The codas add the motor whir; success adds a paper
flick and two chimes, and rough adds the choke and the falling tones.

## Keepsakes

`camera-cat-print` (lap 0, level 171) and `camera-party-print` (lap 1, level 207), drawn in
`ui/keepsakes.ts` as a pegged instant print of the cat and of the cake. The list stays
append-only.

## Not yet checked

The act has been checked in headless Chromium at all three looks, with an accurate and a
rough replay. It has not been heard or seen on a handset.
