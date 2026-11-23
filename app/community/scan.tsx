import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, ErrorText } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { parseScannedInvite } from '../../lib/invites';

export default function ScanInvite() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  function handleScan(data: string) {
    if (handled.current) return;
    const code = parseScannedInvite(data);
    if (!code) {
      setError('That code is not a community invite. Try again.');
      return;
    }
    handled.current = true;
    router.replace({ pathname: '/community/join', params: { code } });
  }

  return (
    <>
      <ScreenHeader title="SCAN INVITE" />
      <View style={styles.page}>
        {!permission ? (
          <Text style={styles.hint}>Checking camera access…</Text>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.hint}>
              Camera access scans the QR code on your admin&apos;s screen.
            </Text>
            <Button title="Allow camera" onPress={requestPermission} />
            <ErrorText message={error} />
          </View>
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(event) => handleScan(event.data)}
            />
            <Text style={styles.hint}>
              Point at the community QR code to join automatically.
            </Text>
            <ErrorText message={error} />
            <Pressable hitSlop={8} onPress={() => router.back()}>
              <Text style={styles.back}>← ENTER CODE INSTEAD</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper, padding: 16 },
  center: { flex: 1, justifyContent: 'center' },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  hint: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  back: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    textAlign: 'center',
    marginTop: 16,
  },
});
}
