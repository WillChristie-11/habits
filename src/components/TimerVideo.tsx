import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import type { TimerKind } from '../lib/timers';

/** Outside the component: the player is a native object we steer, not React state. */
function setRate(p: VideoPlayer, rate: number) {
  p.playbackRate = rate;
}

const SOURCES: Record<TimerKind, number> = {
  focus: require('../../assets/video/focus-clock.mp4'),
  meditate: require('../../assets/video/meditate-red-flowers.mp4'),
};

/**
 * A timer's looping clip (muted, no controls, cover). Plays only while `mode` is 'play', the app is
 * in the foreground and Reduce Motion is off; otherwise it shows a still frame. 'slowStop' eases
 * the playback rate down before pausing (the end of a session).
 */
export function TimerVideo({
  kind,
  mode,
  style,
}: {
  kind: TimerKind;
  mode: 'play' | 'pause' | 'slowStop';
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const player = useVideoPlayer(SOURCES[kind], (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (mode === 'slowStop') {
      if (reduceMotion || !active) {
        player.pause();
        return;
      }
      const steps = [0.6, 0.35, 0.15];
      const timers = steps.map((rate, i) => setTimeout(() => setRate(player, rate), i * 350));
      const stop = setTimeout(() => {
        player.pause();
        setRate(player, 1);
      }, steps.length * 350);
      return () => {
        timers.forEach(clearTimeout);
        clearTimeout(stop);
      };
    }
    if (mode === 'play' && active && !reduceMotion) {
      setRate(player, 1);
      player.play();
    } else player.pause();
  }, [mode, active, reduceMotion, player]);

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, style]}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}
