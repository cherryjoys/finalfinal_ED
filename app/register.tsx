import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { APP_ICONS, type IconName } from '@/constants/icons';
import { signUp } from '@/lib/auth';

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    setError(null);

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Complete all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await signUp(email.trim(), password, {
        full_name: fullName.trim(),
        role,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        router.replace('/(tabs)');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header title="Create account" centered />

          {success ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={38} color={COLORS.present} />
              </View>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successText}>Confirmation sent to {email}.</Text>
              <Link href="/login" style={styles.successLink}>
                <Ionicons
                  name="arrow-forward"
                  size={15}
                  color={COLORS.primary}
                  style={styles.successLinkIcon}
                />
                <Text style={styles.successLinkText}>Sign in</Text>
              </Link>
            </View>
          ) : (
            <>
              <View style={styles.formCard}>
                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputShell}>
                  <Ionicons name={APP_ICONS.user} size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Full name"
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.textSecondary}
                    textContentType="name"
                    editable={!loading}
                  />
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>Email address</Text>
                <View style={styles.inputShell}>
                  <Ionicons name={APP_ICONS.mail} size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Email address"
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    editable={!loading}
                  />
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>Password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name={APP_ICONS.lock} size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Password"
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 6 characters"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showPassword}
                    textContentType="newPassword"
                    editable={!loading}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={10}
                    onPress={() => setShowPassword((current) => !current)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>Confirm password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Confirm password"
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showConfirmPassword}
                    textContentType="newPassword"
                    editable={!loading}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    hitSlop={10}
                    onPress={() => setShowConfirmPassword((current) => !current)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>Role</Text>
                <View accessibilityRole="radiogroup" style={styles.roleRow}>
                  <RoleChip
                    label="Student"
                    icon="school-outline"
                    selected={role === 'student'}
                    disabled={loading}
                    onPress={() => setRole('student')}
                  />
                  <RoleChip
                    label="Teacher"
                    icon="briefcase-outline"
                    selected={role === 'teacher'}
                    disabled={loading}
                    onPress={() => setRole('teacher')}
                  />
                </View>
                <Text style={styles.roleHint}>
                  Administrator accounts are created by an existing administrator.
                </Text>

                {error ? (
                  <View accessibilityRole="alert" style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <AppButton
                  theme="primary"
                  title="Create account"
                  icon="person-add-outline"
                  onPress={handleRegister}
                  loading={loading}
                  disabled={loading}
                  style={styles.submitButton}
                  accessibilityHint="Create your QR Attendance account"
                />
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Already registered?</Text>
                <Link href="/login" style={styles.link}>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={COLORS.primary}
                    style={styles.linkIcon}
                  />
                  <Text style={styles.linkText}>Sign in</Text>
                </Link>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type RoleChipProps = {
  label: string;
  icon: IconName;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function RoleChip({ label, icon, selected, disabled = false, onPress }: RoleChipProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.roleChip,
        selected && styles.roleChipActive,
        pressed && !disabled && styles.chipPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={19}
        color={selected ? COLORS.primary : COLORS.textSecondary}
      />
      <Text style={[styles.roleChipText, selected && styles.roleChipTextActive]}>
        {label}
      </Text>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={17}
        color={selected ? COLORS.primary : COLORS.border}
        style={styles.roleChipCheck}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 36,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginTop: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  spacedLabel: {
    marginTop: 17,
  },
  inputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 15,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 16,
    color: COLORS.textPrimary,
    includeFontPadding: false,
  },
  passwordToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleChip: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    marginRight: 6,
  },
  roleChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  roleChipCheck: {
    position: 'absolute',
    right: 10,
  },
  chipPressed: {
    opacity: 0.78,
  },
  roleChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginLeft: 7,
  },
  roleChipTextActive: {
    color: COLORS.primaryDark,
  },
  roleHint: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginTop: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 18,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.danger,
    marginLeft: 9,
  },
  submitButton: {
    marginTop: 22,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5,
  },
  linkIcon: {
    marginRight: 5,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 24,
    paddingVertical: 32,
    marginTop: 28,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: COLORS.presentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  successLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successLinkIcon: {
    marginRight: 6,
  },
  successLinkText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
