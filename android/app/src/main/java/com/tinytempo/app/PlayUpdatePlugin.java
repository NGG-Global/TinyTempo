package com.tinytempo.app;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.tasks.Task;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.ActivityResult;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Google Play In-App Updates, exposed to the web layer.
 *
 * This is a bridge and nothing more: it asks {@link AppUpdateManager} what Play
 * reports, starts the flow the TypeScript adapter asked for, and calls
 * {@code completeUpdate} when told. Whether a download should be flexible or
 * immediate, and when the player is asked to restart, lives in
 * {@code src/updates/playUpdate.ts}, where it can be tested without a device.
 *
 * Immediate flows that the player already accepted must be resumed from
 * {@link #handleOnResume}: Play's own UI is what the player is waiting to see,
 * and a WebView visibility callback arrives too late to count as an entry point.
 *
 * @see <a href="https://developer.android.com/guide/playcore/in-app-updates">In-app updates</a>
 */
@CapacitorPlugin(name = "PlayUpdate")
public class PlayUpdatePlugin extends Plugin {

    private AppUpdateManager updateManager;
    private final InstallStateUpdatedListener installListener = state -> {
        final int status = state.installStatus();
        if (status == InstallStatus.DOWNLOADED) {
            notifyListeners("downloaded", new JSObject());
        } else if (status == InstallStatus.FAILED) {
            notifyListeners("failed", new JSObject());
        }
    };

    @Override
    public void load() {
        updateManager = AppUpdateManagerFactory.create(getContext());
        updateManager.registerListener(installListener);
    }

    @Override
    protected void handleOnDestroy() {
        if (updateManager != null) {
            updateManager.unregisterListener(installListener);
            updateManager = null;
        }
        super.handleOnDestroy();
    }

    /**
     * An immediate update the player already consented to must be resumed here,
     * not from JavaScript. Play requires this at every activity entry point;
     * leaving it until the WebView reports {@code visibilitychange} lets the
     * blocking UI stall for a frame, and during a level that is a missed beat.
     */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        final AppUpdateManager manager = updateManager;
        final Activity activity = getActivity();
        if (manager == null || activity == null) return;
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                activity.runOnUiThread(() -> startFlow(info, activity, AppUpdateType.IMMEDIATE, null));
                return;
            }
            if (info.installStatus() == InstallStatus.DOWNLOADED) {
                notifyListeners("downloaded", new JSObject());
            }
        });
    }

    @PluginMethod
    public void check(final PluginCall call) {
        final AppUpdateManager manager = updateManager;
        if (manager == null) {
            call.resolve(emptySnapshot());
            return;
        }
        manager.getAppUpdateInfo()
                .addOnSuccessListener(info -> call.resolve(describe(info)))
                .addOnFailureListener(error -> call.resolve(emptySnapshot()));
    }

    @PluginMethod
    public void start(final PluginCall call) {
        final AppUpdateManager manager = updateManager;
        final Activity activity = getActivity();
        if (manager == null || activity == null) {
            call.reject("update-unavailable");
            return;
        }
        final String type = call.getString("type", "");
        final int updateType = "immediate".equals(type)
                ? AppUpdateType.IMMEDIATE
                : "flexible".equals(type) ? AppUpdateType.FLEXIBLE : -1;
        if (updateType < 0) {
            call.reject("bad-update-type");
            return;
        }
        // AppUpdateInfo is single-use, so start always asks Play again rather than
        // replaying the snapshot from check().
        manager.getAppUpdateInfo()
                .addOnSuccessListener(info -> activity.runOnUiThread(
                        () -> startFlow(info, activity, updateType, call)))
                .addOnFailureListener(error -> call.reject("update-unavailable"));
    }

    @PluginMethod
    public void complete(final PluginCall call) {
        final AppUpdateManager manager = updateManager;
        if (manager == null) {
            call.reject("update-unavailable");
            return;
        }
        final Task<Void> task = manager.completeUpdate();
        task.addOnSuccessListener(ignored -> call.resolve());
        task.addOnFailureListener(error -> call.reject("update-complete-failed"));
    }

    /**
     * {@code startUpdateFlow} shows Play's own activity, so it belongs on the UI
     * thread; Capacitor runs plugin methods off it. A null {@code call} is the
     * resume path, which has nobody waiting on a result.
     */
    private void startFlow(
            final AppUpdateInfo info,
            final Activity activity,
            final int updateType,
            final PluginCall call
    ) {
        final AppUpdateManager manager = updateManager;
        if (manager == null) {
            if (call != null) call.reject("update-unavailable");
            return;
        }
        manager.startUpdateFlow(
                        info,
                        activity,
                        AppUpdateOptions.newBuilder(updateType).build())
                .addOnSuccessListener(result -> {
                    if (call == null) return;
                    final JSObject payload = new JSObject();
                    payload.put("result", describeResult(result));
                    call.resolve(payload);
                })
                .addOnFailureListener(error -> {
                    if (call != null) call.reject("update-start-failed");
                });
    }

    private static JSObject describe(AppUpdateInfo info) {
        final JSObject snapshot = new JSObject();
        final int availability = info.updateAvailability();
        snapshot.put("available", availability == UpdateAvailability.UPDATE_AVAILABLE);
        snapshot.put(
                "inProgress",
                availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS);
        snapshot.put("priority", info.updatePriority());
        snapshot.put("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        snapshot.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        snapshot.put("installStatus", describeInstallStatus(info.installStatus()));
        return snapshot;
    }

    private static JSObject emptySnapshot() {
        final JSObject snapshot = new JSObject();
        snapshot.put("available", false);
        snapshot.put("inProgress", false);
        snapshot.put("priority", 0);
        snapshot.put("flexibleAllowed", false);
        snapshot.put("immediateAllowed", false);
        snapshot.put("installStatus", "unknown");
        return snapshot;
    }

    private static String describeInstallStatus(int status) {
        if (status == InstallStatus.PENDING) return "pending";
        if (status == InstallStatus.DOWNLOADING) return "downloading";
        if (status == InstallStatus.DOWNLOADED) return "downloaded";
        if (status == InstallStatus.INSTALLING) return "installing";
        if (status == InstallStatus.INSTALLED) return "installed";
        if (status == InstallStatus.FAILED) return "failed";
        if (status == InstallStatus.CANCELED) return "canceled";
        return "unknown";
    }

    private static String describeResult(int result) {
        if (result == Activity.RESULT_OK) return "accepted";
        if (result == Activity.RESULT_CANCELED) return "canceled";
        if (result == ActivityResult.RESULT_IN_APP_UPDATE_FAILED) return "failed";
        return "failed";
    }
}
