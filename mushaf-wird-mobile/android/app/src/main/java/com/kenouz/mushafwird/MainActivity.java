package com.kenouz.mushafwird;

import android.os.Bundle;
import android.os.PowerManager;
import android.content.Context;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.kenouz.mushafwird.MediaBridgePlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins BEFORE super.onCreate
        registerPlugin(MediaBridgePlugin.class);
        
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onPostResume() {
        super.onPostResume();
        // Just ensure UI timers are running when app is in front
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
        }
    }
}
