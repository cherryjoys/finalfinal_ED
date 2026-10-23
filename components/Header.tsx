import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { APP_ICONS } from '@/constants/icons';

type Props = {
  title: string;
  compact?: boolean;
  centered?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

export default function Header({
  title,
  compact = false,
  centered = false,
  icon = APP_ICONS.qr,
}: Props) {
  return (
    <View
      style={[
        styles.container,
        compact && styles.compactContainer,
        centered && styles.centeredContainer,
      ]}
    >
      <View
        style={[
          styles.logoCircle,
          compact && styles.compactLogoCircle,
          centered && styles.centeredLogoCircle,
        ]}
      >
        <View style={styles.logoInnerGlow} pointerEvents="none" />
        <Ionicons
          name={icon}
          size={compact ? 24 : 30}
          color={COLORS.textOnPrimary}
        />
      </View>
      <View style={[styles.copy, centered && styles.centeredCopy]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, compact && styles.compactTitle]}
        >
          {title}
        </Text>
        <Text style={[styles.subtitle, compact && styles.compactSubtitle]}>
          QR-ATT Attendance
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  compactContainer: {
    paddingVertical: 6,
  },
  centeredContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 16,
  },
  centeredLogoCircle: {
    marginRight: 0,
    marginBottom: 12,
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  compactLogoCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    marginRight: 10,
    shadowRadius: 10,
    elevation: 3,
  },
  logoInnerGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
  },
  centeredCopy: {
    flex: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  compactTitle: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: COLORS.textSecondary,
    marginTop: 4,
    opacity: 0.9,
  },
  compactSubtitle: {
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 2,
  },
});
