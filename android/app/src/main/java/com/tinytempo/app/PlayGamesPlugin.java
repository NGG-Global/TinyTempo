package com.tinytempo.app;

import android.app.Activity;
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
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.games.leaderboard.ScoreSubmissionData;

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
 * <p><b>Leaderboards submit, they never sign in.</b> {@link #submitScore} and
 * {@link #showLeaderboard} use the v2 {@code LeaderboardsClient}. Neither prompts; the web
 * layer offers sign-in only when the player taps the leaderboard button.
 *
 * <p><b>Nothing sensitive is logged.</b> There are no tokens here to leak —
 * {@code requestServerSideAccess} is the only call that returns one and this plugin does
 * not make it — and the player id is treated as identifying, so it crosses the bridge but
 * is never written to logcat.
 *
 * @see <a href="https://developer.android.com/games/pgs/android/android-signin">Play Games Services v2 sign-in</a>
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final String TAG = "TinyTempoPGS";
    /** The highest score the game ever sends: 100% in thousandths (see playgames/leaderboard.ts). */
    private static final long MAX_SCORE = 100_000L;

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
