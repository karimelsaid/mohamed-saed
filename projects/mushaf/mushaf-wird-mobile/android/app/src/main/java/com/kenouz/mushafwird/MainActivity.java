package com.kenouz.mushafwird;

import android.os.Bundle;
import android.os.PowerManager;
import android.content.Context;
import android.content.res.Configuration;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.content.pm.PackageManager;
import android.Manifest;
import java.util.Arrays;
import com.getcapacitor.BridgeActivity;
import com.kenouz.mushafwird.MediaBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void attachBaseContext(Context newBase) {
        Configuration override = new Configuration(newBase.getResources().getConfiguration());
        override.fontScale = 1.0f;
        applyOverrideConfiguration(override);
        super.attachBaseContext(newBase);
    }

    @Override
    public void onResume() {
        super.onResume();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins BEFORE super.onCreate
        registerPlugin(MediaBridgePlugin.class);
        
        super.onCreate(savedInstanceState);

        // Explicitly check for microphone permission to trigger the system dialog if needed
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1);
        }

        // Configure WebView for media capture
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    if (Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        request.grant(request.getResources());
                    } else {
                        super.onPermissionRequest(request);
                    }
                }
            });
        }
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
