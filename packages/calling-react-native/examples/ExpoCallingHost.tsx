import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {CallingController} from '@robono/calling-react-native';
import type {NotificationStore} from '@robono/calling-react-native/notifications';
import {connectExpoCallingNotifications} from '@robono/calling-react-native/expo-notifications';
import {CallingHost, type CallingHostProps} from './CallingHost';

export interface ExpoCallingHostProps extends Omit<CallingHostProps, 'notificationCallId' | 'onNotificationConsumed' | 'onController'> {
  notificationStore: NotificationStore;
  /** Return the account identifier your backend attached to this push. */
  recipientAccount(data: unknown): string | null;
  onNotificationError(error: Error): void;
  /** Use this readiness in withCallingNotificationPresentation's callback. */
  onReadyChange?(ready: boolean): void;
}
/** Place above chat navigation after restoring the signed-in account. */
export function ExpoCallingHost(props: ExpoCallingHostProps) {
  return <AccountNotifications key={props.accountId} {...props}/>;
}
function AccountNotifications(props: ExpoCallingHostProps) {
  const current = useRef<CallingController | null>(null);
  const pendingRefresh = useRef(false);
  const [callId, setCallId] = useState<string>();
  const onController = useCallback((controller: CallingController | null) => {
    current.current = controller;
    props.onReadyChange?.(!!controller);
    if (controller && pendingRefresh.current) {
      pendingRefresh.current = false;
      void controller.refresh().catch(props.onNotificationError);
    }
  }, [props.onNotificationError, props.onReadyChange]);
  useEffect(() => {
    const notifications = connectExpoCallingNotifications({
      accountKey:props.accountId, store:props.notificationStore,
      recipientAccount:props.recipientAccount, open:setCallId,
      refresh:async () => { if (current.current) await current.current.refresh(); else pendingRefresh.current = true; },
      onError:props.onNotificationError,
    });
    return () => notifications.dispose();
  }, [props.accountId, props.notificationStore, props.recipientAccount, props.onNotificationError]);
  const consumed = useCallback((id: string) => setCallId(value => value === id ? undefined : value), []);
  return <CallingHost {...props} notificationCallId={callId} onController={onController} onNotificationConsumed={consumed}/>;
}
