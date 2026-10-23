import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppButton from '@/components/AppButton';
import { COLORS, STATUS, TINTS } from '@/constants/colors';
import { RADIUS, SHADOWS, SPACING, TEXT } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/attendance';
import { useRole } from '@/lib/useRole';

export default function ScanScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const frameSize = Math.min(windowWidth - 120, 280);
  const frameStyle = { width: frameSize, height: frameSize };

  if (roleLoading) {
    return <View style={styles.container} />;
  }

  if (role !== 'student') {
    return (
      <View style={styles.container}>
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons name="lock-closed-outline" size={44} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Students Only</Text>
          <Text style={styles.subtitle}>
            Only student accounts can scan QR codes.
          </Text>
        </View>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons name="camera-outline" size={44} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Camera Permission Needed</Text>
          <Text style={styles.subtitle}>
            We need access to your camera to scan QR codes.
          </Text>
          <AppButton
            theme="primary"
            title="Grant Permission"
            icon="camera"
            onPress={requestPermission}
          />
        </View>
      </View>
    );
  }

const handleBarcodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    setLastData(data);
    const studentId = user?.id ?? 'unknown';
    registerAttendance(data, studentId).then((result) => {
      setMessage(result.message);
      setSuccess(result.success);
    });
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setMessage(null);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <View style={styles.scrim} pointerEvents="none">
        <View style={styles.stage}>
          <View style={frameStyle}>
            <View style={styles.frameHole} />
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          <View style={styles.hintPill}>
            <Text style={styles.overlayText}>
              {scanned ? 'QR Code detected!' : 'Point your camera at a QR code'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.overlay}>
        <View style={styles.sheetHandle} />

        {scanned && message && (
          <View
            style={[
              styles.resultBadge,
              success ? styles.resultBadgeSuccess : styles.resultBadgeError,
            ]}
          >
            <Ionicons
              name={success ? 'checkmark-circle' : 'alert-circle'}
              size={40}
              color={success ? STATUS.present.fg : STATUS.absent.fg}
            />
            <Text
              style={[
                styles.scanResult,
                success ? styles.success : styles.error,
              ]}
            >
              {message}
            </Text>
          </View>
        )}

        {scanned && lastData && <Text style={styles.scanData}>{lastData}</Text>}

        {scanned && (
          <AppButton
            theme="primary"
            title="Scan Again"
            icon="refresh"
            onPress={handleScanAgain}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TINTS.inkScrim,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 210,
  },
  frameHole: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 56,
    borderColor: 'transparent',
    borderRadius: RADIUS.tile,
  },
  corner: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderColor: COLORS.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 6,
    borderLeftWidth: 6,
    borderTopLeftRadius: RADIUS.tile,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderTopRightRadius: RADIUS.tile,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderBottomLeftRadius: RADIUS.tile,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 6,
    borderRightWidth: 6,
    borderBottomRightRadius: RADIUS.tile,
  },
  hintPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(5, 5, 5, 0.72)',
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xl,
  },
  overlayText: {
    ...TEXT.chip,
    color: TINTS.white,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: TINTS.white,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    minHeight: 96,
    alignItems: 'center',
    ...SHADOWS.sheet,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: RADIUS.tile,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  resultBadgeSuccess: {
    backgroundColor: STATUS.present.bg,
  },
  resultBadgeError: {
    backgroundColor: STATUS.absent.bg,
  },
  scanResult: {
    ...TEXT.cardTitle,
    flex: 1,
    marginLeft: SPACING.sm,
  },
  success: {
    color: STATUS.present.fg,
  },
  error: {
    color: STATUS.absent.fg,
  },
  scanData: {
    ...TEXT.hint,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TEXT.title,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TEXT.meta,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: SPACING.lg,
  },
  stateCard: {
    alignSelf: 'stretch',
    marginHorizontal: SPACING.lg,
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  stateIcon: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
});