import type { TextStyle, ViewStyle } from 'react-native';

import { COLORS } from './colors';

export const SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
  xxxl: 48,
} as const;

export const RADIUS = {
  sheet: 28,
  card: 24,
  tile: 20,
  field: 16,
  chip: 999,
  pill: 999,
  badge: 999,
} as const;

export const HIT = {
  min: 44,
} as const;

export const PRESSED: ViewStyle = {
  opacity: 0.9,
  transform: [{ scale: 0.985 }],
};

export const SHADOWS: Record<'card' | 'sheet', ViewStyle> = {
  card: {
    shadowColor: 'rgba(18, 20, 26, 0.12)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 4,
  },
  sheet: {
    shadowColor: 'rgba(18, 20, 26, 0.18)',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },
};

export const TEXT: Record<
  | 'display'
  | 'title'
  | 'section'
  | 'cardTitle'
  | 'body'
  | 'meta'
  | 'label'
  | 'chip'
  | 'badge'
  | 'hint'
  | 'button',
  TextStyle
> = {
  display: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 36,
    color: COLORS.textPrimary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
    color: COLORS.textPrimary,
  },
  section: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 24,
    color: COLORS.textPrimary,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 21,
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
  chip: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 18,
    color: COLORS.textPrimary,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: 14,
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
  button: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
};
