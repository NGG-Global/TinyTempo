# Reaching a person

The store listing carries an address, which is no use to someone already inside the app
whose progress has just gone. This is the route from the game itself: Settings → Help →
`SupportScene`, on the same pattern `CalibrateScene` and `TransferScene` follow.

## It is mostly not the address

The address is one line. The screen exists for the other seven.

```
App: 0.1.0 (com.tinytempo.app)
Running on: Android app — Android 14 · Pixel 7 · WebView · Chrome 120
Progress: level 23 (Sand), 22 cleared
Audio: estimated clock · device reports 210 ms · offset 0 ms
Premium: no
Hearts: 5/5
Reporting: crash reports on, usage data off
Save code: 04BG1-NQZ0S-E4WS0-07M00-…
```

A player cannot be expected to know their build number, their WebView version or how many
levels they had cleared, and a thread that opens by asking for them has already cost a
day. Every line answers a question a reply would otherwise have to ask:

| Line | The ticket it answers |
| --- | --- |
| App, Running on | "It is slow" / "it looks wrong" — needs a build and a device to reproduce on |
| Progress | Where it happened, and which act |
| Audio | "It feels delayed" — unanswerable without the clock mode, the platform's reported lag and the player's offset, and unanswerable *with* a player's description of them |
| Premium, Hearts | Every billing complaint |
| Reporting | Whether there is a crash report to go and look for |
| Save code | "I lost my progress" — the only thing that can restore it |

`supportReport` is pure and lives in `src/game/supportReport.ts`, so what it says can be
read in a test rather than inferred from a screenshot.

## What is sent is on the screen before it is sent

This is the whole difference between a support report and telemetry, and it is why the
block is shown in full rather than hidden behind an "include diagnostics" switch. The
player can read every line, and delete any of them from the message.

## The user-agent is reduced, not truncated

A WebView's is about 160 characters of which twenty matter. `describeDevice` pulls out the
Android version, the model and the Chrome build and drops the rest — shorter to read in a
thread, and meaningfully less like a fingerprint than shipping the whole string.

It parses the platform block by **counting bracket depth**, not with `\(([^)]*)\)`. Some
model names contain brackets of their own — Motorola ships `moto g(30)` and `moto g(60)` —
and a non-greedy match ends at the model's own bracket and loses the rest of the block.
That was a real bug, caught by a test written with a real model name in it.

Anything it cannot parse falls back to a truncated agent rather than to nothing.

## Neither button is the only way out

`mailto:` depends on the device having a mail app and on the WebView handing the scheme
over. The clipboard needs a secure context and a permission a WebView can decline. So the
address and the details are both legible on screen and both buttons are conveniences — the
same discipline the save code's Copy button follows.

The report is wrapped with Phaser's *advanced* word wrap, because a save code is one
58-character word with no spaces in it and basic wrapping leaves it hanging off the card.

## The player whose game will not start

They cannot reach Settings, so the support screen does not exist for them — and a boot
failure is the report most worth receiving, because it is the one the player cannot work
around. The boot panel therefore carries the address too.

Three cases, measured in a browser rather than assumed:

| Failure | What happens |
| --- | --- |
| WebGL refused, 2D available | `Phaser.AUTO` falls back to canvas and the game runs. Nothing to report. |
| A scene throws during boot | `main.ts` catches it, or the inline handler does, and the panel appears. |
| **Every canvas context refused** | Phaser's *import-time* feature detection dies, so `/src/main.ts` never evaluates. |

That third case is why there is an inline `<script>` in `index.html` and not just
`showBootError`. Nothing in the bundle runs — not the error capture, not the shell — and
the player is left watching the spinner turn with no message and no way to tell anyone.
An ordinary handler in `main.ts` was written for this first and was pure theatre; the
probe that proved it showed `main.ts` had never executed at all.

The inline handler stands down if the overlay is gone (the game started) or if the title
is already set (a bundle that did load got there first), so the two can never fight.

The address is duplicated in `index.html` for the same reason the palette is: it has to
work before anything can be imported. `src/config/support.ts` is the source; the two legal
pages and the Play listing carry it as well, and all of them change together.

## Not verified

- **The `mailto:` hand-off is untested on a device.** Whether a Capacitor WebView passes
  the scheme to a mail app, and what happens when no app handles it, needs hardware. The
  address and the details stay readable on screen either way, which is why the button
  failing is not the feature failing.
- **The clipboard is untested in a WebView**, for the same reason as the save code's.
