package com.tinytempo.app;

import android.app.Application;
import android.util.Log;

import com.google.android.gms.games.PlayGamesSdk;

/**
 * The application object, which exists for one reason: Play Games Services v2 wants to be
 * initialized before any activity, and {@code Application.onCreate} is the place Google's
 * integration guide names.
 *
 * Deliberately the smallest class that can do that. Everything else this app starts is
 * started somewhere it already belongs — Capacitor and the Billing plugin from
 * {@link MainActivity}, Firebase from its own init provider, AdMob and Sentry from the web
 * layer's boot — and none of it is moved here. Adding to this class is how an application
 * object becomes the place startup order goes to hide.
 *
 * Initialization is not authentication. {@code PlayGamesSdk.initialize} only makes the SDK
 * usable; whether a player is signed in is asked separately, and a device with no Play
 * Games, no network or no account still reaches {@code MainActivity} and plays the game.
 *
 * @see <a href="https://developer.android.com/games/pgs/android/android-signin">Play Games Services v2 sign-in</a>
 */
public class TinyTempoApplication extends Application {

    private static final String TAG = "TinyTempoPGS";

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            PlayGamesSdk.initialize(this);
            Log.i(TAG, "Play Games Services v2 initialized.");
        } catch (Throwable error) {
            // A throw here would take the process down before the game had a chance to
            // start, and Play Games is the one capability this app is explicitly allowed
            // to be without. Swallow it and let the plugin report unauthenticated.
            Log.w(TAG, "Play Games Services could not be initialized; the game runs without it.", error);
        }
    }
}
