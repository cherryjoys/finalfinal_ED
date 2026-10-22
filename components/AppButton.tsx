import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { COLORS } from '@/constants/colors';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  variant?: ButtonVariant;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export default function AppButton({
  title,
  icon,
  theme,
  variant,
  onPress,
  loading = false,
  disabled = false,
  compact = false,
  style,
  accessibilityHint,
}: Props) {
  const buttonVariant = variant ?? (theme === 'primary' ? 'primary' : 'secondary');
  const isDisabled = disabled || loading;
  const isPrimary = buttonVariant === 'primary';

  return (
    <View style={[styles.buttonOuter, compact && styles.compactOuter, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.buttonInner,
          compact && styles.compactInner,
          buttonVariant === 'primary' && styles.primaryFill,
          buttonVariant === 'secondary' && styles.secondaryFill,
          buttonVariant === 'ghost' && styles.ghostFill,
          buttonVariant === 'danger' && styles.dangerFill,
          pressed && !isDisabled && styles.pressed,
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={isPrimary ? COLORS.textOnPrimary : COLORS.primary}
            style={styles.loadingIndicator}
          />
        ) : (
          <Ionicons
            name={icon}
            size={compact ? 18 : 20}
            color={
              isPrimary
                ? COLORS.textOnPrimary
                : buttonVariant === 'danger'
                  ? COLORS.danger
                  : COLORS.primary
            }
            style={styles.icon}
          />
        )}
        <Text
          style={[
            styles.label,
            compact && styles.compactLabel,
            isPrimary ? styles.primaryLabel : styles.secondaryLabel,
            buttonVariant === 'danger' && styles.dangerLabel,
          ]}
        >
          {title}
        </Text>

        {isPrimary && <View style={styles.primaryGlow} pointerEvents="none" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonOuter: {
    width: '100%',
    marginBottom: 12,
  },
  compactOuter: {
    width: 'auto',
    alignSelf: 'flex-start',
    marginBottom: 0,
  },
  buttonInner: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  compactInner: {
    minHeight: 44,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryFill: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 3,
  },
  secondaryFill: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  ghostFill: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dangerFill: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: 'rgba(239, 68, 68, 0.16)',
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 0,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.992 }],
  },
  disabled: {
    opacity: 0.6,
  },
  icon: {
    paddingRight: 8,
  },
  loadingIndicator: {
    marginRight: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  compactLabel: {
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  primaryLabel: {
    color: COLORS.textOnPrimary,
  },
  secondaryLabel: {
    color: COLORS.primary,
  },
  dangerLabel: {
    color: COLORS.danger,
  },
  primaryGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    height: 40,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
