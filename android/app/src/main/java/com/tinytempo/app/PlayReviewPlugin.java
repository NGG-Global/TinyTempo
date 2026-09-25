package com.tinytempo.app;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play In-App Review, exposed to the web layer.
 *
 * A bridge and nothing more, the same shape {@link PlayUpdatePlugin} takes: {@link #prepare}
 * asks {@link ReviewManager} for a {@link ReviewInfo} and holds it, {@link #launch} shows
 * the flow that info describes. Which level opens the one opportunity, what a failed
 * preparation is worth and when the opportunity is spent all live in
 * {@code src/review/appReview.ts}, where they are tested without a device. If a rule about
 * reviews lives in this file, it is in the wrong file.
 *
 * <p><b>Play decides what the player sees.</b> {@code launchReviewFlow} completes whether it
 * showed the dialog, declined to because of its quota, or the player dismissed it, and it
 * does not say which. Nothing here tries to find out, and nothing crosses the bridge but
 * "done" or a rejection: no rating, no submission, no sentiment.
 *
 * <p><b>The info is single-use and short-lived.</b> One {@link ReviewInfo} is held at a time;
 * {@link #launch} consumes it, so a second launch with nothing prepared rejects rather than
 * replaying the flow.
 *
 * @see <a href="https://developer.android.com/guide/playcore/in-app-review">In-app reviews</a>
 */
@CapacitorPlugin(name = "PlayReview")
public class PlayReviewPlugin extends Plugin {

    private ReviewManager reviewManager;
    private ReviewInfo prepared;

    @Override
    public void load() {
        reviewManager = ReviewManagerFactory.create(getContext());
    }

    @PluginMethod
    public void prepare(final PluginCall call) {
        final ReviewManager manager = reviewManager;
        if (manager == null) {
            call.reject("review-unavailable");
            return;
        }
        manager.requestReviewFlow()
                .addOnSuccessListener(info -> {
                    prepared = info;
                    call.resolve();
                })
                .addOnFailureListener(error -> {
                    // ReviewException carries a code (PLAY_STORE_NOT_FOUND and the like), and
                    // every one of them means the same thing to the game: not this time.
                    prepared = null;
                    call.reject("review-unavailable");
                });
    }

    /**
     * {@code launchReviewFlow} shows Play's own activity, so it belongs on the UI thread;
     * Capacitor runs plugin methods off it.
     */
    @PluginMethod
    public void launch(final PluginCall call) {
        final ReviewManager manager = reviewManager;
        final Activity activity = getActivity();
        final ReviewInfo info = prepared;
        prepared = null;
        if (manager == null || activity == null || info == null) {
            call.reject("review-not-prepared");
            return;
        }
        activity.runOnUiThread(() -> manager.launchReviewFlow(activity, info)
                .addOnSuccessListener(ignored -> call.resolve())
                .addOnFailureListener(error -> call.reject("review-launch-failed")));
    }
}
