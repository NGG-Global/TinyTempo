package com.tinytempo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Play Billing lives in this module rather than an npm plugin, so it is registered
        // by hand and must be registered before the bridge starts.
        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
