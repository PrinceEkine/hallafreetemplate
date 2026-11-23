import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors, useTheme } from '../../lib/theme';
import {
  BUILTIN_WALLPAPERS,
  builtinSource,
  defaultWallpaperColor,
  getWallpaper,
  persistWallpaperPhoto,
  setWallpaper,
  WALLPAPER_COLORS,
  type Wallpaper,
} from '../../lib/wallpaper';
import { ensureMediaLibrary } from '../../lib/permissions';

export default function ChatWallpaper() {
  const c = useColors();
  const { dark } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [current, setCurrent] = useState<Wallpaper>({ type: 'default' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWallpaper().then(setCurrent).catch(() => {});
  }, []);

  async function choose(next: Wallpaper) {
    setError(null);
    setBusy(true);
    try {
      await setWallpaper(next);
      setCurrent(next);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto() {
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to use your photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setError(null);
    setBusy(true);
    try {
      const next = await persistWallpaperPhoto(res.assets[0].uri);
      await setWallpaper(next);
      setCurrent(next);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="CHAT WALLPAPER" />
      <ScrollView style={styles.page} contentContainerStyle={styles.body}>
        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.section}>APP DEFAULT</Text>
        <Pressable
          style={styles.tile}
          onPress={() => choose({ type: 'default' })}
          disabled={busy}
        >
          <View
            style={[
              styles.tileImage,
              { backgroundColor: defaultWallpaperColor(dark) },
            ]}
          >
            {current.type === 'default' && (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={18} color={c.paper} />
              </View>
            )}
          </View>
          <Text style={styles.tileLabel}>Default white</Text>
        </Pressable>
        <Text style={styles.section}>PATTERNS</Text>
        {BUILTIN_WALLPAPERS.map((pattern) => {
          const src = builtinSource(pattern.id);
          if (!src) return null;
          const active =
            current.type === 'builtin' && current.id === pattern.id;
          return (
            <Pressable
              key={pattern.id}
              style={styles.tile}
              onPress={() => choose({ type: 'builtin', id: pattern.id })}
              disabled={busy}
            >
              <ImageBackground
                source={src}
                style={styles.tileImage}
                resizeMode="repeat"
              >
                {active && (
                  <View style={styles.check}>
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={c.paper}
                    />
                  </View>
                )}
              </ImageBackground>
              <Text style={styles.tileLabel}>{pattern.label}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.section}>SOLID COLORS</Text>
        <View style={styles.swatches}>
          {WALLPAPER_COLORS.map((color) => {
            const active =
              current.type === 'color' && current.value === color;
            return (
              <Pressable
                key={color}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  active && styles.swatchActive,
                ]}
                onPress={() => choose({ type: 'color', value: color })}
                disabled={busy}
                accessibilityLabel={`Wallpaper color ${color}`}
              >
                {active && (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={color === '#0E0E10' ? c.paper : c.ink}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.section}>YOUR PHOTO</Text>
        {current.type === 'image' && (
          <Image source={{ uri: current.uri }} style={styles.currentPhoto} />
        )}
        <Pressable
          style={styles.menuBtn}
          onPress={choosePhoto}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={c.paper} />
          ) : (
            <Text style={styles.menuBtnText}>Choose from gallery</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          Wallpapers live only on this device and apply to every chat.
        </Text>
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  body: { padding: 16, gap: 12 },
  errorBar: {
    backgroundColor: '#FDECEC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.m,
  },
  errorText: { fontSize: 13, color: c.danger, textAlign: 'center' },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
    marginTop: 8,
  },
  tile: { gap: 8 },
  tileImage: {
    height: 112,
    borderRadius: radius.m,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  check: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 14, fontWeight: '700', color: c.text },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 3, borderColor: c.ink },
  currentPhoto: {
    height: 112,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: c.border,
  },
  menuBtn: {
    backgroundColor: c.ink,
    borderRadius: radius.m,
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuBtnText: { fontSize: 15, fontWeight: '800', color: c.paper },
  hint: { fontSize: 13, color: c.subtext, textAlign: 'center' },
});
}
