# In-app updates

Play can offer a newer version while the game is open. There is no Settings
toggle and no second store: this is Google Play In-App Updates, called directly,
the same way billing is called directly.

A sideloaded debug APK, a build from Android Studio, and the browser never see
an update. Play only answers for a package it itself installed — internal
testing, closed testing, or production. That is not a bug in the adapter.

## The shape

```
bootUpdates            boot.ts         native-only, resume, never throws
  →  PlayUpdate        playUpdate.ts   every decision about a flow
  →  PlayUpdateClient  native.ts       the bridge, and nothing else
  →  PlayUpdatePlugin.java             AppUpdateManager
  →  Google Play
```

`playUpdate.ts` imports no native code, which is why the whole of the policy —
flexible vs immediate, when to ask for a restart, when to stay quiet during a
level — is tested under node with a fake client. The Java is deliberately dull:
it relays what Play says, starts the flow it is told to, and calls
`completeUpdate` when asked. If a rule about updates lives in the Java, it is
in the wrong file.

The one exception is resuming an **immediate** update the player already
accepted. Play requires that at every activity entry point, and a WebView
`visibilitychange` arrives too late to count. `PlayUpdatePlugin.handleOnResume`
starts that flow itself.

## Flexible by default, immediate at priority 4+

Play Console sets `inAppUpdatePriority` on a release, an integer from 0 to 5.
Unset, it is 0.

| Priority | What the game does |
| --- | --- |
| 0–3 | Flexible. Play asks for consent, the pack downloads in the background, then a workshop sheet asks to restart. |
| 4–5 | Immediate, if Play allows it. Play's own full-screen UI covers the game until the new version is running. |

A high-priority release that Play will not allow as immediate falls back to
flexible. A downloaded pack is always "apply", because it occupies storage
until `completeUpdate` runs.

The restart sheet waits until the player is on a chrome screen — menu, map,
settings, transfer, help. Covering a level, the tutorial, tap-offset, or the
boot splash with a store dialog would cost the round. An immediate update
**already in progress** is the exception: the player consented, and native
resume restores Play's UI rather than leaving it stalled.

Declining Play's consent dialog is honoured for the rest of that session. A
cold start asks again. Tapping Later on the restart sheet dismisses it until
the next time the game comes to the foreground, because Play keeps the pack
until something consumes it.

## What the player sees

Flexible consent is Play's dialog, not ours. After the download, `#update-overlay`
in `index.html` asks to restart. Progress stays on the device: `completeUpdate`
restarts the activity, and the WebView store survives that.

Immediate consent and progress are Play's full-screen UI. There is no second
prompt.

In DEV, `?updatePrompt` shows the restart sheet without talking to Play, so the
copy can be checked in a browser.

## Two things that will break it quietly

`MainActivity.java` registers the plugin by hand, because updates are a class
in this module rather than an npm package. If `cap` ever regenerates that file
from its template, the registration goes with it and every install stays on
the version it shipped — nothing fails to build. `scripts/check-android-config.mjs`
checks for it after every sync, along with the Gradle dependency.

Testing it on a Studio-installed APK will always look like "no update
available". Use an internal testing track (or internal app sharing) with a
higher `versionCode` than the installed build, and set `inAppUpdatePriority`
on that release if you want the blocking path.
