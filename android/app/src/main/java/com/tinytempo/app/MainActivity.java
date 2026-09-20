package com.tinytempo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Billing, Play Games and In-App Updates live in this module rather than npm
        // plugins, so they are registered by hand and must be registered before the bridge starts.
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(PlayGamesPlugin.class);
        registerPlugin(PlayUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
