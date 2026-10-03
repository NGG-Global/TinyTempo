package com.tinytempo.app;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The audio output route, as one of four words the game keys its Tap offset on:
 * {@code speaker}, {@code wired}, {@code bluetooth} or {@code unknown}.
 *
 * <p>A bridge and nothing more, the same shape as the other plugins in this module: it
 * reads {@link AudioManager#getDevices} and relays a category; every decision about what
 * an offset is, and when it may change, is the web layer's ({@code audio/audioRoute.ts}).
 *
 * <p><b>Which output is "active".</b> Android has no public call that names the device
 * media is playing through — the per-attributes query is a system API — so the route is
 * read from the outputs that are connected, in the order Android's media routing prefers
 * them: a Bluetooth media sink, then wired or USB audio, then the built-in speaker. That is
 * the case that matters (earbuds in, earbuds out). Two external outputs at once — earbuds
 * and a wired headset together — is the one case where the platform's own pick could
 * differ, and it is recorded as unverified in docs/AUDIO_ROUTES.md.
 *
 * <p>Changes arrive through {@link AudioDeviceCallback}, which fires on connect and
 * disconnect and once on registration with every device already present. Only a change
 * of <em>category</em> is relayed: a second pair of earbuds is still Bluetooth.
 *
 * <p>Nothing identifying crosses the bridge or reaches logcat: no device name, no address,
 * only the category.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private static final String TAG = "TinyTempoRoute";
    private AudioManager audio;
    private AudioDeviceCallback callback;
    private String last = "unknown";

    @Override
    public void load() {
        try {
            audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            last = classify(audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS));
            callback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] added) { relay(); }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) { relay(); }
            };
            audio.registerAudioDeviceCallback(callback, new Handler(Looper.getMainLooper()));
        } catch (Throwable error) {
            // Unknown is the old behaviour: one offset. Never worth taking the game down for.
            Log.w(TAG, "Audio route detection is unavailable: " + error.getClass().getSimpleName());
            audio = null;
        }
    }

    /** The current category. Never rejects: unavailable is {@code unknown}. */
    @PluginMethod
    public void getRoute(final PluginCall call) {
        String route = current();
        last = route;
        JSObject payload = new JSObject();
        payload.put("route", route);
        call.resolve(payload);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (audio != null && callback != null) audio.unregisterAudioDeviceCallback(callback);
        } catch (Throwable ignored) {
            // Best effort: the process is going.
        }
        callback = null;
        super.handleOnDestroy();
    }

    private String current() {
        try {
            return audio == null ? "unknown" : classify(audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS));
        } catch (Throwable error) {
            return "unknown";
        }
    }

    private void relay() {
        String route = current();
        if (route.equals(last)) return;
        last = route;
        Log.i(TAG, "Audio route changed: " + route);
        JSObject payload = new JSObject();
        payload.put("route", route);
        notifyListeners("routeChange", payload);
    }

    /** The highest-priority category among the connected outputs. */
    static String classify(AudioDeviceInfo[] devices) {
        boolean bluetooth = false, wired = false, speaker = false;
        if (devices != null) {
            for (AudioDeviceInfo device : devices) {
                if (device == null || !device.isSink()) continue;
                String category = category(device.getType());
                if ("bluetooth".equals(category)) bluetooth = true;
                else if ("wired".equals(category)) wired = true;
                else if ("speaker".equals(category)) speaker = true;
            }
        }
        if (bluetooth) return "bluetooth";
        if (wired) return "wired";
        if (speaker) return "speaker";
        return "unknown";
    }

    /**
     * One device type's category. Bluetooth SCO is left out on purpose: it is the call
     * path, and a connected headset's media goes over A2DP or LE audio, not SCO. HDMI, a
     * dock and the earpiece are none of the three and read as unknown.
     */
    static String category(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_HEARING_AID:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_BLE_SPEAKER:
            case AudioDeviceInfo.TYPE_BLE_BROADCAST:
                return "bluetooth";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_ACCESSORY:
            case AudioDeviceInfo.TYPE_LINE_ANALOG:
            case AudioDeviceInfo.TYPE_LINE_DIGITAL:
            case AudioDeviceInfo.TYPE_AUX_LINE:
                return "wired";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE:
                return "speaker";
            default:
                return "unknown";
        }
    }
}
