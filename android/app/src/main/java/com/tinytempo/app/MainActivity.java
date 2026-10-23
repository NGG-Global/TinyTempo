package com.tinytempo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Billing, Play Games, In-App Updates, In-App Review, the audio route and Unity Ads'
        // US opt-out live in this module rather than npm plugins, so they are registered by
        // hand, before the bridge starts.
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(PlayGamesPlugin.class);
        registerPlugin(PlayUpdatePlugin.class);
        registerPlugin(PlayReviewPlugin.class);
        registerPlugin(AudioRoutePlugin.class);
        registerPlugin(UnityAdsPrivacyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
