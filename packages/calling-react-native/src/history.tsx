import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { CallHistoryEntry } from '@robono/calling';
import { describeCall } from '@robono/calling/history';
/** Render in the existing conversation; uses the caller's side and bubble color. */
export function CallHistoryItem({entry, incomingColor, outgoingColor, textColor = '#ffffff', onCallBack, label}: {
  entry: CallHistoryEntry; incomingColor: string; outgoingColor: string; textColor?: string;
  /** Caller must recheck live availability before placing the callback. */
  onCallBack?: () => void;
  label?: (entry: CallHistoryEntry) => {label: string; detail: string; missed: boolean};
}) {
  const description = label ? label(entry) : describeCall(entry);
  const incoming = entry.role === 'callee';
  const body = <View style={[styles.bubble, {backgroundColor: incoming ? incomingColor : outgoingColor}]}>
    <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
      <Path d={description.missed ? 'M4 5v6h6M4 11l6-6 7 7 4-4' : incoming ? 'M18 5 6 17M6 10v7h7' : 'M6 18 18 6M11 6h7v7'} stroke={textColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg><View style={styles.text}><Text style={[styles.title,{color:textColor}]}>{description.label}</Text>
      {!!description.detail && <Text style={{color:textColor}}>{description.detail}</Text>}
    </View>
  </View>;
  return <View style={{alignItems: incoming ? 'flex-start' : 'flex-end', marginVertical: 4}}>
    {onCallBack ? <Pressable onPress={onCallBack} accessibilityRole="button" accessibilityLabel={`${description.label}. ${description.detail}`} accessibilityHint="Call this contact" style={styles.width}>{body}</Pressable> : body}
  </View>;
}
const styles=StyleSheet.create({bubble:{borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:12,maxWidth:'85%'},width:{maxWidth:'100%'},text:{flexShrink:1,gap:4},title:{fontSize:16,fontWeight:'500'}});
