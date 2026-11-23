import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { fonts, radius, type ThemeColors } from '../constants/theme';
import { openBackgroundSettings } from '../lib/background';
import { getOrderedCommunities, type OrderedCommunity } from '../lib/communities';
import {
  chooseDocsDir,
  getAutoSaveEnabled,
  getDocsDirUri,
  setAutoSaveEnabled,
} from '../lib/deviceMedia';
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  saveNotificationPrefs,
  setCommunityPref,
  type NotificationPrefs,
} from '../lib/communityContent';
import { getCachedProfile, setCachedProfile, signOutAndClear } from '../lib/session';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { getMyAvatarUrl, uploadMyAvatar } from '../lib/uploads';
import { Button, ErrorText, Subtext } from './ui';

type Info = { name: string; email: string; phone: string };

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NOTIF_ROWS: { key: keyof NotificationPrefs; label: string; icon: IconName }[] = [
  { key: 'chat', label: 'CHAT MESSAGES', icon: 'chatbubble-ellipses-outline' },
  { key: 'announcements', label: 'ANNOUNCEMENTS', icon: 'megaphone-outline' },
  { key: 'forms', label: 'FORM UPDATES', icon: 'document-text-outline' },
  { key: 'tasks', label: 'TASK ASSIGNMENTS', icon: 'checkbox-outline' },
  { key: 'community', label: 'COMMUNITY UPDATES', icon: 'business-outline' },
];

export function ProfileScreen() {
  const [info, setInfo] = useState<Info | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [notif, setNotif] = useState<NotificationPrefs>({
    ...DEFAULT_NOTIFICATION_PREFS,
  });
  const [autoSave, setAutoSave] = useState(true);
  const [docsDir, setDocsDir] = useState(false);
  const [archived, setArchived] = useState<OrderedCommunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { colors: c, dark, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/login');
      return;
    }
    const user = session.user;
    const cached = await getCachedProfile();
    if (cached && cached.id === user.id) {
      setInfo({ name: cached.name, email: cached.email, phone: '…' });
    }
    const [{ data }, contactRes, avatar, prefs, ordered, saved, dir] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single(),
        supabase
          .from('profile_contacts')
          .select('phone')
          .eq('user_id', user.id)
          .single(),
        getMyAvatarUrl(),
        getNotificationPrefs(),
        getOrderedCommunities().catch(() => ({ visible: [], archived: [] })),
        getAutoSaveEnabled(),
        getDocsDirUri(),
      ]);
    setNotif(prefs);
    setArchived(ordered.archived);
    setAutoSave(saved);
    setDocsDir(!!dir);
    const contactRow = contactRes.data as { phone?: string | null } | null;
    const next = {
      name:
        (data?.full_name as string | null) ??
        (user.user_metadata?.full_name as string | undefined) ??
        'Staff Member',
      email: user.email ?? '',
      phone: contactRow?.phone || user.phone || 'Not added',
    };
    setInfo(next);
    setAvatarUrl(avatar);
    setCachedProfile({ id: user.id, email: next.email, name: next.name });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleAvatar() {
    if (avatarBusy) return;
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      setError('Choose a photo file.');
      return;
    }
    if (asset.size && asset.size > 8 * 1024 * 1024) {
      setError('That photo is larger than 8MB. Choose a smaller one.');
      return;
    }
    setAvatarBusy(true);
    try {
      const url = await uploadMyAvatar({
        uri: asset.uri,
        name: asset.name ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? undefined,
        size: asset.size ?? undefined,
      });
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAutoSaveToggle() {
    const next = !autoSave;
    setAutoSave(next);
    try {
      await setAutoSaveEnabled(next);
    } catch (err) {
      setAutoSave(!next);
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function handleChooseDocsDir() {
    setError(null);
    const uri = await chooseDocsDir();
    if (uri) {
      setDocsDir(true);
    } else {
      setError('Pick a folder to save documents where you can find them.');
    }
  }

  async function handlePrefToggle(key: keyof NotificationPrefs) {
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    try {
      await saveNotificationPrefs(next);
    } catch (err) {
      setNotif(notif);
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function handleUnarchive(communityId: string) {
    try {
      await setCommunityPref(communityId, { archived: false });
      setArchived((prev) => prev.filter((c) => c.id !== communityId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unarchive.');
    }
  }

  async function handleSignOut() {
    try {
      await signOutAndClear();
    } finally {
      router.replace('/');
    }
  }

  if (!info) {
    return <ActivityIndicator style={styles.loader} color={c.ink} />;
  }

  return (
    <>
      <View style={styles.headCard}>
        <Pressable
          onPress={handleAvatar}
          disabled={avatarBusy}
          hitSlop={4}
          style={styles.avatarWrap}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>
                {info.name.trim().slice(0, 1).toUpperCase() || '•'}
              </Text>
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={15} color={c.paper} />
          </View>
        </Pressable>
        <View style={styles.headMid}>
          <Text style={styles.name} numberOfLines={2}>
            {info.name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {info.email}
          </Text>
          <Pressable
            onPress={handleAvatar}
            disabled={avatarBusy}
            hitSlop={8}
            style={styles.photoActionWrap}
          >
            <Text style={styles.photoAction}>
              {avatarBusy ? 'UPLOADING…' : 'CHANGE PHOTO'}
            </Text>
          </Pressable>
        </View>
      </View>
      <ErrorText message={error} />
      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/profile/phone',
              params: { mode: 'edit' },
            })
          }
        >
          <View style={styles.iconTile}>
            <Ionicons name="call-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>PHONE NUMBER</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {info.phone}
            </Text>
          </View>
          <Text style={styles.rowAction}>EDIT</Text>
        </Pressable>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push('/profile/password')}
        >
          <View style={styles.iconTile}>
            <Ionicons name="key-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>PASSWORD</Text>
            <Text style={styles.rowValue}>••••••••</Text>
          </View>
          <Text style={styles.rowAction}>CHANGE</Text>
        </Pressable>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push('/chat/wallpaper')}
        >
          <View style={styles.iconTile}>
            <Ionicons name="image-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>CHAT WALLPAPER</Text>
            <Text style={styles.rowValue}>Background for every chat</Text>
          </View>
          <Text style={styles.rowAction}>CHOOSE</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>APPEARANCE</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconTile}>
            <Ionicons
              name={dark ? 'moon' : 'moon-outline'}
              size={19}
              color={c.ink}
            />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>DARK MODE</Text>
            <Text style={styles.rowValue}>
              {dark ? 'On — easy on the eyes' : 'Off — classic light look'}
            </Text>
          </View>
          <Switch
            value={dark}
            onValueChange={toggleTheme}
            trackColor={{ false: c.border, true: c.ink }}
            thumbColor={c.paper}
          />
        </View>
      </View>
      <Text style={styles.section}>MEDIA</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconTile}>
            <Ionicons name="images-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>AUTO-SAVE MEDIA</Text>
            <Text style={styles.rowValue}>
              Chat photos and videos keep to your Ophixe Media album. Saved
              copies leave chat encryption.
            </Text>
          </View>
          <Switch
            value={autoSave}
            onValueChange={handleAutoSaveToggle}
            trackColor={{ false: c.border, true: c.ink }}
            thumbColor={c.paper}
          />
        </View>
        {Platform.OS === 'android' ? (
          <Pressable
            style={[styles.row, styles.rowDivider]}
            onPress={handleChooseDocsDir}
          >
            <View style={styles.iconTile}>
              <Ionicons name="folder-outline" size={19} color={c.ink} />
            </View>
            <View style={styles.rowMid}>
              <Text style={styles.rowLabel}>DOCUMENTS FOLDER</Text>
              <Text style={styles.rowValue}>
                {docsDir
                  ? 'Downloads folder chosen'
                  : 'Choose where chat files land'}
              </Text>
            </View>
            <Text style={styles.rowAction}>{docsDir ? 'CHANGE' : 'CHOOSE'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.section}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        {NOTIF_ROWS.map((row, index) => (
          <View
            key={row.key}
            style={[styles.row, index > 0 && styles.rowDivider]}
          >
            <View style={styles.iconTile}>
              <Ionicons name={row.icon} size={19} color={c.ink} />
            </View>
            <Text style={styles.switchLabel}>{row.label}</Text>
            <Switch
              value={notif[row.key]}
              onValueChange={() => handlePrefToggle(row.key)}
              trackColor={{ false: c.border, true: c.ink }}
              thumbColor={c.paper}
            />
          </View>
        ))}
      </View>
      <Text style={styles.section}>BACKGROUND</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={async () => {
            if (Platform.OS !== 'android') {
              Alert.alert(
                'Background mode',
                'iPhone handles calls and messages in the background automatically. Keep notifications on for Ophixe.',
              );
              return;
            }
            const opened = await openBackgroundSettings();
            if (!opened) {
              Alert.alert(
                'Background mode',
                'Could not open system settings. Open Settings > Apps > Ophixe > Battery and set it to Unrestricted so calls and messages arrive on time.',
              );
            }
          }}
        >
          <View style={styles.iconTile}>
            <Ionicons name="play-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>RUN IN BACKGROUND</Text>
            <Text style={styles.rowValue}>
              {Platform.OS === 'android'
                ? 'Calls stay alive when minimized. Set battery to Unrestricted so they always arrive.'
                : 'Calls and messages arrive automatically on iPhone.'}
            </Text>
          </View>
          <Text style={styles.rowAction}>
            {Platform.OS === 'android' ? 'SETTINGS' : 'INFO'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.section}>LEGAL</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() => router.push('/legal/terms')}
        >
          <View style={styles.iconTile}>
            <Ionicons name="document-text-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>TERMS OF USE</Text>
            <Text style={styles.rowValue}>The rules of using Ophixe</Text>
          </View>
          <Text style={styles.rowAction}>READ</Text>
        </Pressable>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push('/legal/privacy')}
        >
          <View style={styles.iconTile}>
            <Ionicons name="shield-checkmark-outline" size={19} color={c.ink} />
          </View>
          <View style={styles.rowMid}>
            <Text style={styles.rowLabel}>PRIVACY POLICY</Text>
            <Text style={styles.rowValue}>What we collect and who sees it</Text>
          </View>
          <Text style={styles.rowAction}>READ</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>ARCHIVED COMMUNITIES</Text>
      <View style={styles.card}>
        {archived.length === 0 ? (
          <View style={styles.row}>
            <View style={styles.iconTile}>
              <Ionicons name="archive-outline" size={19} color={c.ink} />
            </View>
            <Subtext>No archived communities.</Subtext>
          </View>
        ) : (
          archived.map((community, index) => (
            <View
              key={community.id}
              style={[styles.row, index > 0 && styles.rowDivider]}
            >
              <Pressable
                style={styles.archivedName}
                onPress={() =>
                  router.push({
                    pathname: '/community/[id]',
                    params: { id: community.id },
                  })
                }
              >
                <Text style={styles.rowValue} numberOfLines={1}>
                  {community.name}
                </Text>
              </Pressable>
              <Pressable
                hitSlop={12}
                style={styles.archivedAction}
                onPress={() => handleUnarchive(community.id)}
              >
                <Text style={styles.rowAction}>UNARCHIVE</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      <Text style={styles.section}>DANGER ZONE</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() => router.push('/profile/delete')}
        >
          <View style={styles.iconTile}>
            <Ionicons name="trash-outline" size={19} color={c.danger} />
          </View>
          <View style={styles.rowMid}>
            <Text style={[styles.rowLabel, { color: c.danger }]}>
              DELETE ACCOUNT
            </Text>
            <Text style={styles.rowValue}>
              Permanently erase your account and data
            </Text>
          </View>
          <Text style={[styles.rowAction, { color: c.danger }]}>DELETE</Text>
        </Pressable>
      </View>
      <View style={styles.signOutWrap}>
        <Button title="Sign out" variant="outline" onPress={handleSignOut} />
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    headCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.l,
      padding: 16,
      gap: 16,
    },
    avatarWrap: { position: 'relative' },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarFallback: {
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 34, fontWeight: '800', color: c.paper },
    cameraBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.ink,
      borderWidth: 2,
      borderColor: c.paper,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headMid: { flex: 1, minWidth: 0 },
    name: {
      fontFamily: fonts.heading,
      fontSize: 24,
      color: c.text,
      letterSpacing: 0.3,
    },
    email: { fontSize: 14, color: c.subtext, marginTop: 2 },
    photoActionWrap: { minHeight: 44, justifyContent: 'center' },
    photoAction: {
      fontSize: 12,
      fontWeight: '800',
      color: c.primary,
      letterSpacing: 1,
    },
    card: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.l,
      paddingHorizontal: 16,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingVertical: 12,
      gap: 12,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    iconTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowMid: { flex: 1, minWidth: 0 },
    archivedName: { flex: 1, minHeight: 44, justifyContent: 'center' },
    archivedAction: { minHeight: 44, justifyContent: 'center' },
    rowLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.subtext,
      letterSpacing: 1,
    },
    rowValue: { fontSize: 16, color: c.text, marginTop: 2 },
    switchLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: c.text,
      letterSpacing: 0.8,
    },
    rowAction: { fontSize: 13, fontWeight: '800', color: c.primary },
    section: {
      fontSize: 12,
      fontWeight: '800',
      color: c.subtext,
      letterSpacing: 1.5,
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 4,
    },
    signOutWrap: { marginTop: 8, paddingBottom: 8 },
  });
}
