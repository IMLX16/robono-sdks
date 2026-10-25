package com.robono.calling;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;
import com.facebook.react.bridge.*;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.lang.ref.WeakReference;

public final class CallingRuntime extends ReactContextBaseJavaModule {
  private static WeakReference<ReactApplicationContext> context = new WeakReference<>(null);
  private final Handler main = new Handler(Looper.getMainLooper());
  private String ownerToken;
  public CallingRuntime(ReactApplicationContext value) { super(value); context = new WeakReference<>(value); }
  public String getName() { return "RobonoCallingRuntime"; }
  @ReactMethod public void addListener(String name) {}
  @ReactMethod public void removeListeners(double count) {}
  static ReactApplicationContext activeContext() {
    ReactApplicationContext c = context.get();
    if (c == null || !c.hasActiveReactInstance()) throw new IllegalStateException("calling_context_unavailable");
    return c;
  }
  static void emit(String token, String type) {
    ReactApplicationContext c = context.get();
    if (c == null || !c.hasActiveReactInstance()) return;
    WritableMap data = Arguments.createMap(); data.putString("token", token); data.putString("type", type);
    c.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("RobonoCallingRuntimeEvent", data);
  }
  @ReactMethod public void begin(String token, String title, String text, String channel, String endLabel, Promise promise) {
    main.post(() -> {
      ReactApplicationContext c = getReactApplicationContext();
      if (c.getLifecycleState() != LifecycleState.RESUMED || c.getCurrentActivity() == null) {
        promise.reject("open_app_to_start_call", "Open the app to start a call."); return;
      }
      if (c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("microphone_permission_denied", "Microphone permission is required."); return;
      }
      final boolean[] settled = {false};
      ownerToken = token;
      Runnable timeout = () -> {
        if (!settled[0]) { settled[0] = true; CallingService.finish(token); promise.reject("calling_service_timeout", "Call audio could not start."); }
      };
      ResultReceiver result = new ResultReceiver(main) {
        @Override protected void onReceiveResult(int code, android.os.Bundle data) {
          if (settled[0]) { if (code == 0) CallingService.finish(token); return; }
          settled[0] = true; main.removeCallbacks(timeout);
          if (code == 0) promise.resolve(null);
          else promise.reject("calling_service_unavailable", "Call audio could not start.");
        }
      };
      Intent intent = new Intent(c, CallingService.class).putExtra("token", token)
        .putExtra("title", title).putExtra("text", text).putExtra("channel", channel)
        .putExtra("endLabel", endLabel).putExtra("result", result);
      try {
        main.postDelayed(timeout, 4000);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(intent); else c.startService(intent);
      } catch (Exception error) {
        settled[0] = true; main.removeCallbacks(timeout);
        promise.reject("calling_service_unavailable", error);
      }
    });
  }
  @ReactMethod public void end(String token, Promise promise) {
    main.post(() -> { CallingService.finish(token); if (token.equals(ownerToken)) ownerToken = null; promise.resolve(null); });
  }
  @Override public void invalidate() {
    main.post(() -> { if (ownerToken != null) { CallingService.finish(ownerToken); ownerToken = null; } });
    super.invalidate();
  }
}
