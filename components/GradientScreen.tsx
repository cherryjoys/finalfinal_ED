import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const STOPS = [
  { offset: '0%', color: '#6F9DB8' },
  { offset: '38%', color: '#8CA9CC' },
  { offset: '72%', color: '#C5CFE2' },
  { offset: '100%', color: '#EDEFF5' },
];

/**
 * The shared app background. Drawn with react-native-svg rather than
 * expo-linear-gradient so it works in development builds that were compiled
 * before the gradient module was added.
 */
export default function GradientScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <Defs>
          <LinearGradient id="app-background" x1="0" y1="0" x2="0" y2="1">
            {STOPS.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#app-background)" />
      </Svg>
      <View style={[styles.content, { paddingTop: insets.top }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDEFF5',
  },
  content: {
    flex: 1,
  },
});
