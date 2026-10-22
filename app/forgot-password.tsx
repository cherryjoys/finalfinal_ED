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
import { APP_ICONS } from '@/constants/icons';
import { sendPasswordReset, signOut, updatePassword, verifyRecoveryOtp } from '@/lib/auth';

type Step = 'password' | 'code';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSaveChanges = async () => {
    if (loading) return;
    setError(null);

    if (!email.trim()) {
      setError('Please enter the email address on your account.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await sendPasswordReset(email);
      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }
      setStep('code');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndUpdate = async () => {
    if (loading) return;
    setError(null);

    if (!code.trim()) {
      setError('Please enter the verification code sent to your email.');
      return;
    }

    setLoading(true);

    try {
      const { error: verifyError } = await verifyRecoveryOtp(email, code);
      if (verifyError) {
        setError(verifyError.message);
        setLoading(false);
        return;
      }

      const { error: updateError } = await updatePassword(newPassword);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      await signOut();
      router.replace('/login');
    } catch {
      setError('Something went wrong. Try again.');
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
          <Header title="Forgot password" centered />

          <View style={styles.formCard}>
            {step === 'password' && (
              <>
                <Text style={styles.desc}>Create your new password</Text>

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
                    editable={!loading}
                  />
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>New password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name={APP_ICONS.lock} size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="New password"
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showNewPassword}
                    editable={!loading}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowNewPassword((c) => !c)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                <Text style={[styles.label, styles.spacedLabel]}>Confirm new password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Confirm new password"
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showConfirmPassword}
                    editable={!loading}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowConfirmPassword((c) => !c)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                {error ? (
                  <View accessibilityRole="alert" style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <AppButton
                  theme="primary"
                  title="Save changes"
                  icon="arrow-forward"
                  onPress={handleSaveChanges}
                  loading={loading}
                  disabled={loading}
                  style={styles.submitButton}
                />
              </>
            )}

            {step === 'code' && (
              <>
                <Text style={styles.desc}>Enter the verification code sent to your email.</Text>

                <Text style={[styles.label, styles.spacedLabel]}>Verification code</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="key-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    accessibilityLabel="Verification code"
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder="Enter verification code"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>

                {error ? (
                  <View accessibilityRole="alert" style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <AppButton
                  theme="primary"
                  title="Verify & Update Password"
                  icon="shield-checkmark-outline"
                  onPress={handleVerifyAndUpdate}
                  loading={loading}
                  disabled={loading}
                  style={styles.submitButton}
                />

                <Pressable
                  onPress={() => {
                    setStep('password');
                    setCode('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={styles.resendRow}
                >
                  <Text style={styles.resendText}>Back</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Link href="/login" style={styles.link}>
              <Ionicons name="arrow-back" size={14} color={COLORS.primary} style={styles.linkIcon} />
              <Text style={styles.linkText}>Back to login</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 14, paddingBottom: 36 },
  formCard: { backgroundColor: COLORS.card, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, padding: 20, marginTop: 18 },
  desc: { fontSize: 14, lineHeight: 20, color: COLORS.textSecondary },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  spacedLabel: { marginTop: 18 },
  inputShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, paddingLeft: 15, paddingRight: 4 },
  input: { flex: 1, minHeight: 52, paddingHorizontal: 12, fontSize: 16, color: COLORS.textPrimary },
  passwordToggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.dangerSoft, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 18 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, color: COLORS.danger, marginLeft: 9 },
  submitButton: { marginTop: 22 },
  resendRow: { alignItems: 'center', marginTop: 16 },
  resendText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  link: { flexDirection: 'row', alignItems: 'center' },
  linkIcon: { marginRight: 6 },
  linkText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
});
