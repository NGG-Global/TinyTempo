package com.tinytempo.app;

import android.app.Activity;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesClientStatusCodes;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.Player;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.games.leaderboard.ScoreSubmissionData;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotContents;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

/**
 * Play Games Services v2, exposed to the web layer.
 *
 * A bridge and nothing more, the same shape {@link PlayBillingPlugin} takes: it asks the
 * Games SDK a question and relays the answer. Nothing here decides what being signed in
 * means to the game.
 *
 * Three rules this file exists to keep.
 *
 * <p><b>Play Games is never required.</b> Every method resolves rather than rejecting when
 * the SDK is unavailable, the device has no Play Games, or the player declined. The caller
 * gets {@code authenticated: false} and the game carries on — local saves, purchases and
 * play are untouched by any of it.
 *
 * <p><b>v2 only.</b> {@link PlayGames} and {@link GamesSignInClient} are the v2 API. The
 * deprecated GoogleSignIn / GoogleSignInClient path is not used and must not be
 * reintroduced: v2 signs the player in automatically at startup and has no interactive
 * client to drive.
 *
 * <p><b>Leaderboards and achievements never sign in.</b> {@link #submitScore},
 * {@link #showLeaderboard}, {@link #unlockAchievement} and {@link #showAchievements} use v2's
 * {@code LeaderboardsClient} and {@code AchievementsClient}. None prompts; the web layer
 * offers sign-in only when the player taps a leaderboard or achievements button.
 *
 * <p><b>Saved Games relays bytes and decides nothing.</b> {@link #readSnapshot},
 * {@link #writeSnapshot} and {@link #resolveSnapshot} use v2's {@link SnapshotsClient} with
 * {@link SnapshotsClient#RESOLUTION_POLICY_MANUAL}: a conflict between two devices comes back
 * to the web layer as both payloads, and the web layer answers with the merged bytes. The
 * merge is the game's (playgames/cloudSave.ts) — a timestamp, a play time and a "most
 * recent" policy all choose a loser, and this game's progression has no losers to choose.
 *
 * <p><b>Nothing sensitive is logged.</b> There are no tokens here to leak —
 * {@code requestServerSideAccess} is the only call that returns one and this plugin does
 * not make it — and the player id is treated as identifying, so it crosses the bridge but
 * is never written to logcat. Snapshot contents and conflict ids never reach a log either.
 *
 * @see <a href="https://developer.android.com/games/pgs/android/android-signin">Play Games Services v2 sign-in</a>
 * @see <a href="https://developer.android.com/games/pgs/android/saved-games">Saved Games on Android</a>
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final String TAG = "TinyTempoPGS";
    /** The highest score the game ever sends: 100% in thousandths (see playgames/leaderboard.ts). */
    private static final long MAX_SCORE = 100_000L;
    /** Play's own rule for a snapshot name: 1–100 of the non-URL-reserved characters. */
    private static final Pattern SNAPSHOT_NAME = Pattern.compile("^[A-Za-z0-9._~-]{1,100}$");
    /** Far above the few kilobytes a Tiny Tempo save is, far below Play's 3 MB ceiling. */
    private static final int MAX_SNAPSHOT_BYTES = 1_000_000;
    /** Play's description field is short; anything longer is cut rather than refused. */
    private static final int MAX_DESCRIPTION = 100;
    private static final long SNAPSHOT_TIMEOUT_SECONDS = 30L;
    /**
     * Snapshot work runs here, one call at a time, off the main thread: {@code readFully}
     * is file I/O and {@link Tasks#await} must not block the UI. One thread also means the
     * pending conflict below is only ever touched sequentially.
     */
    private final ExecutorService snapshotWorker = Executors.newSingleThreadExecutor();
    /**
     * The conflict the web layer has been told about and has not yet answered. Held because
     * resolving one needs the conflict's own resolution contents, which cannot be re-fetched.
     * Replaced, and its snapshots closed, when another conflict is reported.
     */
    private SnapshotsClient.SnapshotConflict pendingConflict;

    /**
     * Whether Play Games has already signed this player in.
     *
     * v2 attempts authentication on its own when the SDK initializes, so at startup this
     * is usually all the game needs to ask. Never rejects: "no" is an answer.
     */
    @PluginMethod
    public void isAuthenticated(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            resolveAuthenticated(call, false, "no activity");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                signInClient(activity)
                        .isAuthenticated()
                        .addOnSuccessListener(result -> resolveAuthenticated(call, authenticated(result), "checked"))
                        .addOnFailureListener(error -> {
                            Log.i(TAG, "Play Games authentication check failed: " + error.getClass().getSimpleName());
                            resolveAuthenticated(call, false, "check failed");
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games is unavailable on this device.", error);
                resolveAuthenticated(call, false, "unavailable");
            }
        });
    }

    /**
     * Ask Play Games to sign the player in.
     *
     * Only worth calling after {@link #isAuthenticated} has said no: v2 has already tried
     * once at startup, and this is the manual retry for a player who declined it or whose
     * first attempt failed. It may show Play's own UI, which is why it runs on the UI
     * thread and why the game must not depend on the result arriving quickly.
     */
    @PluginMethod
    public void signIn(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            resolveAuthenticated(call, false, "no activity");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                signInClient(activity)
                        .signIn()
                        .addOnSuccessListener(result -> {
                            boolean ok = authenticated(result);
                            Log.i(TAG, "Play Games sign-in finished: " + (ok ? "authenticated" : "declined"));
                            resolveAuthenticated(call, ok, ok ? "signed in" : "declined");
                        })
                        .addOnFailureListener(error -> {
                            Log.i(TAG, "Play Games sign-in failed: " + error.getClass().getSimpleName());
                            resolveAuthenticated(call, false, "sign-in failed");
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games is unavailable on this device.", error);
                resolveAuthenticated(call, false, "unavailable");
            }
        });
    }

    /**
     * The signed-in player's id and display name, or {@code authenticated: false}.
     *
     * The id is what a future Saved Games implementation keys a snapshot's owner on, which
     * is the reason this is exposed at all. It is identifying, so it crosses the bridge
     * and goes no further — never into a log, a crash report or an analytics event.
     */
    @PluginMethod
    public void getPlayerInfo(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            resolveAuthenticated(call, false, "no activity");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getPlayersClient(activity)
                        .getCurrentPlayer()
                        .addOnSuccessListener(player -> resolvePlayer(call, player))
                        .addOnFailureListener(error -> {
                            // The common cause is simply not being signed in, which is not
                            // a failure of the game.
                            Log.i(TAG, "No current Play Games player: " + error.getClass().getSimpleName());
                            resolveAuthenticated(call, false, "no player");
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games is unavailable on this device.", error);
                resolveAuthenticated(call, false, "unavailable");
            }
        });
    }

    /**
     * Submit one score to one leaderboard, and say whether Play Games took it.
     *
     * {@code submitScoreImmediate} rather than the fire-and-forget {@code submitScore}, so
     * the game learns whether the score arrived and can keep a failed one to send later —
     * v2 has no deferred-operation status of its own. It never prompts for sign-in and never
     * rejects: a signed-out player, a network failure and a missing SDK are all reasons.
     * Only the reason is logged; the score, the leaderboard id and the player are not.
     */
    @PluginMethod
    public void submitScore(final PluginCall call) {
        final String leaderboardId = call.getString("leaderboardId", "");
        final Long score = call.getLong("score");
        final String tag = call.getString("tag", null);
        if (leaderboardId == null || leaderboardId.isEmpty() || score == null || score < 0 || score > MAX_SCORE) {
            resolveSubmission(call, false, false, "invalid");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            resolveSubmission(call, false, false, "unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getLeaderboardsClient(activity)
                        .submitScoreImmediate(leaderboardId, score, tag)
                        .addOnSuccessListener(data -> resolveSubmission(call, true, newBestToday(data), "submitted"))
                        .addOnFailureListener(error -> {
                            String reason = failureReason(error);
                            Log.i(TAG, "Leaderboard submission failed: " + reason);
                            resolveSubmission(call, false, false, reason);
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games leaderboards are unavailable on this device.", error);
                resolveSubmission(call, false, false, "unavailable");
            }
        });
    }

    /**
     * Open Play Games' own screen for one leaderboard, on the requested timespan.
     *
     * Play Games keeps a daily, a weekly and an all-time view of every leaderboard, and
     * the screen lets the player switch between them; {@code span} only picks which one it
     * opens on. Resolves when the player closes it. Signed out, it resolves
     * {@code signed_out} without showing anything — the caller decides whether to offer
     * sign-in, because only a tap on the leaderboard button should ever lead to a prompt.
     */
    @PluginMethod
    public void showLeaderboard(final PluginCall call) {
        final String leaderboardId = call.getString("leaderboardId", "");
        if (leaderboardId == null || leaderboardId.isEmpty()) {
            resolveView(call, false, "invalid");
            return;
        }
        final int span = timeSpan(call.getString("span", "daily"));
        final Activity activity = getActivity();
        if (activity == null) {
            resolveView(call, false, "unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getLeaderboardsClient(activity)
                        .getLeaderboardIntent(leaderboardId, span)
                        .addOnSuccessListener(intent -> startActivityForResult(call, intent, "leaderboardClosed"))
                        .addOnFailureListener(error -> {
                            String reason = failureReason(error);
                            Log.i(TAG, "Leaderboard screen unavailable: " + reason);
                            resolveView(call, false, "offline".equals(reason) || "timeout".equals(reason) ? "failed" : reason);
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games leaderboards are unavailable on this device.", error);
                resolveView(call, false, "unavailable");
            }
        });
    }

    /**
     * Unlock one achievement.
     *
     * v2's fire-and-forget {@code unlock}, deliberately rather than {@code unlockImmediate}:
     * Play Games queues an unlock made offline and syncs it when the device is back, and an
     * achievement already unlocked is left as it is, so the game can hand over every earned
     * achievement each session without keeping a ledger. Signed out, the SDK has no player to
     * unlock for, so that is answered here rather than handed over and lost. Never prompts,
     * never rejects, and never logs the id.
     */
    @PluginMethod
    public void unlockAchievement(final PluginCall call) {
        final String achievementId = call.getString("achievementId", "");
        if (achievementId == null || achievementId.isEmpty()) {
            resolveUnlock(call, false, "invalid");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            resolveUnlock(call, false, "unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                signInClient(activity)
                        .isAuthenticated()
                        .addOnSuccessListener(result -> {
                            if (!authenticated(result)) {
                                resolveUnlock(call, false, "signed_out");
                                return;
                            }
                            try {
                                PlayGames.getAchievementsClient(activity).unlock(achievementId);
                                resolveUnlock(call, true, "sent");
                            } catch (Throwable error) {
                                Log.w(TAG, "Achievement unlock could not be handed over.", error);
                                resolveUnlock(call, false, "failed");
                            }
                        })
                        .addOnFailureListener(error -> resolveUnlock(call, false, "signed_out"));
            } catch (Throwable error) {
                Log.w(TAG, "Play Games achievements are unavailable on this device.", error);
                resolveUnlock(call, false, "unavailable");
            }
        });
    }

    /**
     * Open Play Games' own achievements screen. Resolves when the player closes it; signed
     * out, resolves {@code signed_out} without showing anything, as the leaderboard does.
     */
    @PluginMethod
    public void showAchievements(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            resolveView(call, false, "unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getAchievementsClient(activity)
                        .getAchievementsIntent()
                        .addOnSuccessListener(intent -> startActivityForResult(call, intent, "achievementsClosed"))
                        .addOnFailureListener(error -> {
                            String reason = failureReason(error);
                            Log.i(TAG, "Achievements screen unavailable: " + reason);
                            resolveView(call, false, "offline".equals(reason) || "timeout".equals(reason) ? "failed" : reason);
                        });
            } catch (Throwable error) {
                Log.w(TAG, "Play Games achievements are unavailable on this device.", error);
                resolveView(call, false, "unavailable");
            }
        });
    }

    /**
     * Open the named snapshot — creating an empty one if the player has none — and hand its
     * bytes to the web layer, base64-encoded. Resolves {@code kind: "data"} with the bytes,
     * or no {@code data} at all for a snapshot never written; {@code kind: "conflict"} with
     * both payloads when two devices wrote while apart; {@code kind: "failed"} with a reason
     * from a closed set otherwise. Never rejects, never prompts, never logs the bytes.
     */
    @PluginMethod
    public void readSnapshot(final PluginCall call) {
        final String name = call.getString("name", "");
        if (name == null || !SNAPSHOT_NAME.matcher(name).matches()) {
            resolveSnapshotFailure(call, "invalid");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            resolveSnapshotFailure(call, "unavailable");
            return;
        }
        snapshotWorker.execute(() -> {
            try {
                SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
                SnapshotsClient.DataOrConflict<Snapshot> opened =
                        await(client.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MANUAL));
                if (opened.isConflict()) {
                    resolveConflict(call, hold(opened.getConflict()));
                    return;
                }
                Snapshot snapshot = opened.getData();
                byte[] bytes = snapshot.getSnapshotContents().readFully();
                await(client.discardAndClose(snapshot));
                JSObject payload = new JSObject();
                payload.put("kind", "data");
                if (bytes != null && bytes.length > 0) {
                    payload.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                }
                call.resolve(payload);
            } catch (Throwable error) {
                String reason = snapshotFailure(error);
                Log.i(TAG, "Snapshot read failed: " + reason);
                resolveSnapshotFailure(call, reason);
            }
        });
    }

    /**
     * Replace the named snapshot's bytes and commit. The same open as {@link #readSnapshot},
     * so a conflict is reported the same way and nothing is written until it is answered.
     */
    @PluginMethod
    public void writeSnapshot(final PluginCall call) {
        final String name = call.getString("name", "");
        final byte[] bytes = snapshotBytes(call);
        if (name == null || !SNAPSHOT_NAME.matcher(name).matches() || bytes == null) {
            resolveSnapshotFailure(call, "invalid");
            return;
        }
        final SnapshotMetadataChange change = metadataChange(call);
        final Activity activity = getActivity();
        if (activity == null) {
            resolveSnapshotFailure(call, "unavailable");
            return;
        }
        snapshotWorker.execute(() -> {
            try {
                SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
                SnapshotsClient.DataOrConflict<Snapshot> opened =
                        await(client.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MANUAL));
                if (opened.isConflict()) {
                    resolveConflict(call, hold(opened.getConflict()));
                    return;
                }
                Snapshot snapshot = opened.getData();
                if (!snapshot.getSnapshotContents().writeBytes(bytes)) {
                    await(client.discardAndClose(snapshot));
                    resolveSnapshotFailure(call, "failed");
                    return;
                }
                await(client.commitAndClose(snapshot, change));
                JSObject payload = new JSObject();
                payload.put("kind", "committed");
                call.resolve(payload);
            } catch (Throwable error) {
                String reason = snapshotFailure(error);
                Log.i(TAG, "Snapshot write failed: " + reason);
                resolveSnapshotFailure(call, reason);
            }
        });
    }

    /**
     * Answer the conflict last reported, with the merged bytes the web layer worked out.
     *
     * Play's own guide resolves and then treats the returned snapshot as freshly opened, so
     * the merged bytes are written into it and committed as well: whatever the server kept
     * from the resolution, what is committed is the merge. Resolving can itself reveal a
     * further conflict, which is reported the same way for the web layer to answer again;
     * the web layer bounds how many times it will. A conflict id that is not the pending one
     * is stale — the web layer re-reads and is told the current one.
     */
    @PluginMethod
    public void resolveSnapshot(final PluginCall call) {
        final String conflictId = call.getString("conflictId", "");
        final byte[] bytes = snapshotBytes(call);
        if (conflictId == null || conflictId.isEmpty() || bytes == null) {
            resolveSnapshotFailure(call, "invalid");
            return;
        }
        final SnapshotMetadataChange change = metadataChange(call);
        final Activity activity = getActivity();
        if (activity == null) {
            resolveSnapshotFailure(call, "unavailable");
            return;
        }
        snapshotWorker.execute(() -> {
            try {
                SnapshotsClient.SnapshotConflict conflict = pendingConflict;
                if (conflict == null || !conflictId.equals(conflict.getConflictId())) {
                    resolveSnapshotFailure(call, "failed");
                    return;
                }
                pendingConflict = null;
                SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
                SnapshotsClient.DataOrConflict<Snapshot> result;
                SnapshotContents resolution = conflict.getResolutionSnapshotContents();
                if (resolution != null && resolution.writeBytes(bytes)) {
                    result = await(client.resolveConflict(
                            conflictId, conflict.getSnapshot().getMetadata().getSnapshotId(), change, resolution));
                } else {
                    // No resolution contents: resolve with the server's snapshot carrying the merge.
                    Snapshot base = conflict.getSnapshot();
                    if (!base.getSnapshotContents().writeBytes(bytes)) {
                        resolveSnapshotFailure(call, "failed");
                        return;
                    }
                    result = await(client.resolveConflict(conflictId, base));
                }
                if (result.isConflict()) {
                    resolveConflict(call, hold(result.getConflict()));
                    return;
                }
                Snapshot resolved = result.getData();
                if (resolved.getSnapshotContents().writeBytes(bytes)) {
                    await(client.commitAndClose(resolved, change));
                } else {
                    await(client.discardAndClose(resolved));
                }
                JSObject payload = new JSObject();
                payload.put("kind", "resolved");
                call.resolve(payload);
            } catch (Throwable error) {
                String reason = snapshotFailure(error);
                Log.i(TAG, "Snapshot conflict resolution failed: " + reason);
                resolveSnapshotFailure(call, reason);
            }
        });
    }

    /** Remember a conflict for {@link #resolveSnapshot}, closing whatever an earlier unanswered one left open. */
    private SnapshotsClient.SnapshotConflict hold(SnapshotsClient.SnapshotConflict conflict) {
        SnapshotsClient.SnapshotConflict stale = pendingConflict;
        pendingConflict = conflict;
        if (stale != null) {
            Activity activity = getActivity();
            if (activity != null) {
                try {
                    SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
                    client.discardAndClose(stale.getSnapshot());
                    client.discardAndClose(stale.getConflictingSnapshot());
                } catch (Throwable ignored) {
                    // Best effort: the snapshots are closed when the process ends regardless.
                }
            }
        }
        return conflict;
    }

    /** Both sides of a conflict, as the web layer merges them. Neither side is logged. */
    private void resolveConflict(PluginCall call, SnapshotsClient.SnapshotConflict conflict) {
        JSObject payload = new JSObject();
        payload.put("kind", "conflict");
        payload.put("conflictId", conflict.getConflictId());
        putBytes(payload, "base", conflict.getSnapshot());
        putBytes(payload, "other", conflict.getConflictingSnapshot());
        call.resolve(payload);
    }

    private static void putBytes(JSObject payload, String key, Snapshot snapshot) {
        try {
            byte[] bytes = snapshot == null ? null : snapshot.getSnapshotContents().readFully();
            if (bytes != null && bytes.length > 0) payload.put(key, Base64.encodeToString(bytes, Base64.NO_WRAP));
        } catch (Throwable error) {
            // An unreadable side is reported as absent; the web layer keeps the other.
            Log.i(TAG, "A conflicting snapshot could not be read: " + error.getClass().getSimpleName());
        }
    }

    /** The payload's bytes, or null when they are missing, not base64, or too large to be a save. */
    private static byte[] snapshotBytes(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            return bytes.length == 0 || bytes.length > MAX_SNAPSHOT_BYTES ? null : bytes;
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    private static SnapshotMetadataChange metadataChange(PluginCall call) {
        String description = call.getString("description", "");
        if (description == null) description = "";
        if (description.length() > MAX_DESCRIPTION) description = description.substring(0, MAX_DESCRIPTION);
        Long progress = call.getLong("progress");
        SnapshotMetadataChange.Builder builder = new SnapshotMetadataChange.Builder().setDescription(description);
        if (progress != null && progress >= 0) builder.setProgressValue(progress);
        return builder.build();
    }

    private static <T> T await(Task<T> task) throws ExecutionException, InterruptedException, TimeoutException {
        return Tasks.await(task, SNAPSHOT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    /** The closed set the web layer knows, from whatever a snapshot call threw. Never the message. */
    private static String snapshotFailure(Throwable error) {
        if (error instanceof TimeoutException) return "timeout";
        Throwable cause = error instanceof ExecutionException && error.getCause() != null ? error.getCause() : error;
        if (cause instanceof Exception) return failureReason((Exception) cause);
        return "failed";
    }

    private void resolveSnapshotFailure(PluginCall call, String reason) {
        JSObject payload = new JSObject();
        payload.put("kind", "failed");
        payload.put("reason", reason);
        call.resolve(payload);
    }

    /** The achievements screen closed. */
    @ActivityCallback
    private void achievementsClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        resolveView(call, true, "shown");
        getBridge().releaseCall(call);
    }

    private void resolveUnlock(PluginCall call, boolean sent, String reason) {
        JSObject payload = new JSObject();
        payload.put("sent", sent);
        payload.put("reason", reason);
        call.resolve(payload);
    }

    /** The leaderboard screen closed. It was shown, whatever it returned. */
    @ActivityCallback
    private void leaderboardClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        resolveView(call, true, "shown");
        getBridge().releaseCall(call);
    }

    private static int timeSpan(String span) {
        if ("weekly".equals(span)) return LeaderboardVariant.TIME_SPAN_WEEKLY;
        if ("all_time".equals(span)) return LeaderboardVariant.TIME_SPAN_ALL_TIME;
        return LeaderboardVariant.TIME_SPAN_DAILY;
    }

    private static boolean newBestToday(ScoreSubmissionData data) {
        if (data == null) return false;
        ScoreSubmissionData.Result daily = data.getScoreResult(LeaderboardVariant.TIME_SPAN_DAILY);
        return daily != null && daily.newBest;
    }

    /** A closed set the web layer knows: never the exception's message, which may carry ids. */
    private static String failureReason(Exception error) {
        if (error instanceof ApiException) {
            int code = ((ApiException) error).getStatusCode();
            if (code == CommonStatusCodes.SIGN_IN_REQUIRED) return "signed_out";
            if (code == CommonStatusCodes.NETWORK_ERROR
                    || code == GamesClientStatusCodes.NETWORK_ERROR_OPERATION_FAILED
                    || code == GamesClientStatusCodes.NETWORK_ERROR_NO_DATA) return "offline";
            if (code == CommonStatusCodes.TIMEOUT) return "timeout";
        }
        return "failed";
    }

    private void resolveSubmission(PluginCall call, boolean submitted, boolean newBest, String reason) {
        JSObject payload = new JSObject();
        payload.put("submitted", submitted);
        payload.put("newBest", newBest);
        payload.put("reason", reason);
        call.resolve(payload);
    }

    private void resolveView(PluginCall call, boolean shown, String reason) {
        JSObject payload = new JSObject();
        payload.put("shown", shown);
        payload.put("reason", reason);
        call.resolve(payload);
    }

    private GamesSignInClient signInClient(Activity activity) {
        return PlayGames.getGamesSignInClient(activity);
    }

    private boolean authenticated(AuthenticationResult result) {
        return result != null && result.isAuthenticated();
    }

    private void resolveAuthenticated(PluginCall call, boolean authenticated, String reason) {
        JSObject payload = new JSObject();
        payload.put("authenticated", authenticated);
        payload.put("reason", reason);
        call.resolve(payload);
    }

    private void resolvePlayer(PluginCall call, Player player) {
        if (player == null) {
            resolveAuthenticated(call, false, "no player");
            return;
        }
        JSObject payload = new JSObject();
        payload.put("authenticated", true);
        payload.put("reason", "player");
        payload.put("playerId", player.getPlayerId());
        payload.put("displayName", player.getDisplayName());
        call.resolve(payload);
    }
}
