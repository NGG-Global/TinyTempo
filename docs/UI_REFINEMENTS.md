# Settings, star reveal and out of hearts

Three screens redrawn from a Claude Design handoff (`Game UI design refinements`,
synced against `main` on 2026-09-17). The rest of the game is unchanged: every
surface here is still built from `config/theme.ts`, `config/style.ts`, `ui/panel.ts`,
`ui/type.ts`, `ui/light.ts` and `ui/icons.ts`, and no scene gained a rule about
timing, scoring or health.

## Settings

Four identical grey cards became labelled sections. Each section is an eyebrow
(`ui/type.ts` `label`) over one card, and the cards now hold rows rather than a
sentence and a button whose caption was the opposite of that sentence — "Sound on"
beside "Mute".

- **Sound & feel** — two switches (`ui/switch.ts`). A switch states the value and
  the action at once; the knob's side is the state and the track's colour is
  whether it is on. Haptics is new; see below.
- **Timing** — the measured offset, and `TUNE` into its own screen.
- **Hearts** — status, not an offer: the five hearts, the count, and a bar the
  next heart is filling (`heartProgress` in `game/health.ts`).
- **Workshop store** — the one brass object on the screen, because it is the one
  thing for sale. The heart refill row under it disappears at five hearts or with
  premium held, rather than sitting there as a control that cannot act.
- **Progress** — the level, and the one control with no undo, which arms before
  it fires.

The sections scroll between a pinned title and a pinned Done. **The scrolling band
is clipped by its own camera, not by a mask.** Phaser 4 dropped WebGL geometry
masks — `GameObject.setMask` logs a warning and no-ops off the canvas renderer —
and its replacement (`FilterList#addMask`) renders the mask to a DynamicTexture.
A camera viewport is a scissor rectangle and costs nothing. `bandCamera` holds the
scroll, so scrolling moves no object and re-lays out nothing. The band camera does
not draw the scene curtain, because a `setScrollFactor(0)` object lands offset by
the viewport's own origin under a second camera; the sections fade out over the
first frames of a sweep instead.

Controls fire on the release, with a slop check. `TapInput` reports the press,
which is right in gameplay because there the press *is* the musical event; in a
scrolling list a press is the start of a gesture that may turn out to be a scroll.

Privacy and Terms open the published pages
(`https://ngg-global.github.io/TinyTempo/{privacy,terms}/`, built from `legal/` by
`.github/workflows/pages.yml`) in the system browser. The version comes from
`package.json` through `__APP_VERSION__`, defined in `vite.config.ts`, so the
footer cannot drift from the package.

### Haptics

`src/core/haptics.ts` wraps `navigator.vibrate`. It is the one web API in the game
beyond Web Audio and pointer events, and the rule in `CLAUDE.md` was changed
deliberately rather than worked around: a rhythm game played with one thumb
confirms a landed tap with sound the player may have muted and with motion the
thumb is covering, and a pulse is the only channel left. Every call is
feature-detected and every failure is silent. `AndroidManifest.xml` carries the
matching `VIBRATE` permission — a normal permission, granted at install with no
runtime prompt. The switch stays live on a device with no vibrator, dimmed and
noted, so a dead toggle never reads as a broken one. Pulses are 12–26 ms and fire
only on something the player just did.

## Tap offset

Calibration has its own screen (`scenes/CalibrateScene.ts`, `SceneKey.Calibrate`).
It was the first row of Settings: a value, a button and four beads on a 118-unit
card, with the whole list still competing for the eye while the player was asked
to hold a beat for sixteen seconds.

`CalibrationRun` still owns the measurement — median of the taps that land, as a
residual against the offset already in force — and this scene owns only the screen
and the audio. Start and the result share the footer: the run button is the thing
to press until there is a measurement, and then the measurement is, so the screen
never carries an empty strip where the other one will be.

## Star reveal

The result was a 268-unit cream plate parked on the beat track with three 20-unit
stars on it, which read as a caption rather than as the end of a level. It now
hangs from the ceiling on two ropes, drops into place, and the medals — two and a
half times the size, straddling its top edge — knock it down a little as each one
stamps.

Every pose is still `f(t)` sampled from the audio clock, in `ui/starReveal.ts`:

- `plaquePose(age)` — the swing in, and the ringing that follows it.
- `plaqueJolt(summaryAge, earned)` — summed from the impacts themselves rather
  than run off a fixed timeline, so a one-star finish knocks the plaque once and a
  three-star finish knocks it three times, in time with the brass.
- `chorusBurst(summaryAge, earned)` — the fan of light behind the whole plaque,
  thrown by the third medal only.

Under reduced motion the plaque is *still*, not merely quicker. The plaque hangs
just under the headline on a 16:9 frame and takes a fifth of whatever a taller
handset adds, so it never floats at the top of a long screen while the space under
it still belongs to the act. The timber sign behind the headline is drawn only
during a round: it exists to tell Watch from Your turn as two objects rather than
two colours, and outside a round it only boxes in a headline the backdrop already
sets off.

## Out of hearts

Both places state the same three facts in the same order — what is gone, when it
comes back, and the ways out ranked free first.

**The map sheet** (`MapScene.drawRest`) dims the road, shows the five hearts with
the next one filling, and then: the free daily heart when it is available, the one
coral rewarded watch, the refill, premium, and a control that closes the sheet.
The old sheet stacked three near-identical grey buttons and let a tap on the
backdrop be the way out.

**The mid-run plaque** (`PlayScene`) is the same ranking with the act dimmed behind
it: the hearts under the headline, the countdown, Watch (or Today, when the free
heart is there), and the two paid ways out side by side.

Premium is offered in both places now, and a successful purchase drops straight
back into the level the player was stopped on — entitlement lifts the heart cost
entirely, so there is nothing left to wait for. `monetization/copy.ts` holds the
store's words in one place, because the same offer is made on three screens and an
offer worded three ways reads as three products.

## Shared pieces added

| Module | What it is |
| --- | --- |
| `ui/switch.ts` | The two-state switch; `switchKnob` is Phaser-free so its geometry is unit-tested |
| `ui/sheen.ts` | The band of light crossing a brass panel, clipped to its corners, still under reduced motion |
| `ui/chrome.ts` | `drawActionDisc` (the cream play disc inside a coral block) and `drawHeartRow` |
| `ui/icons.ts` | `drawChevron`, `drawInfinity`, `drawVibrate`, `fillHeart`, `strokeHeart` |
| `ui/colour.ts` | `OUTLINE_CONTRAST`, and a `typeStroke` that returns `null` rather than an illegible border |
| `ui/panel.ts` | `PanelSpec.frame`, so a brass panel takes a cream accent line rather than brass on brass |

## The outline rule

The workshop's thick outline is built for cream type on timber or coral, where a
dark stroke is what gives the letter its silhouette. `typeStroke` derived that
stroke by self-shading the fill — and for a dark fill there is nothing below it
but black. Measured against the fills the game actually uses:

| Fill | Old outline | Contrast |
| --- | --- | --- |
| Cream on timber | `#1c3029` | 12.8:1 |
| Brass | `#3b2e15` | 5.9:1 |
| Timber | `#3d2714` | 5.1:1 |
| Coral | `#3a170f` | 3.7:1 |
| **The game's ink** | `#0a110f` | **1.65:1** |
| **Grass / Pavement / Sand / Snow ink** | near-black | **1.5–2.0:1** |

Below about 3:1 the border stops being a silhouette and becomes a thicker,
muddier stem: it closes Fredoka's counters and turns a word into a logo. So
`typeStroke` now returns `null` when the outline it would produce cannot clear
`OUTLINE_CONTRAST`, and `ui/type.ts` gives those letters no stroke and a pale
drop instead — ink pressed into paper rather than a sticker laid on it. Nothing
changed for a light or mid-tone fill.

This is app-wide by construction, not screen by screen: every act's ink and every
area's ink is a display fill somewhere, and `tests/ui.test.ts` walks the registry
and the area list so a new act cannot reintroduce the border.
