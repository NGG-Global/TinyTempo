---
name: Tiny Tempo
description: A tactile cartoon workshop — paper, ink, one coral action, brass only where money is
colors:
  paper: "#eee8d8"
  ink: "#243e35"
  muted-ink: "#4e5a52"
  coral: "#cf5134"
  sign-cream: "#fff4dc"
  puck: "#f6ead0"
  timber: "#d98a48"
  rope: "#6b4a2e"
  bench: "#e6dcc4"
  sun: "#dfc37f"
  brass: "#d4a54a"
typography:
  display:
    fontFamily: "Fredoka, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Nunito, sans-serif"
    fontWeight: 600
  label:
    fontFamily: "Nunito, sans-serif"
    fontWeight: 800
    textTransform: uppercase
rounded:
  panel: "18 design units"
  block: "28 design units"
  puck: "round"
spacing:
  screen-padding: "28 design units"
  min-touch-target: "88 design units (~48 CSS px)"
components:
  action-block:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.sign-cream}"
    rounded: "{rounded.panel}"
    height: "110 design units"
  utility-puck:
    backgroundColor: "{colors.puck}"
    textColor: "{colors.ink}"
    rounded: "{rounded.puck}"
    size: "68 design units"
  hanging-sign:
    backgroundColor: "{colors.timber}"
    textColor: "{colors.sign-cream}"
    rounded: "{rounded.panel}"
  store-panel:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.sign-cream}"
    rounded: "{rounded.panel}"
---

# Design System: Tiny Tempo

## Overview

**Creative north star: The Workshop.** Chosen in a style lab over a matte studio and a
brass-and-stained-wood tavern (`src/config/style.ts`), and taken from Cut the Rope's
body: thick outlines, painted materials, heavy squash. Every surface is an object with
thickness under one warm key light, not a panel with a border. The title hangs from the
ceiling on ropes, the one primary action is a block sitting on a bench, utility controls
are pucks, and the thing for sale is the only brass on screen.

The player is a thumb on a phone, watching a tiny everyday act and tapping its rhythm
back. The interface's job is to get out of the act's way: copy is sparse, meaning is
carried by composition, motion and object state, and text is reserved for the current
area, the act's name, the turn handover, the result and actionable settings
(`docs/VISUAL_POLISH.md`).

Anti-references: a web page (Georgia headlines and letter-spaced monospace eyebrows were
removed for exactly this reason); a dashboard of grey cards; any screen where a heading,
a value and an explanation stack up where one object would do.

## Colors

Four colours key the whole game (`PALETTE`, `src/config/theme.ts`); everything else on
screen derives from them, or from an act's own palette, through `ui/colour.ts`.

- **Paper** `#eee8d8` — the canvas clear colour and the ground every stage sits on. Also
  the DOM shell's `--shell-bg`, the `theme-color` meta and the Capacitor background:
  change all of them together.
- **Ink** `#243e35` — a deep green-black. Type, outlines, the forged tools.
- **Muted ink** `#4e5a52` — captions, miss marks, the overlay note. Chosen to hold 4.5:1
  on paper; a lighter sage washed out.
- **Coral** `#cf5134` — the one action colour. Play, the current level, the curtain's
  leading edge, Perfect.

The shell's workshop surfaces (`SHELL`): sign cream `#fff4dc`, puck `#f6ead0`, timber
`#d98a48`, rope `#6b4a2e`, bench `#e6dcc4`, sun `#dfc37f`. **Brass** `#d4a54a`
(`ui/panel.ts`) is reserved for the store and the result medals.

Rules:
- Outlines are a dark shade of the fill, never black. `typeStroke` refuses an outline a
  fill cannot carry (contrast under 3:1 against ink) and the letter lifts on cream instead.
- Dimming a room is an edge vignette tinted from the act's own paper, never a flat wash;
  a green-black wash over cream and timber reads as dirt.
- Acts keep their own stage palettes. The shell does not restyle itself per act; it stays
  paper, cream and coral, and reads the act's paper only where it must sit on it (the
  verdict pill, the block's backing, the room's dim).
- Every area of the road has an ink and a paper of its own (`config/progression.ts`);
  the area's badge, name board and haze take them.

## Typography

One display face and one body face, bundled and registered before the menu builds
(`src/ui/type.ts`). Android ships no Georgia; nothing here depends on a system font.

- **Display — Fredoka 700.** Headlines, values, verdicts, the sign. Always *dressed*: an
  outline whose weight tracks the treatment's silhouette weight (`size × 0.02 × 7`),
  tapered quadratically below 44 px so Fredoka's counters stay open, and a hard drop under
  the letter that reads as thickness rather than glow. A letter that carries an outline is
  a printed sticker and drops dark; one that cannot is ink pressed into paper and lifts on
  cream.
- **Body — Nunito 600.** Running copy, undressed, so it sits back behind the display.
- **Label — Nunito 800, uppercase, no tracking.** Controls and small tags.

Sizes are design units multiplied by the scene's `s`; there is no fixed scale. Intro
headlines ("Make it / stick.") are hand-broken in the registry and keep their breaks;
auto-wrapped centred captions go through `balanceWrap` so no word stands alone on a last
line. A dressed letter carries one unit of horizontal padding: Phaser already counts the
stroke into the line.

## Layout

The game is authored against a 720×1280 design box under `Phaser.Scale.EXPAND`
(`src/config/design.ts`), drawn at device resolution (`renderScale`, capped by
`RENDER_SCALE_MAX`). Scenes never read the design constants to place anything; they lay
out against the live `Viewport` (`full`, `safe`, `content`, `designBox`) and one scale,
`s = min(safe.width / 720, safe.height / 1150)`.

- Screen padding 28 units; minimum touch target 88 units (about 48 CSS px); essential
  navigation targets at least 56 CSS px apart.
- Thumb zone is absolute: the turn block's face keeps its distance from the bottom edge
  (`LAYOUT.trackOffsetFromBottom`, 260 units) on every frame and grows in place.
- The title screen is an object composition, not a menu. Settings scroll between a pinned
  title and a pinned Done, clipped by a camera viewport rather than a mask.
- The map is an endless road rendered in a bounded window, grouped into ten-level areas,
  with a header sign fixed to the camera and a persistent next-level dock.
- Tablets and 16:9 phones are laid out from the same rules; `docs/VISUAL_AUDIT.md` lists
  the frames every screen is checked on.

## Elevation & Depth

One light for the whole game (`ui/light.ts`): upper-left, fairly high
(`x: -0.5, y: -0.75`), shadow reach 1.1 units per unit of depth. Everything that casts a
shadow, catches a rim or shades a face derives it from `castShadow` and `faces`, so every
surface agrees about where the light is.

A panel is a solid with thickness (`ui/panel.ts`): cast shadow, a shade face that reads
as the side wall, a contact strip along the bottom, the lit face, a rim catch along the
top, then the treatment's outline. A press sinks the face toward the wall and tightens the
shadow (`CHROME.pressSec` 0.42 s spring). Shadows are offset and lighten with reach; a
zero-offset halo is never used for depth.

Materials are generated, seeded tiles (`textures/materials.ts`: paper, wood, metal,
cloth, parchment), laid over a face as one tinted tile sprite at low alpha — a surface
finish, not a picture of wood.

## Shapes

- Panel radius 18 units (`WORKSHOP_TREATMENT.radius`); the turn block's plate 28; pucks
  are discs of radius 34 with depth 7; the action block is 560×110 with depth 16
  (`ui/chrome.ts`).
- Outline weight 7 units at scale 1 for objects; panels take 0.55 of it, type its own
  tapered share. Type and object agree on silhouette weight by construction.
- Exaggeration 1.35: squash, overshoot, shake and particle counts all scale by it
  (`ui/spring.ts`, `ui/feedback.ts`).

## Components

- **Action block** — coral slab on the bench, cream display label. One per screen at
  most; a secondary action (Replay, How to play) is a wood block.
- **Puck** — cream disc, ink icon, press sinks it. Icon-only; a first-visit tag
  (`ui/puckLabel.ts`) names it until it has been opened.
- **Hanging sign** — timber board on two ropes, swinging as one rigid body about the
  ceiling. The menu's is larger and hangs on heavier line than the map's.
- **Turn block** — two rows on a patch of sheet: the shelf (their turn) and the face
  (yours), owner slots on the left, beat sockets, a baton that bows across on the
  handover. Drawn at 1.2× the scene's scale (`BLOCK_SCALE`); its width is cut to the
  phrase, not to the frame.
- **Verdict pill** — the word on a pill of the act's paper, popping in over 0.45 s.
- **Result plaque** — hung high on ropes; stars drop as brass medals left to right.
- **Scene curtain** — a 320 ms diagonal sweep of paper with a coral edge and an ink edge
  ahead of it; an immediate cut under reduced motion.
- **Settings card** — one large state and one action per card; sections under uppercase
  eyebrows; the store is the one brass object.

## Do's and Don'ts

**Do**
- Derive every tone from `PALETTE`, `SHELL`, an area's ink and paper, or an act's palette
  through `shade`, `mix` and `faces`.
- Draw through `drawPanel`, `drawDisc`, `display`, `body`, `label` — never a hand-rolled
  rounded rectangle with a hairline stroke, never a raw text style.
- Multiply every size by `s`; read the frame from the `Viewport`.
- Keep motion on the audio clock where it is judged, and on the frame delta only where it
  is decorative. Respect reduced motion with a cut, not a shorter tween.
- Say less. If a word is not the area, the act, the handover, the result or an actionable
  setting, it probably does not belong on screen during play.

**Don't**
- No letter-spaced uppercase eyebrows or technical footnotes in normal play.
- No flat dim over a lit room; no black outlines; no grey cards.
- No fifth colour for an action, and no brass outside the store and the medals.
- No chrome that restyles itself per act; the act changes, the workshop does not.
- No numbers in raw pixels: particle presets are the one exception and go through
  `currentRenderScale()`.
