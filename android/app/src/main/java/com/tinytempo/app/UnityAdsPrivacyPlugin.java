package com.tinytempo.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.unity3d.ads.metadata.MetaData;

/**
 * The one thing the game tells Unity Ads directly: that the player opted out under a US state
 * privacy law.
 *
 * <p>Everything else about Unity reaches it through AdMob mediation. Google's adapter starts
 * the SDK from the mediation mapping and forwards the GDPR answer and the age tags itself, but
 * nothing from UMP's US-state message, which UMP records as an IAB GPP string. This bridge reads
 * that string for the web layer and, when told to, writes Unity's documented opt-out. Whether
 * the string records an opt-out is decided in {@code src/monetization/usOptOut.ts}, where it is
 * tested; if a rule about consent lives in this file, it is in the wrong file.
 *
 * <p><b>There is no method that grants.</b> Unity keeps this value on the device and prefers it
 * over the GDPR one, so only {@code false} is ever written. See docs/UNITY_MEDIATION.md.
 *
 * <p>{@link MetaData} is marked deprecated in Unity Ads 4.20, and javac says so. It is still the
 * call Google's mediation guide gives for this adapter, and the one the adapter itself uses for
 * the GDPR answer and the age flag. Unity's newer {@code UnityAds.setUserOptOut} is not used
 * because neither company documents how it combines with those adapter-written values; move
 * when Google's guide does.
 *
 * @see <a href="https://developers.google.com/admob/android/mediation/unity">Unity Ads mediation</a>
 */
@CapacitorPlugin(name = "UnityAdsPrivacy")
public class UnityAdsPrivacyPlugin extends Plugin {

    /** The IAB GPP in-app key UMP writes, in the app's default SharedPreferences. */
    private static final String GPP_STRING = "IABGPP_HDR_GppString";

    @PluginMethod
    public void readGppString(final PluginCall call) {
        final Context context = getContext();
        // The file PreferenceManager.getDefaultSharedPreferences opens, named without the
        // deprecated android.preference API.
        final SharedPreferences preferences = context.getSharedPreferences(
                context.getPackageName() + "_preferences", Context.MODE_PRIVATE);
        final JSObject result = new JSObject();
        try {
            final String gpp = preferences.getString(GPP_STRING, null);
            if (gpp != null) result.put("gpp", gpp);
        } catch (ClassCastException notAString) {
            // Not a GPP string, so nothing on record; the web layer reads a missing value as that.
        }
        call.resolve(result);
    }

    @PluginMethod
    public void forwardOptOut(final PluginCall call) {
        try {
            final MetaData privacy = new MetaData(getContext());
            privacy.set("privacy.consent", false);
            privacy.commit();
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("unity-privacy-unavailable");
        }
    }
}
