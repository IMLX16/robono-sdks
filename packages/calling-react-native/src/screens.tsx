import React, { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import {callingColors,callingText,callingInk,callingIcons,type CallingAppearance} from './appearance.js';
import type { CallingController, CallingState } from './types.js';

export interface CallingTheme { background: string; foreground: string; secondary: string; control: string; accent: string; answer: string; end: string }
const theme: CallingTheme = callingColors;
export interface CallingLabels { call: string; contact: string; incoming: string; outgoing: string; connecting: string; held: string; resume: string; resuming: string; resumeFailed: string; audioBusy: string; localHold: string; loading: string; answer: string; decline: string; mute: string; unmute: string; speaker: string; end: string; close: string; unavailable: string; failed: string }
const labels: CallingLabels = callingText;
type Icon = 'answer' | 'end' | 'mute' | 'speaker';
// Familiar handset, microphone and speaker silhouettes; never status checkmarks.
function ControlIcon({ name, color, muted }: {name: Icon; color: string; muted?: boolean}) {
  return <Svg width={30} height={30} viewBox="0 0 24 24" accessible={false}><Path d={callingIcons[name]} fill={color}/>{muted && <Path d="M3 2 22 21" stroke={color} strokeWidth={2.5}/>}</Svg>;
}
export interface CallingScreenProps {
  state: CallingState;
  appearance?: CallingAppearance;
  onResume?(): void; onAnswer(): void; onHangUp(): void; onMute(value: boolean): void; onSpeaker(value: boolean): void; onClose(): void;
  theme?: Partial<CallingTheme>; labels?: Partial<CallingLabels>;
  formatError?: (code: string) => string;
  /** Insets from the host's safe-area provider, in logical pixels. */
  insets?: {top: number; bottom: number};
}
export function CallingScreen(props: CallingScreenProps) {
  const safeArea = useContext(SafeAreaInsetsContext);
  const insets = props.insets || safeArea;
  const s = props.state, c = {...theme, ...props.appearance?.theme, ...props.theme}, t = {...labels, ...props.appearance?.labels, ...props.labels};
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (s.phase !== 'connected') return;
    setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [s.phase, s.connectedAt]);
  if (s.phase === 'idle') return null;
  const seconds = s.connectedAt == null ? 0 : Math.max(0, Math.floor((clock - s.connectedAt) / 1000));
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const title = s.contact?.name || t.contact;
  const error = s.phase === 'held' ? (s.resumeError ? props.formatError?.(s.resumeError) || (s.resumeError === 'audio_still_interrupted' ? t.audioBusy : t.resumeFailed) : null) : s.error ? props.formatError?.(s.error) || (s.error === 'call_unavailable' ? t.unavailable : t.failed) : null;
  const status = s.phase === 'connected' ? duration : s.phase === 'error' ? '' : t[s.phase];
  const control = (name: Icon, title: string, onPress: () => void, options: {disabled?: boolean; selected?: boolean; color?: string} = {}) => <Pressable
    key={name} accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{disabled: !!options.disabled, selected: !!options.selected}}
    disabled={options.disabled} onPress={onPress} hitSlop={8}
    style={[styles.button, options.disabled && styles.disabled]}>
    <View style={[styles.circle, {backgroundColor: options.color || (options.selected ? c.foreground : c.control)}]}>
      <ControlIcon name={name} muted={name === 'mute' && s.muted} color={options.color ? callingInk(options.color) : options.selected ? c.background : c.foreground}/>
    </View><Text style={[styles.label, {color: c.foreground}]}>{title}</Text>
  </Pressable>;
  return <ScrollView style={{flex: 1, backgroundColor: c.background}} contentContainerStyle={[styles.screen, {paddingTop: Math.max(36, insets?.top || 0) + 32, paddingBottom: Math.max(24, insets?.bottom ?? 48) + 16}]}>
    <View style={styles.identity}>
      {(props.appearance?.logoUrl || props.appearance?.appName) && <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}}>{props.appearance.logoUrl && <Image source={{uri:props.appearance.logoUrl}} style={{width:28,height:28,borderRadius:6}} resizeMode="contain"/>}<Text style={{color:c.secondary,fontSize:14}}>{props.appearance.appName}</Text></View>}
      {s.contact?.avatarUri ? <Image source={{uri: s.contact.avatarUri}} style={styles.avatar} accessibilityIgnoresInvertColors/>
        : <View style={[styles.avatar, {backgroundColor: c.control}]}><Text style={[styles.initial, {color: c.accent}]}>{title.trim().charAt(0).toUpperCase()}</Text></View>}
      <Text style={[styles.name, {color: c.foreground}]}>{title}</Text>
      <Text style={[styles.kind, {color: c.secondary}]}>{t.call}</Text>
      <Text style={[styles.status, {color: c.foreground}]} accessibilityLiveRegion={s.phase === 'connected' ? 'none' : 'polite'}>{status}</Text>
      {s.phase === 'held' && s.localHeld && <Text style={[styles.detail, {color: c.secondary}]}>{t.localHold}</Text>}
      {!!error && <Text accessibilityRole="alert" style={[styles.detail, {color: c.foreground}]}>{error}</Text>}
    </View>
    <View style={styles.controls}>
      {s.phase === 'held' && s.localHeld && props.onResume && <Pressable accessibilityRole="button" accessibilityState={{disabled: !!s.resumePending, busy: !!s.resumePending}} disabled={s.resumePending} onPress={props.onResume} style={[styles.close, {backgroundColor: c.control}, s.resumePending && styles.disabled]}><Text style={[styles.label, {color: c.foreground}]}>{s.resumePending ? t.resuming : t.resume}</Text></Pressable>}
      {['outgoing', 'connecting', 'connected'].includes(s.phase) && <View style={styles.row}>
        {control('mute', s.muted ? t.unmute : t.mute, () => props.onMute(!s.muted), {disabled: !s.canMute, selected: s.muted})}
        {control('speaker', t.speaker, () => props.onSpeaker(!s.speaker), {disabled: !s.canSpeaker, selected: s.speaker})}
      </View>}
      {s.phase === 'error' || s.phase === 'loading' ? <Pressable accessibilityRole="button" onPress={s.phase === 'loading' ? props.onHangUp : props.onClose} style={[styles.close, {backgroundColor: c.control}]}><Text style={[styles.label, {color: c.foreground}]}>{t.close}</Text></Pressable> : <View style={styles.row}>
        {control('end', s.phase === 'incoming' ? t.decline : t.end, props.onHangUp, {color: c.end})}
        {s.phase === 'incoming' && control('answer', t.answer, props.onAnswer, {color: c.answer})}
      </View>}
    </View>
  </ScrollView>;
}
export function useCalling(controller: CallingController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
export interface CallingOverlayProps extends Omit<CallingScreenProps, 'state' | 'onResume' | 'onAnswer' | 'onHangUp' | 'onMute' | 'onSpeaker' | 'onClose'> {
  controller: CallingController;
}
/** Mount only when you choose Robono's interface. No global navigation changes. */
export function CallingOverlay({controller, ...props}: CallingOverlayProps) {
  const state = useCalling(controller);
  useEffect(()=>{controller.reportComponents?.(['screens']);},[controller]);
  useEffect(() => {
    controller.setForeground(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', value => controller.setForeground(value === 'active'));
    return () => sub.remove();
  }, [controller]);
  const active = state.phase !== 'idle';
  return <Modal visible={active} presentationStyle="fullScreen" animationType="none" onRequestClose={() => { void controller.hangUp().catch(() => {}); }}>
    {active && <SafeAreaProvider><StatusBar barStyle={callingInk(props.theme?.background||props.appearance?.theme.background||theme.background)==='#000000'?'dark-content':'light-content'}/>
      <CallingScreen {...props} state={state} onResume={() => { void controller.resume().catch(() => {}); }} onAnswer={() => { void controller.answer().catch(() => {}); }}
        onHangUp={() => { void controller.hangUp().catch(() => {}); }} onMute={value => controller.mute(value)}
        onSpeaker={value => controller.setSpeaker(value)} onClose={() => controller.dismissError()}/></SafeAreaProvider>}
  </Modal>;
}
const styles = StyleSheet.create({
  screen: {flexGrow: 1, paddingHorizontal: 24, justifyContent: 'space-between', gap: 40},
  identity: {alignItems: 'center', gap: 14}, avatar: {height: 104, width: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 16},
  initial: {fontSize: 44, fontWeight: '600'}, name: {fontSize: 28, fontWeight: '600', textAlign: 'center'},
  kind: {fontSize: 16}, status: {fontSize: 21, marginTop: 8, textAlign: 'center'}, detail: {fontSize: 16, textAlign: 'center'},
  controls: {gap: 30, alignItems: 'center'}, row: {flexDirection: 'row', justifyContent: 'center', gap: 48, flexWrap: 'wrap'},
  button: {alignItems: 'center', gap: 10, minWidth: 80, maxWidth: 140}, circle: {height: 72, width: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 17, textAlign: 'center'}, disabled: {opacity: 0.4}, close: {paddingVertical: 16, paddingHorizontal: 32, borderRadius: 28},
});
