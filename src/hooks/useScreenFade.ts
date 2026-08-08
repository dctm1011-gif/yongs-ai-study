import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function useScreenFade(duration = 280) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  return { opacity, translateY };
}

export function useStaggerFade(count: number, baseDelay = 60) {
  const values = useRef(
    Array.from({ length: count }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(
      baseDelay,
      values.map(v =>
        Animated.parallel([
          Animated.timing(v.opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.spring(v.translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  return values;
}
