export const COLORS = {
  // Brand — modern violet + sky
  primary: '#8B5CF6',
  primaryDark: '#5B21B6',
  primaryLight: '#F5F0FF',

  accent: '#38BDF8',
  accentSoft: '#F0F9FF',

  // Backgrounds
  background: '#F6F5FF',
  card: '#FFFFFF',
  surface: '#FAF8FF',

  // Text
  textPrimary: '#1F1635',
  textSecondary: '#7F7CA3',
  textOnPrimary: '#FFFFFF',
  primaryInk: '#050505',

  // Borders & shadows
  border: '#EEE7FF',
  shadow: 'rgba(91, 33, 182, 0.12)',

  // QR
  qrBackground: '#FFFFFF',
  qrForeground: '#4C1D95',

  // Attendance states
  present: '#16A34A',
  presentSoft: '#F0FDF4',
  late: '#F59E0B',
  lateSoft: '#FFF7ED',
  absent: '#EF4444',
  absentSoft: '#FEF2F2',

  // Semantic aliases
  success: '#16A34A',
  successSoft: '#F0FDF4',
  warning: '#F59E0B',
  warningSoft: '#FFF7ED',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',

  overlay: 'rgba(31, 22, 53, 0.88)',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof COLORS;

export const TINTS = {
  white: '#FFFFFF',
  wash: 'rgba(18, 20, 26, 0.06)',
  washDeep: 'rgba(18, 20, 26, 0.1)',
  inkScrim: 'rgba(5, 5, 5, 0.42)',
} as const;

export const STATUS = {
  present: { fg: COLORS.present, bg: COLORS.presentSoft },
  late: { fg: COLORS.late, bg: COLORS.lateSoft },
  absent: { fg: COLORS.absent, bg: COLORS.absentSoft },
} as const;
