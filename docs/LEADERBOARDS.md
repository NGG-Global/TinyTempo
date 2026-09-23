# Leaderboards

One Google Play Games Services leaderboard, for Daily Tempo, on top of the existing v2
authentication (`docs/PLAY_GAMES.md`), which it uses and does not change.

**Daily Tempo does not exist yet.** The leaderboard is created and its id is configured
(`CgkI0Mey9o8ZEAIQAQ`, in `src/config/leaderboards.ts`), but `DAILY_TEMPO_AVAILABLE` in
`src/config/dailyTempo.ts` is `false`, so in every current build nothing is submitted and no
leaderboard button is shown. Everything below is built and tested; the mode that feeds it is
the remaining piece.

| File | What it holds |
| --- | --- |
| `src/config/leaderboards.ts` | The leaderboard id, and Play Games' daily reset offset. |
| `src/config/dailyTempo.ts` | Whether Daily Tempo exists. |
| `src/playgames/leaderboard.ts` | Score conversion, id validation, the day's best, submission and retry rules. Pure. |
| `src/playgames/dailyTempo.ts` | The same, wired to the installed adapter, storage and analytics. What scenes call. |
| `src/playgames/playGames.ts`, `native.ts` | `submitScore` and `showLeaderboard` on the existing adapter and bridge. |
| `android/.../PlayGamesPlugin.java` | The two native methods, on v2's `LeaderboardsClient`. |
| `src/scenes/SettingsScene.ts` | The leaderboard button: Settings → Progress, shown only when it can work. |

## The score

Play Games leaderboards take whole numbers; Daily Tempo's result is a percentage. **The
score is the accuracy in thousandths of a percent**, `round(accuracy × 1000)`, computed by
`leaderboardScore` and nowhere else:

| Accuracy | Score | Shown by Play Games |
| --- | --- | --- |
| 0% | 0 | 0.000 |
| 72.5% | 72 500 | 72.500 |
| 98.7654% | 98 765 | 98.765 |
| 100% | 100 000 | 100.000 |

Three decimals separate players the game would show as the same rounded percentage. The
product is taken through six decimals before rounding, because `0.5005 × 1000` is
`500.49999999999994` in binary floating point, and the same accuracy must score the same
everywhere. Out-of-range inputs clamp to 0–100%; anything that is not a finite number is
not a result and is not sent. **Do not change the scale after launch**: old and new scores
would sit on one board in different units.

## Daily, weekly and all-time

Play Games "automatically creates daily, weekly, and all-time versions of every leaderboard
that you create. There's no need for you to create separate leaderboards for each
timeframe" (developer.android.com/games/pgs/leaderboards). So there is **one leaderboard**,
and the button opens it on its daily view; the player can switch views on Play's screen.

The same page: "Daily leaderboards reset at UTC-7 … all year long", and weekly ones "at
midnight between Saturday and Sunday" on that clock. **Daily Tempo's day is therefore read
on UTC−7** (`dailyTempoDay`), not the player's local date. A daily board is one board for
everyone: on local dates, players in different time zones would be posting different days'
charts onto the same daily view, and a best kept until local midnight would reach Play
Games after it had begun the next day's board. On UTC−7 the day's chart, the best kept for
it and the board turn over at the same instant. The daily heart and the daily objectives
stay on local time; they are the player's own day. (One consequence for later: the "Finish
today's Daily Tempo" objective counts on local time, so near midnight it can credit a run to
the neighbouring objective day. That is cosmetic, and is worth settling when the mode ships.)

## Best score only

`playgames/leaderboard.ts` keeps one small record, `tiny-tempo.daily-tempo-best.v1`: the
day, the best score, and the highest score Play Games has confirmed.

- A result that does not beat the day's best **sends nothing**.
- A better result is sent at once; a pending one (see below) is carried by the next result.
- **A best from an earlier day that never reached Play Games is dropped.** A score carries
  no date to Play Games, so sending yesterday's best today would file it on today's board.
  Every submission does carry the day as its score tag, for inspection.
- Play Games itself keeps each player's best per view, so a duplicate send is harmless;
  the local rule is what saves the call.

## Failure, offline and signed out

Nothing here can delay or fail a result screen. The mode calls `void recordDailyTempo(accuracy)`
and moves on.

- **Signed out**: the best is kept and nothing is asked of Play Games — no prompt, and no
  analytics event, because it is the player's choice. v2 signs players in automatically at
  startup; the submission path only asks whether that happened (`refresh`), never `signIn`.
- **Offline or failed**: `submitScoreImmediate` reports whether the score arrived (v2 has no
  deferred-operation status of its own), so a failed score stays pending and is retried on
  the next result, at the next boot once Play Games reports the player signed in, and when
  the player opens the leaderboard.
- **No answer**: a submission that has not resolved in 15 s is treated as failed and kept.
- **Browser or unconfigured**: nothing is sent and the button is not shown.
- Submissions go one at a time; a result that arrives mid-send waits, then sends only if
  it is still better.

`submissionCopy(outcome)` gives a result screen one plain line: *Posted to the
leaderboard*, *Will post when you are back online*, *Sign in to Play Games to post your
score*, *Your best today still stands*, or nothing.

## The button, and sign-in

The Settings → Progress row **Daily Tempo leaderboard** exists only when
`dailyTempoLeaderboardOffered()` is true: a native build, a valid id, and Daily Tempo
switched on. Signed out is not a reason to hide it. Tapping it is the **one place the game
offers Play Games sign-in**, because the player asked; if they decline, or the screen will
not open, the notice line says so once. The Daily Tempo result screen, when it exists,
should show the same button through `openDailyTempoLeaderboard()`.

## Configuration

`src/config/leaderboards.ts`:

```ts
export const LEADERBOARDS = {
  dailyTempo: 'CgkI0Mey9o8ZEAIQAQ',   // the Leaderboard ID from the Play Console
} as const;
```

The value is the **Leaderboard ID** the Console generates — letters, digits, `-` and `_`,
typically beginning `CgkI`. It is not the numeric Games project id (`863268283344`), and
`leaderboardId()` refuses an all-digit value for that reason. It is public (it ships in
every APK), so it lives in source like the AdMob ids. `scripts/check-android-config.mjs`
warns after `cap sync` if the value is malformed, or if Daily Tempo is switched on with no id.

**Copy the id with the Console's copy button; never retype it.** The first id supplied for
this leaderboard arrived as `CgklOMey908ZEAIQAQ` — three characters swapped for look-alikes
(`I`→`l`, `0`→`O`, `o`→`0`). It passed the character check, and would have failed every call
on device. The Console's ids are URL-safe base64 of a small protobuf that carries the Games
project id and the item's number, so the check script decodes the id and warns unless it
names project `863268283344`, and `tests/leaderboard.test.ts` pins the configured one.
`CgkI0Mey9o8ZEAIQAQ` decodes to project `863268283344`, item 1. The number counts
leaderboards and achievements together — the five achievements are items 2 to 6 — and the
`0x10 0x02` between the two is the same in all six, so it is not a type. That layout is
observed, not documented by Google, which is why the script only warns.

## Play Console

1. **Create the leaderboard.** Play Console → Tiny Tempo → Grow users → Play Games Services
   → Setup and management → Leaderboards → Add leaderboard.
   - Name: *Daily Tempo*.
   - Format: **Numeric**, **3 decimal places**.
   - Ordering: **Larger is better**.
   - Limits: minimum **0**, maximum **100000**. Anything outside is discarded.
   - Tamper protection: leave **on**. It is on by default for new Android leaderboards,
     and it hides suspected tampered scores. The game submits only from the signed app
     through v2, which is the case it is designed for, and there is no server.
   - Save. The leaderboard is a **draft**, which accounts on the testers list can use.
2. **Copy its Leaderboard ID** (with the copy button) into `LEADERBOARDS.dailyTempo`. Done:
   `CgkI0Mey9o8ZEAIQAQ`.
3. **Credentials.** Configuration → Credentials must have an Android credential for
   `com.tinytempo.app` with the SHA-1 of each certificate that signs a build you test: the
   Play **app signing** key for anything installed from Play, and the debug or upload key
   for a sideloaded build. A certificate without a credential fails authentication.
4. **Testers.** Setup and management → Testers → add every tester's Google account, yourself
   included, or add the internal testing track under Release tracks.
5. **Publish the Play Games changes** when ready: Setup and management → Publishing. This is
   **separate from publishing the APK or AAB**, and Google allows up to 2 hours for it to
   reach players. Publish Play Games changes before the app release that depends on them.

## Analytics

`leaderboard_score_submitted`, `leaderboard_submit_failed` and `leaderboard_opened`
(`docs/ANALYTICS.md`). They are service events, not gameplay ones (`SERVICE_EVENTS`). No
player id and no leaderboard id is ever sent.

## Checked, and not

- The v2 API was checked against the pinned `play-services-games-v2:22.1.0` artifact with
  `javap`. `PlayGamesPlugin.java` compiles against the real Games, Tasks and base jars,
  with only the Android framework and Capacitor stubbed. **It has not been built by Gradle
  or run on a device** — there is no Android SDK here.
- The Settings row was laid out and tapped in headless Chromium, with the offer check
  forced on for the screenshot and then reverted; in the browser the tap reports Play Games
  unavailable, as intended.
- Not verified: submission and the leaderboard screen against a real Play Games account.
