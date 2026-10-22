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
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await signIn(email.trim(), password);

      if (authError) {
        setError(authError.message);
      } else {
        router.replace('/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
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
          <Header title="Welcome back" centered />

          <View style={styles.formCard}>
            <Text style={styles.label}>Email</Text>
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

            <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
            <View style={styles.inputShell}>
              <Ionicons name={APP_ICONS.lock} size={20} color={COLORS.textSecondary} />
              <TextInput
                accessibilityLabel="Password"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
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

            <View style={styles.forgotRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/forgot-password')}
                disabled={loading}
                hitSlop={6}
                style={styles.forgotBtn}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
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
              title="Sign in"
              icon="log-in-outline"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.submitButton}
              accessibilityHint="Sign in to your QR Attendance account"
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Need an account?</Text>
            <Link href="/register" style={styles.link}>
              <Ionicons
                name="arrow-forward"
                size={14}
                color={COLORS.primary}
                style={styles.linkIcon}
              />
              <Text style={styles.linkText}>Create an account</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  passwordLabel: {
    marginTop: 18,
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
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  forgotBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  submitButton: {
    marginTop: 18,
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
});
