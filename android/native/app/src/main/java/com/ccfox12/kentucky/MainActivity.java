package com.ccfox12.kentucky;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String NATIVE_WHEEL_EVENT = "kentucky:native-wheel";

    private WebView kentuckyWebView;
    private float horizontalScrollFactorCss = 48f;
    private float verticalScrollFactorCss = 48f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KentuckySafPlugin.class);
        super.onCreate(savedInstanceState);
        kentuckyWebView = getBridge() != null ? getBridge().getWebView() : null;
        configureSystemBars();
        // Disable page-level pinch zoom so React Flow canvas pinch is the only zoom channel.
        if (kentuckyWebView != null) {
            WebSettings settings = kentuckyWebView.getSettings();
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            ViewConfiguration configuration = ViewConfiguration.get(this);
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float density = Math.max(metrics.density, 1f);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                horizontalScrollFactorCss =
                    configuration.getScaledHorizontalScrollFactor() / density;
                verticalScrollFactorCss =
                    configuration.getScaledVerticalScrollFactor() / density;
            } else {
                TypedValue fallback = new TypedValue();
                if (getTheme().resolveAttribute(
                    android.R.attr.listPreferredItemHeight,
                    fallback,
                    true
                )) {
                    float fallbackCss = fallback.getDimension(metrics) / density;
                    horizontalScrollFactorCss = fallbackCss;
                    verticalScrollFactorCss = fallbackCss;
                }
            }
        }
    }

    private void configureSystemBars() {
        // Edge-to-edge chrome; content is inset via WebView margins (not CSS safe-area alone).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        // Capacitor BridgeActivity uses bridge_layout_main.xml (@id/webview) — NOT our
        // activity_main.xml @id/main_content. Apply insets to the live Bridge WebView.
        WebView webView = kentuckyWebView;
        if (webView == null && getBridge() != null) {
            webView = getBridge().getWebView();
            kentuckyWebView = webView;
        }
        if (webView == null) return;

        View parent = webView.getParent() instanceof View ? (View) webView.getParent() : null;
        if (parent != null) {
            parent.setBackgroundColor(Color.BLACK);
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            int bottom = Math.max(bars.bottom, ime.bottom);
            ViewGroup.LayoutParams params = view.getLayoutParams();
            if (params instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) params;
                margins.setMargins(bars.left, bars.top, bars.right, bottom);
                view.setLayoutParams(margins);
                view.setPadding(0, 0, 0, 0);
            } else {
                view.setPadding(bars.left, bars.top, bars.right, bottom);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    /**
     * Android WebView can latch trackpad wheel events to the first focused overflow node.
     * Consume pointer-class ACTION_SCROLL here and re-emit it with the native cursor position;
     * touch scrolling never enters this path.
     */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (
            event.getActionMasked() == MotionEvent.ACTION_SCROLL &&
            (event.getSource() & InputDevice.SOURCE_CLASS_POINTER) != 0 &&
            dispatchNativeWheel(event)
        ) {
            return true;
        }
        return super.dispatchGenericMotionEvent(event);
    }

    private boolean dispatchNativeWheel(MotionEvent event) {
        WebView webView = kentuckyWebView;
        if (webView == null || webView.getWidth() <= 0 || webView.getHeight() <= 0) {
            return false;
        }

        float axisX = event.getAxisValue(MotionEvent.AXIS_HSCROLL);
        float axisY = event.getAxisValue(MotionEvent.AXIS_VSCROLL);
        if (Math.abs(axisX) < 0.0001f && Math.abs(axisY) < 0.0001f) {
            return false;
        }

        int[] location = new int[2];
        webView.getLocationOnScreen(location);
        float localX = event.getRawX() - location[0];
        float localY = event.getRawY() - location[1];
        float xRatio = clamp(localX / webView.getWidth(), 0f, 1f);
        float yRatio = clamp(localY / webView.getHeight(), 0f, 1f);

        // Android axis signs are opposite DOM wheel delta signs.
        float deltaX = -axisX * horizontalScrollFactorCss;
        float deltaY = -axisY * verticalScrollFactorCss;
        String script = String.format(
            Locale.US,
            "window.dispatchEvent(new CustomEvent('%s',{detail:{" +
                "xRatio:%.8f,yRatio:%.8f,deltaX:%.4f,deltaY:%.4f," +
                "ctrlKey:%s,metaKey:%s,shiftKey:%s,altKey:%s}}));",
            NATIVE_WHEEL_EVENT,
            xRatio,
            yRatio,
            deltaX,
            deltaY,
            Boolean.toString(hasMeta(event, KeyEvent.META_CTRL_ON)),
            Boolean.toString(hasMeta(event, KeyEvent.META_META_ON)),
            Boolean.toString(hasMeta(event, KeyEvent.META_SHIFT_ON)),
            Boolean.toString(hasMeta(event, KeyEvent.META_ALT_ON))
        );
        webView.evaluateJavascript(script, null);
        return true;
    }

    private static boolean hasMeta(MotionEvent event, int modifierMask) {
        return (event.getMetaState() & modifierMask) != 0;
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}
