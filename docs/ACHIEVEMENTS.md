# Achievements

Google Play Games Services achievements, on the existing v2 authentication
(`docs/PLAY_GAMES.md`), which they use and do not change. The first five mark the five area
finales.

| File | What it holds |
| --- | --- |
| `src/config/achievements.ts` | Each achievement: its key, the level that earns it, its Console id (empty until created). |
| `src/playgames/achievements.ts` | What a save has earned, and the sync to Play Games. Pure. |
| `src/playgames/achievementSync.ts` | The same, wired to the config and the installed adapter. What scenes call. |
| `src/playgames/playGames.ts`, `native.ts` | `unlockAchievement` and `showAchievements` on the existing adapter and bridge. |
| `android/.../PlayGamesPlugin.java` | The two native methods, on v2's `AchievementsClient`. |
| `src/scenes/SettingsScene.ts` | The Achievements button: Settings → Progress, shown only when it can work. |

## The first five

| Key | Earned by | Area |
| --- | --- | --- |
| `clear-10` | Clearing level 10 | Grass |
| `clear-20` | Clearing level 20 | Pavement |
| `clear-30` | Clearing level 30 | Sand |
| `clear-40` | Clearing level 40 | Snow |
| `clear-50` | Clearing level 50 | Dusk |

*Clearing*, not reaching: level 10 opens when level 9 is cleared, but the achievement is for
finishing the finale itself, so the unlock popup lands on the same result screen as the
"Area complete" ribbon across the plaque.

## Earned is derived; unlocking is re-sent

**Nothing is stored.** An achievement is earned exactly when the save has cleared its level
(`hasEarned`), the rule keepsakes and stars follow. A save from before achievements existed,
a save code, a merge and an Auto Backup restore all carry them without knowing it, and a
player already past level 30 is owed the first three the first time they are signed in.

**Nothing is remembered about Play Games either.** Google documents that an achievement
"can be unlocked offline. When the game comes online, it syncs with Play Games Services",
and that unlocking one already unlocked is harmless. So the game uses v2's fire-and-forget
`unlock` and simply hands over every earned achievement once per session:

- after each finished level whose result was **saved** (an unlock cannot be taken back, so a
  result whose save failed unlocks nothing), and
- at startup, once v2 reports the player signed in.

A player signed out when they earned one gets it the next time they are signed in. Syncs run
one at a time; a sign-out mid-sync stops it and the next sync sends the rest. The sync never
prompts; the Achievements button is the one place sign-in is offered.

## Configuration

`src/config/achievements.ts` holds each Achievement ID from the Console. An empty id simply
leaves that one achievement off, which is how a new entry waits for its Console id.

| Key | Achievement ID | Item |
| --- | --- | --- |
| `clear-10` | `CgkI0Mey9o8ZEAIQAg` | 2 |
| `clear-20` | `CgkI0Mey9o8ZEAIQAw` | 3 |
| `clear-30` | `CgkI0Mey9o8ZEAIQBA` | 4 |
| `clear-40` | `CgkI0Mey9o8ZEAIQBQ` | 5 |
| `clear-50` | `CgkI0Mey9o8ZEAIQBg` | 6 |

All five decode to Games project `863268283344`; the item number counts leaderboards and
achievements together, and the Daily Tempo leaderboard is item 1. They were supplied as a
list in level order and assigned in that order, which matches the order they were created
in. **Confirm on the device**: clearing level 10 must pop *Grass Complete*, not another
area's. `tests/achievements.test.ts` pins every id, its project and its item number.

**Copy each id with the Console's copy button; never retype it** — the first leaderboard id
supplied was retyped and would have failed on every call (`docs/LEADERBOARDS.md`).
`scripts/check-android-config.mjs` decodes every achievement id after `cap sync` and warns
unless it names Games project `863268283344`, and warns when two entries share an id or one
repeats the leaderboard's — a paste into the wrong row names the right project and would
otherwise pass.

**The list is append-only.** Never change what an existing entry is earned by: Play Games
cannot take an unlocked achievement back, so moving one hands it to players who did not earn
it.

## Play Console, step by step

### 1. Icons

- **512 × 512 px, PNG or JPEG** (at most 1 MB each if you use bulk import).
- Upload the **full-colour** version only: Play Games generates the greyscale "locked" look
  itself.
- Android's unlock toast shows the icon inside a **circle** with the corners hidden, so keep
  the number and anything else that matters inside the central circle.
- Use one icon for every language; digits are fine, words are not.

### 2. Create each achievement

Play Console → Tiny Tempo → **Grow users → Play Games Services → Setup and management →
Achievements → Create achievement**. For each of the five:

| Field | Value |
| --- | --- |
| Name (≤ 100 chars, unique) | e.g. *Grass Complete*, *Pavement Complete*, *Sand Complete*, *Snow Complete*, *Dusk Complete* |
| Description (≤ 500 chars) | e.g. *Clear level 10 and complete Grass.* (20 / Pavement, 30 / Sand, 40 / Snow, 50 / Dusk) |
| Icon | Your icon for that level |
| Incremental | **No** — one step: the level is cleared or it is not |
| Initial state | **Revealed**, so players can see what to aim for |
| Points | A multiple of 5, 5–200 each, **2,000 total for the whole game**. Suggested: 10, 20, 30, 40, 50 (150 in all), which leaves room for later achievements |
| List order | 1–5 |

Then **Save as draft**. A draft achievement works for accounts on the PGS Testers list.

**Decide Initial state and Incremental carefully: neither can be changed once published**,
and a published achievement cannot be deleted. Name, description, points and icon can be
edited and republished later.

### 3. Put the ids in the config (done for the first five)

Each achievement's page shows its **Achievement ID**. Copy each with the copy button,
labelled by level. They go into `src/config/achievements.ts`, and the check script confirms
each names this project.

### 4. Test with an internal tester

1. The tester's Google account must be on **Play Games Services → Setup and management →
   Testers** (the same list the leaderboard uses), and must have a Play Games profile.
2. Install the build from the **internal testing track**, so it is signed with the Play app
   signing key that the PGS Android credential lists.
3. Clear level 10. The unlock popup should appear. Google notes that during testing it shows
   0 XP.
4. Check the achievement in Settings → Progress → Achievements, or in the Play Store app's
   *You* tab.
5. To see the retroactive grant, use a save already past level 30 (a save code works): the
   first three should unlock on the next launch.

### 5. Publish

**Review and publish** from the Achievements page, then publish on **Play Games Services →
Setup and management → Publishing**. This is **separate from publishing the APK or AAB**, and
Google allows up to 2 hours for it to reach players. Publish the Play Games changes before
the app release that depends on them.

### About the number of achievements

Google's achievement guidelines list "a minimum of ten achievements spread across the
lifetime of the game" as a baseline quality recommendation, and tie extra requirements to
Quests eligibility. I could not confirm whether the Console refuses to publish with fewer, so
check the Publishing page's checklist after creating these five. Natural next ones for this
game: finales at 60–100, the first keepsake, a full Scrapbook page, a flawless task, a
three-star area, and seven daily-objective stamps.

## Checked, and not

- The v2 `AchievementsClient` API was checked with `javap` against the pinned
  `play-services-games-v2:22.1.0` artifact, and `PlayGamesPlugin.java` compiles against the
  real Games, Tasks and base jars (the Android framework and Capacitor stubbed). **Not built
  by Gradle and not run on a device.**
- Not verified: the unlock popup appearing, and offline unlocks syncing later — both as
  Google documents them, neither seen here.
