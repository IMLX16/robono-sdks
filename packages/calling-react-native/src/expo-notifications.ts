import * as Notifications from 'expo-notifications';
import {AppState} from 'react-native';
import { createCallingNotificationRouter, callingNotificationPresentation, type CallingNotificationRouterOptions } from './notification-router.js';
export { callingNotificationPresentation } from './notification-router.js';

/** Compose explicitly with your existing handler; preserve ordinary message alerts. */
export function withCallingNotificationPresentation(handler: Notifications.NotificationHandler, canPresentCall: () => boolean): Notifications.NotificationHandler {
  return {...handler, handleNotification: async notification => {
    const decision = callingNotificationPresentation(notification.request.content.data, AppState.currentState === 'active');
    if (decision === 'dismiss' || decision === 'screen' && canPresentCall())
      return {shouldPlaySound:false, shouldSetBadge:false, shouldShowBanner:false, shouldShowList:false};
    return handler.handleNotification(notification);
  }};
}

/** Registers listeners, never replaces the app's global presentation handler. */
export function connectExpoCallingNotifications(options: Omit<CallingNotificationRouterOptions, 'dismiss'> & {onError(error: Error): void}) {
  let disposed = false;
  const router = createCallingNotificationRouter({...options, dismiss:async callId => {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(shown.filter(item => item.request.content.data?.call_id === callId &&
      options.recipientAccount(item.request.content.data) === options.accountKey)
      .map(item => Notifications.dismissNotificationAsync(item.request.identifier)));
  }});
  const received = Notifications.addNotificationReceivedListener(notification => {
    void router.handle(notification.request.content.data).catch(options.onError);
  });
  const response = async (value: Notifications.NotificationResponse | null) => {
    if (disposed || !value || value.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = value.notification.request.content.data;
    if (!callingNotificationPresentation(data, false)) return;
    if (await router.handle(data, true)) {
      // Don't clear a different notification that arrived while storage was read.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!disposed && last?.notification.request.identifier === value.notification.request.identifier)
        await Notifications.clearLastNotificationResponseAsync();
    }
  };
  const opened = Notifications.addNotificationResponseReceivedListener(value => { void response(value).catch(options.onError); });
  const ready = Notifications.getLastNotificationResponseAsync().then(response);
  // Report a startup failure without leaving an unhandled rejection.
  void ready.catch(options.onError);
  return {ready, dispose() { disposed = true; received.remove(); opened.remove(); router.dispose(); }};
}
