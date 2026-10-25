import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Modal, Pressable, StatusBar, Text, View } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createHttpTransport } from '@robono/calling';
import { CallingScreen, createCallingController, type CallingController, type CallingState, type Contact } from '@robono/calling-react-native';
import { createNativeCallAdapters } from '@robono/calling-react-native/native';
import { createNativeCallRuntime, type CallRuntime } from '@robono/calling-react-native/runtime';

export interface CallingHostProps {
  accountId: string;
  /** Your authenticated backend returns a session for THIS signed-in account. */
  getSession(): Promise<{serviceUrl: string; token: string; expiresAt: number}>;
  /** Supply the HTTPS service origin configured for your integration. */
  serviceOrigin: string;
  connectionId: string;
  contact: Contact;
  resolveContact(connectionId: string): Contact | null;
  notificationCallId?: string;
  /** Clear the consumed notification from your router and push provider. */
  onNotificationConsumed?(callId: string): void;
  onController?(controller: CallingController | null): void;
  /** Supply your own native lifetime adapter if your app already owns calling. */
  createRuntime?(): CallRuntime;
}
const idle: CallingState = {phase:'idle',call:null,contact:null,speaker:false,muted:false,canMute:false,canSpeaker:false,connectedAt:null,error:null};
const emptySubscribe = () => () => {};
const idleSnapshot = () => idle;

/** Mount once under your account provider; keep backend callbacks stable. */
export function CallingHost(props: CallingHostProps) {
  const cleanup = useRef(Promise.resolve());
  // Account changes discard old contacts, notifications and rendered call state.
  return <AccountCallingHost key={props.accountId} {...props} cleanup={cleanup}/>;
}
function AccountCallingHost(props: CallingHostProps & {cleanup: React.MutableRefObject<Promise<void>>}) {
  const [controller, setController] = useState<CallingController | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [booting, setBooting] = useState(true);
  const [consumed, setConsumed] = useState<string | undefined>();
  const handled = useRef(new Set<string>());
  const availabilityNotBefore = useRef(0);
  const state = useSyncExternalStore(controller?.subscribe || emptySubscribe, controller?.getSnapshot || idleSnapshot, idleSnapshot);
  const pendingNotification = props.notificationCallId && consumed !== props.notificationCallId;
  useEffect(() => { props.onController?.(controller); return () => props.onController?.(null); }, [controller, props.onController]);
  useEffect(() => {
    let cancelled = false, instance: CallingController | undefined;
    let runtime: CallRuntime | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposal: Promise<void> | undefined;
    const dispose = () => disposal ||= (async () => {
      try { await instance?.dispose(); } finally { await runtime?.dispose(); }
    })().catch(() => {});
    let renewDue = false, renewing = false;
    setBooting(true); setError(null); setAvailable(false);
    const renewWhenIdle = () => {
      if (!cancelled && !renewing && instance?.client.closed) {
        renewing = true; clearTimeout(expiryTimer); clearTimeout(renewalTimer); unsubscribe?.();
        setController(null); setAvailable(false);
        setError('Calling access ended. Reconnect to check your access.');
        props.cleanup.current = dispose();
        return;
      }
      if (!cancelled && renewDue && !renewing && instance?.getSnapshot().phase === 'idle') {
        renewing = true; setAttempt(value => value + 1);
      }
    };
    const start = async () => {
      try {
        await props.cleanup.current;
        if (cancelled) return;
        const session = await props.getSession();
        if (cancelled) return;
        const service = new URL(session.serviceUrl);
        if (service.protocol !== 'https:' || service.origin !== props.serviceOrigin || service.username || service.password || service.search || service.hash) throw Error('Unexpected calling service');
        if (!session.token || !Number.isFinite(session.expiresAt) || session.expiresAt - Date.now() < 60000) throw Error('Calling session expired');
        runtime = props.createRuntime?.() || createNativeCallRuntime({
          notificationTitle:'Voice call', notificationText:'Call in progress', channelName:'Ongoing calls', endLabel:'End call',
          onError:() => { if (!cancelled) setError('The call was interrupted.'); },
        });
        const adapters = createNativeCallAdapters({
          runtime,
          ringtone:'robono', onError:() => { if (!cancelled) setError('Call audio is unavailable.'); },
          restoreAudio:() => setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,
            interruptionMode:'duckOthers',shouldPlayInBackground:false,shouldRouteThroughEarpiece:false}),
        });
        instance = createCallingController({request:createHttpTransport({baseUrl:session.serviceUrl,token:session.token}),
          ...adapters, resolveContact:props.resolveContact,
          onError:() => { if (!cancelled) setError('The call could not connect. Please try again.'); }});
        instance.setForeground(AppState.currentState === 'active');
        runtime.attach(instance);
        unsubscribe = instance.subscribe(renewWhenIdle);
        setController(instance);
        await instance.listen();
        if (cancelled || renewing) return;
        setBooting(false);
        // Renew only while idle. A new session cannot take over an active call.
        renewalTimer = setTimeout(() => { renewDue = true; renewWhenIdle(); }, session.expiresAt - Date.now() - 30000);
        expiryTimer = setTimeout(() => {
          if (cancelled) return;
          renewing = true; unsubscribe?.();
          setController(null); setAvailable(false);
          setError('Your calling session expired. Reconnect to make or receive calls.');
          props.cleanup.current = dispose();
        }, session.expiresAt - Date.now());
      } catch {
        if (!cancelled) {
          if (instance || runtime) props.cleanup.current = dispose();
          setController(null); setBooting(false); setError('Calling is unavailable. Please try again.');
        }
      }
    };
    void start();
    return () => {
      cancelled = true; clearTimeout(expiryTimer); clearTimeout(renewalTimer); unsubscribe?.();
      setController(null); setAvailable(false);
      if (instance || runtime) props.cleanup.current = dispose();
    };
  }, [attempt, props.getSession, props.resolveContact, props.serviceOrigin, props.cleanup, props.createRuntime]);
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined, checking = false;
    setAvailable(false);
    const check = async () => {
      clearTimeout(timer);
      if (!controller || cancelled || checking) return;
      if (AppState.currentState !== 'active' || controller.getSnapshot().phase !== 'idle') return;
      if (Date.now() < availabilityNotBefore.current) {
        timer = setTimeout(check, availabilityNotBefore.current - Date.now()); return;
      }
      checking = true;
      let nextCheck = 10000;
      try {
        const result = await controller.client.availability(props.connectionId);
        availabilityNotBefore.current = 0;
        if (!cancelled) setAvailable(result.voiceAvailable);
      } catch (error) {
        if (!cancelled) setAvailable(false);
        const retryAfter = (error as {retryAfterMs?: number}).retryAfterMs;
        if (Number.isFinite(retryAfter)) nextCheck = Math.min(2147483647, Math.max(nextCheck, retryAfter!));
        availabilityNotBefore.current = Date.now() + nextCheck;
      }
      finally { checking = false; if (!cancelled) timer = setTimeout(check, nextCheck); }
    };
    const sub = AppState.addEventListener('change', value => {
      controller?.setForeground(value === 'active');
      if (value === 'active') { void controller?.refresh(); void check(); }
      else clearTimeout(timer);
    });
    void check();
    return () => { cancelled = true; clearTimeout(timer); sub.remove(); };
  }, [controller, props.connectionId, state.phase]);
  useEffect(() => {
    const id = props.notificationCallId;
    if (!controller || !id || handled.current.has(id)) return;
    handled.current.add(id);
    // openIncoming publishes loading synchronously, before removing startup cover.
    void controller.openIncoming(id).catch(() => setError('This call could not be opened.'));
    setConsumed(id); props.onNotificationConsumed?.(id);
  }, [controller, props.notificationCallId, props.onNotificationConsumed]);
  const close = () => {
    if (pendingNotification && props.notificationCallId) {
      handled.current.add(props.notificationCallId); setConsumed(props.notificationCallId);
      props.onNotificationConsumed?.(props.notificationCallId);
      return;
    }
    if (state.phase === 'error') controller?.dismissError();
    else void controller?.hangUp().catch(() => setError('The call could not be ended.'));
  };
  const call = async () => {
    if (!controller) return;
    setError(null);
    try {
      if (!(await controller.client.availability(props.connectionId)).voiceAvailable) {
        setAvailable(false); setError('This contact cannot receive a call right now.'); return;
      }
      await controller.call(props.connectionId, props.contact);
    } catch { setError('The call could not connect. Please try again.'); }
  };
  const visible = state.phase !== 'idle' || !!pendingNotification;
  const screen = pendingNotification && state.phase === 'idle'
    ? {...idle, phase:(!booting && !controller ? 'error' : 'loading') as CallingState['phase'], error:!booting && !controller ? 'call_unavailable' : null}
    : state;
  return <View>
    {error && <Text accessibilityRole="alert">{error}</Text>}
    {!controller && !booting && <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}><Text>Reconnect calling</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityState={{disabled:!available}} disabled={!available} onPress={() => { void call(); }}>
      <Text>Call {props.contact.name}</Text>
    </Pressable>
    <Modal visible={visible} presentationStyle="fullScreen" animationType="none" onRequestClose={close}>
      {visible && <SafeAreaProvider><StatusBar barStyle="light-content"/><CallingScreen state={screen}
        onResume={() => { void controller?.resume().catch(() => {}); }}
        onAnswer={() => { void controller?.answer().catch(() => {}); }} onHangUp={close} onClose={close}
        onMute={value => controller?.mute(value)} onSpeaker={value => controller?.setSpeaker(value)}/></SafeAreaProvider>}
    </Modal>
  </View>;
}
