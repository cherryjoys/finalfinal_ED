import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppButton from '@/components/AppButton';
import GradientScreen from '@/components/GradientScreen';
import Header from '@/components/Header';
import { COLORS, TINTS } from '@/constants/colors';
import {
  HIT,
  PRESSED,
  RADIUS,
  SHADOWS,
  SPACING,
  TEXT,
} from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

const GLASS = 'rgba(255, 255, 255, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.38)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.65)';
const ON_GRADIENT = 'rgba(255, 255, 255, 0.82)';

function ProfileScreenInner() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const p = await getProfile(user.id);
    setProfile(p);
    setDraftName(p?.full_name ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: draftName.trim(),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) =>
        prev ? { ...prev, full_name: draftName.trim() } : prev
      );
      setEditing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const role = profile?.role ?? 'student';
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const roleLabel = isAdmin ? 'Administrator' : isTeacher ? 'Teacher' : 'Student';
  const roleIcon = isAdmin
    ? 'shield-checkmark'
    : isTeacher
      ? 'school'
      : 'school-outline';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerContainer}>
          <Header title="QR Attendance" icon="person" />
        </View>

        <View style={styles.bodyContainer}>
          <Text style={styles.title}>My Profile</Text>

          <View
            style={[
              styles.roleBadge,
              isAdmin
                ? styles.roleBadgeAdmin
                : isTeacher
                  ? styles.roleBadgeTeacher
                  : styles.roleBadgeStudent,
            ]}
          >
            <Ionicons
              name={roleIcon}
              size={15}
              color={isAdmin || isTeacher ? TINTS.white : COLORS.primary}
            />
            <Text
              style={[
                styles.roleBadgeText,
                (isAdmin || isTeacher) && styles.roleBadgeTextOnDark,
              ]}
            >
              {roleLabel}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Full Name</Text>
              {editing ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!saving}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && PRESSED,
                    ]}
                    onPress={handleSaveName}
                    disabled={saving}
                  >
                    <Text style={styles.saveButtonText}>
                      {saving ? 'Saving...' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setEditing(true)}
                  style={({ pressed }) => [styles.nameRow, pressed && PRESSED]}
                >
                  <Text style={styles.value}>
                    {profile?.full_name || 'Tap to add your name'}
                  </Text>
                  <View style={styles.editPill}>
                    <Ionicons
                      name="pencil"
                      size={13}
                      color={COLORS.primary}
                    />
                    <Text style={styles.editHint}>Edit</Text>
                  </View>
                </Pressable>
              )}
            </View>

            <View style={styles.separator} />

            <View style={[styles.row, styles.rowLine]}>
              <View style={styles.rowIcon}>
                <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{user?.email ?? 'Unknown'}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={[styles.row, styles.rowLine]}>
              <View style={styles.rowIcon}>
                <Ionicons name="finger-print-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.label}>User ID</Text>
                <Text style={styles.idText} numberOfLines={1}>
                  {user?.id ?? 'Unknown'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footerContainer}>
          <AppButton
            theme="primary"
            title="Sign Out"
            icon="log-out-outline"
            onPress={handleSignOut}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  bodyContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  title: {
    ...TEXT.display,
    color: '#FFFFFF',
    marginBottom: SPACING.md,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.badge,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  roleBadgeTeacher: {
    backgroundColor: COLORS.primaryInk,
  },
  roleBadgeAdmin: {
    backgroundColor: COLORS.textPrimary,
  },
  roleBadgeStudent: {
    backgroundColor: TINTS.wash,
  },
  roleBadgeText: {
    ...TEXT.badge,
    color: COLORS.textPrimary,
    marginLeft: 5,
  },
  roleBadgeTextOnDark: {
    color: TINTS.white,
  },
  card: {
    width: '100%',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  row: {
    width: '100%',
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  rowText: {
    flex: 1,
  },
  label: {
    ...TEXT.label,
    marginBottom: 2,
  },
  value: {
    ...TEXT.body,
    fontWeight: '700',
    flex: 1,
  },
  idText: {
    ...TEXT.meta,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: HIT.min,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.badge,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  editHint: {
    ...TEXT.badge,
    color: COLORS.primaryInk,
    marginLeft: 4,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  nameInput: {
    flex: 1,
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: HIT.min,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  saveButton: {
    backgroundColor: COLORS.primaryInk,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    minHeight: HIT.min,
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  saveButtonText: {
    ...TEXT.chip,
    color: COLORS.textOnPrimary,
  },
  separator: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  footerContainer: {
    width: '100%',
  },
});

export default function ProfileScreen() {
  return (
    <GradientScreen>
      <ProfileScreenInner />
    </GradientScreen>
  );
}
