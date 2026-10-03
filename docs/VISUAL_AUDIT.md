# Visual audit

Every screen and the states that matter on each, captured on three frames and read one by
one:

- **Phone:** 393×851 CSS at 2×, a 20:9 handset, logical 720×1559.
- **Short phone:** 375×667 at 2×, 16:9, logical 720×1281.
- **Tablet:** 768×1024 at 2×, 4:3 portrait, logical 960×1280.

The screens covered:

- the title, with and without progress;
- the map: early, at a finale, at a closed gate, on Dusk, the out-of-hearts sheet and the
  objectives card;
- Settings, top and bottom;
- the Tap offset, Save code, Help and Scrapbook screens;
- the tutorial;
- a level: idle, paused, the restart sheet, every result (failed, two stars, three stars,
  timing details, mastery, an area finale) and the empty-hearts screen.

The harness drives the dev build through `window.__PHASER_GAME__`: it seeds storage, starts
the scene and screenshots it. It runs SwiftShader at about 11 fps, so the controller's own
stall guard pauses live gameplay there. Gameplay frames were read from the tutorial and from
the restart work. A blank frame in the harness was always the scene curtain still covering
the screen, never a crash.

## Fixed

| Where | What was wrong | Fix |
| --- | --- | --- |
| Level, refused start | The empty-hearts screen drew the previous visit's result plaque behind its offer: blank medals, "On the beat", "Heart kept", an empty star strip, under "No hearts". The summary fields were reset in `startRound` only, which a refused start never reaches. | `PlayScene.build()` resets every per-run field. This is the "assigned in `build()`" rule again. |
| Every left-aligned headline | Dressed display text sat a stroke and a pixel right of the body text under it: Settings' "Premium" over its terms, the map's "Watch" over "30 seconds". | `dressPad` keeps one unit of horizontal padding. Phaser already counts the stroke into the line and draws half a stroke in. |
| Tap offset, Save code, Help captions | Auto-wrapped captions left one word alone on the last line ("…knows your / device."). | `balanceWrap` narrows the wrap to the least width that keeps the line count. Hand-broken copy keeps its breaks. |
| Scrapbook | "Plum beetle / pin". | A name up to 18% too long squeezes onto one line; a longer one balances. |
| Help | "device reports 42 / ms" split a number from its unit. | A no-break space, on screen only; the copied report is unchanged. |
| Map, open gates | An open gate's left post cut through the middle star of its area's first level. | Open gates are laid with the road, under the stops (`drawOpenGates`). |
| Map, header | Stops, lamp posts and the next area's name board slid under the sign and the pucks and read as part of them ("9" between Back and the gear, "Sand" behind "Dusk"). | A soft haze in the top area's own colour behind the header (`drawHaze`), redrawn only when the area or the frame changes. |
| Tablet tutorial | The hammer's head lay across the caption. | `HammerNailVignette.layout` takes a headroom line and scales the tool to stand under it. |
| Tablet title | The hammer's head touched the sign. | The same headroom, under the sign's foot. |
| Settings | Reset went back to mixed case after arming, beside upper-case chips. The footer's own comment said "Privacy · Terms · vX" but drew no dot before the version. | Upper case on every `setText`; the dot is drawn, with a word space. |
| Result | "Heart kept" and its heart were each placed on a guess, about 12 units right of centre. | Centred as one group. |

## Looked at and left as designed

- **Intro headlines like "Easy does / it."** are hand-broken in the registry for every act
  ("Make it / stick.", "Bind it / up.") and are the voice.
- **The result plaque hangs high** with room under it: `planResult` hangs it "a fifth of the
  spare room down", pinned by `tests/resultLayout.test.ts`.
- **The out-of-hearts sheet's prices:** Premium on a coral chip, the refill as plain text.
  The sheet ranks its offers on purpose (`docs/UI_REFINEMENTS.md`).
- **The map's out-of-hearts sheet on a tablet** reaches over the dimmed header. It is a
  modal over a scrim, and the frame is short for its width.
- **The act's edges at the plaque's sides** (the cutting board's ends either side of a
  result) are the act behind the plaque. Dimming it would also dim the coda's last picture.
  Left alone, but noted.

## Not changed: render resolution

**The game renders at its logical size, and the browser stretches the canvas to the
screen.** On a 393 CSS-pixel phone at 2.75× the canvas is 720×1559 against 1,081×2,338
device pixels: a 1.5× upscale of every letter, outline and edge. Text and strokes are
readable but visibly soft next to a native app.

This is a recorded decision, not an oversight. `config/design.ts` chose the 720-wide box for
half the fill rate of 1080p, and Phaser 4.2 has no resolution or device-pixel-ratio
option. Making it sharp means rendering a larger logical frame, about
`devicePixelRatio × min(cssWidth / 720, cssHeight / 1280)` times the design box (~1.5 on
that phone), and capping it. Because every scene lays out from
`s = min(safe.width / 720, safe.height / 1150)` and the viewport, most of the game would
follow on its own.

The parts that would not follow are anything sized in raw pixels rather than through `s`:

- particle presets;
- the material tiles' scale;
- the second camera's viewport in Settings;
- each act's own scale formula.

The cost is about 2.25× the pixels filled per frame on that phone.

It needs a measured decision on a mid-range handset. It is the one change here that could
lose frames, so it was not made inside an audit.

## Not verified

- No real device. Text rasterisation, the haze's banding and the WebView's own scaling should
  be looked at on a handset, at arm's length, before calling any of this final.
- Landscape tablets were not captured. `CLAUDE.md` already says that layout has not been seen
  on a real tablet.
