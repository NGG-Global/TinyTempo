package com.tinytempo.app;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.Player;

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
