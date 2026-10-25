package com.robono.calling;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.lang.ref.WeakReference;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
import com.facebook.react.jstasks.HeadlessJsTaskContext;

/** Owns only an explicitly started, answered/outgoing call. Never starts from a push. */
public final class CallingService extends Service {
  private static WeakReference<CallingService> instance = new WeakReference<>(null);
  private static final String CHANNEL = "robono_bridge_active_call";
  private static final int NOTIFICATION = 0x524243;
  private String token;
  private PowerManager.WakeLock wakeLock;
  private HeadlessJsTaskContext taskContext;
  private Integer taskId;
  private final Handler clock = new Handler(Looper.getMainLooper());
  private final Runnable tick = new Runnable() {
    @Override public void run() {
      if (token == null) return;
      CallingRuntime.emit(token, "tick"); clock.postDelayed(this, 250);
    }
  };
  public static void finish(String owner) {
    CallingService service = instance.get();
    if (service != null && owner.equals(service.token)) service.stopSelf();
  }
  @Override public void onCreate() { super.onCreate(); instance = new WeakReference<>(this); }
  @Override public IBinder onBind(Intent intent) { return null; }
  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) { stopSelf(); return START_NOT_STICKY; }
    String owner = intent.getStringExtra("token");
    if ("end".equals(intent.getAction())) {
      if (owner != null && owner.equals(token)) {
        CallingRuntime.emit(token, "end");
        // Keep the clock alive for the short hangup cue and audio cleanup.
        // Normal cleanup calls finish(); this deadline handles an unresponsive JS host.
        clock.postDelayed(() -> { if (owner.equals(token)) stopSelf(); }, 3000);
      }
      return START_NOT_STICKY;
    }
    ResultReceiver result = intent.getParcelableExtra("result");
    if (owner == null || token != null && !token.equals(owner)) {
      if (result != null) result.send(1, Bundle.EMPTY); return START_NOT_STICKY;
    }
    token = owner;
    try {
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, intent.getStringExtra("channel"), NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null); channel.enableVibration(false); manager.createNotificationChannel(channel);
      }
      Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
      if (launch == null) throw new IllegalStateException("calling_launch_activity_missing");
      launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      Intent end = new Intent(this, CallingService.class).setAction("end").putExtra("token", token);
      PendingIntent hangup = PendingIntent.getService(this, NOTIFICATION, end, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
      builder.setSmallIcon(android.R.drawable.stat_sys_phone_call).setContentTitle(intent.getStringExtra("title"))
        .setContentText(intent.getStringExtra("text")).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE)
        .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, intent.getStringExtra("endLabel"), hangup).build());
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
      else startForeground(NOTIFICATION, builder.build());
      if (taskId == null) {
        taskContext = HeadlessJsTaskContext.getInstance(CallingRuntime.activeContext());
        WritableMap data = Arguments.createMap(); data.putString("token", token);
        // Lifetime is bounded by this non-restarting call service, not a push.
        taskId = taskContext.startTask(new HeadlessJsTaskConfig("RobonoBridgeCallLifetime", data, 0, true));
        clock.post(tick);
      }
      if (wakeLock == null) {
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName()+":bridge-call");
        wakeLock.acquire();
      }
      if (result != null) result.send(0, Bundle.EMPTY);
    } catch (Exception error) {
      if (result != null) result.send(1, Bundle.EMPTY); stopSelf();
    }
    return START_NOT_STICKY;
  }
  @Override public void onTaskRemoved(Intent rootIntent) { if (token != null) CallingRuntime.emit(token, "end"); stopSelf(); }
  @Override public void onDestroy() {
    clock.removeCallbacksAndMessages(null);
    if (token != null) CallingRuntime.emit(token, "end");
    if (taskContext != null && taskId != null) taskContext.finishTask(taskId);
    taskId = null; taskContext = null;
    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    stopForeground(true);
    if (instance.get() == this) instance.clear();
    super.onDestroy();
  }
}
