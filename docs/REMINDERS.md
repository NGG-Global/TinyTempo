# Daily reminder

One local notification in the evening, about the day's three objectives, only while they are
still open, and only for a player who asked for it.

**Status.** Code complete and covered by `tests/reminders.test.ts`. Not built by Gradle or
run on a device here: no Android SDK in this environment. The device checks at the end are
what verification is.

## The rules

| Rule | Where |
| --- | --- |
| Fires at 6 pm local time (`REMINDER.hour`) | `reminders/reminder.ts`, `reminderTimes` |
| Not on a day whose objectives are stamped; finishing them cancels that day's | `storedStamps` in `game/objectives.ts`, the sync in `PlayScene` after `recordObjectives` |
| At most three scheduled, counted from the last time the game was open | `REMINDER.ahead`: a player who stops playing gets three, then nothing |
| Off until the player turns it on | `tiny-tempo.reminders.v1`, `{ enabled }`, device-local, in no save code or cloud snapshot |
| Never asks Android for permission except from the player's own tap | `turnRemindersOn`, from the offer's *Remind me* or the Settings switch |
| Native only | `remindersAvailable()`: a browser cannot hold a notification for a closed tab, so no switch and no offer there |

The copy rotates through three lines by date (`REMINDER_LINES`) and never mentions a streak or
a loss, because a missed day costs nothing (`docs/OBJECTIVES.md`).

## When it asks

**After the first day's stamp, once.** The offer is the screen-hint card with a second button
(`SCREEN_HINTS.reminder`, `ui/screenHint.ts`): *A reminder in the evening?*, three lines, **Not
now** and **Remind me**. It opens on the map once the map is quiet — curtain up, stars landed,
no gate opening, no sheet or card open (`offerReminderWhenQuiet`) — so it is the first thing
after a stamp rather than on top of one. A tap outside answers neither. Closing it by any
button or by Android's back marks it seen (`hintReminder`, device-local), and it is never
offered again. Settings → Sound & feel → **Daily reminder** is always there afterwards.

Why then: Android 13 and later show the system prompt only a limited number of times, and a
player who declines twice can no longer be asked from the app. Asking when the reminder means
something — the player has just finished a day of objectives — is the best chance of a yes,
and the in-game card costs nothing if the answer is no.

**What Settings shows.** `off`, `on`, or `blocked`: the player turned it on but Android refuses
notifications (declined, or switched off in the system's settings). A blocked row keeps the
switch on and says *Turned off in Android settings*, rather than a switch that will not stay
on. Turning it off cancels every scheduled reminder at once.

## Scheduling

Not a repeating alarm. `syncReminders` cancels the feature's own ids (`7101`–`7103`) and
schedules the next evenings from now. It runs:

- at boot (`bootReminders` in `main.ts`);
- whenever the app goes to the background or comes back (`@capacitor/app`'s `appStateChange`);
- when a level stamps the day (`PlayScene`, after `recordObjectives`);
- when the player switches it on or off.

Syncs are serialized, and every call resolves: a reminder is never worth an error in front of
the player.

## The plugin, and two defaults overridden

`@capacitor/local-notifications` 8.3, behind `reminders/native.ts`, dynamically imported on a
native build only.

- **Exact alarms.** The plugin's `isExactNotification` defaults to true, and on Android 12 and
  up that opens the system's *Alarms & reminders* screen on `schedule()`. Every reminder is
  scheduled with `isExactNotification: false`, and the manifest removes the plugin's
  `SCHEDULE_EXACT_ALARM` (`tools:node="remove"`). An evening nudge a few minutes late is fine;
  a permission screen and a Play policy question are not.
- **Asking on schedule.** Since 8.3.0 `schedule()` requests the notification permission itself
  when it is missing. `syncReminders` checks the permission first and schedules only when it
  is granted, so the prompt can only come from `turnRemindersOn`.

The status-bar icon is `res/drawable/ic_stat_tiny_tempo.xml`, the game's eighth note in white
on transparency, tinted coral by `iconColor`. It is set per notification and as the plugin's
default in `capacitor.config.ts`. The channel is **Daily reminder**, importance 3 (sound and
the shade, no heads-up banner), so the player can find and change it in Android's settings.

`scripts/check-android-config.mjs` warns if the manifest stops removing the exact-alarm
permission, if the icon is missing, or if `cap sync` has not added the plugin to the Gradle
build.

## Analytics

Service events, no player data:

| Event | Fires | Parameters |
| --- | --- | --- |
| `reminder_offer_shown` | The offer opened on the map | `stamps` |
| `reminder_offer_closed` | The offer closed | `choice` (`remind` \| `not_now` \| `back`) |
| `reminder_permission` | The player asked for the reminder, and Android answered | `source` (`offer` \| `settings`), `result` (`granted` \| `denied`) |
| `reminder_disabled` | The Settings switch turned it off | `source` (`settings`) |

## Play Console and policy

- `POST_NOTIFICATIONS` is a runtime permission on Android 13+, asked only from the player's tap.
- No data leaves the device for this feature, and nothing new is collected: the Data safety form
  is unaffected. *Verify against the current form when publishing.*
- The plugin also declares `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`, so scheduled reminders
  survive a reboot. Both are normal permissions, granted at install.

## Device checks

1. Fresh install, finish a day's three objectives: the offer appears on the map; *Remind me*
   shows Android's prompt (13+) or none (12 and below); Settings shows the switch on.
2. Before 6 pm with objectives open: a reminder at about 6 pm. Finish them first: none that day.
3. Decline the prompt twice: Settings shows *Turned off in Android settings*; enabling
   notifications in the system's settings and reopening the game shows *on* and schedules.
4. Don't open the game for four days: exactly three reminders arrive.
5. Reboot the phone with reminders scheduled: they still arrive.
6. The status-bar icon is the white note, not a square; the channel reads *Daily reminder*.
