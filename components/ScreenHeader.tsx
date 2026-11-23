import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, type ThemeColors } from '../constants/theme';
import { listMyCommunities } from '../lib/communities';
import { useSelectedCommunityId } from '../lib/selectedCommunity';
import { useColors } from '../lib/theme';
import { getMyAvatarUrl } from '../lib/uploads';
import { DrawerMenu } from './DrawerMenu';
import { NotificationBell } from './ui';

export function ScreenHeader({
  title,
  communityId = null,
  showMenu = false,
  backTo = null,
  action = null,
  tray = null,
  onTitlePress = null,
  headAvatarUrl = null,
  headAvatarLabel = null,
  headStatusText = null,
  headStatusOnline = false,
}: {
  title: string;
  communityId?: string | null;
  showMenu?: boolean;
  backTo?: string | null;
  action?: { label: string; onPress: () => void } | null;
  tray?: { icon: string; label: string; onPress: () => void }[] | null;
  onTitlePress?: (() => void) | null;
  /** Profile picture beside the name (chat threads); initial fallback. */
  headAvatarUrl?: string | null;
  headAvatarLabel?: string | null;
  /** Presence line under the name (online / last seen / member count). */
  headStatusText?: string | null;
  headStatusOnline?: boolean;
}) {
  const [drawer, setDrawer] = useState(false);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const storedId = useSelectedCommunityId();
  const activeId = communityId ?? storedId;
  useFocusEffect(
    useCallback(() => {
      getMyAvatarUrl().then(setAvatarUrl).catch(() => {});
      if (!activeId) {
        setCompanyName(null);
        setCompanyLogo(null);
        return;
      }
      listMyCommunities()
        .then((list) => {
          const found = list.find((c) => c.id === activeId);
          setCompanyName(found?.name ?? null);
          setCompanyLogo(found?.logoUrl ?? null);
        })
        .catch(() => {});
    }, [activeId]),
  );

  function openAvatar() {
    if (activeId) {
      router.push({ pathname: '/community/[id]', params: { id: activeId } });
    } else {
      router.push('/profile');
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.bar}>
        <View style={styles.left}>
          <Pressable
            onPress={() => {
              if (backTo) {
                router.replace(backTo as any);
              } else if (router.canGoBack()) {
                router.back();
              } else {
                // Deep link with no history: home, never a dead end.
                router.replace('/feed');
              }
            }}
            hitSlop={12}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
          {showMenu ? (
            <Pressable
              onPress={() => setDrawer(true)}
              hitSlop={12}
              style={styles.menuBtn}
            >
              <Ionicons name="menu" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
        {headAvatarUrl || headAvatarLabel ? (
          <ChatTitleCluster
            title={title}
            avatarUrl={headAvatarUrl}
            avatarLabel={headAvatarLabel ?? title}
            statusText={headStatusText}
            statusOnline={headStatusOnline}
            onPress={onTitlePress}
          />
        ) : onTitlePress ? (
          <Pressable
            style={styles.titleWrap}
            onPress={onTitlePress}
            hitSlop={12}
          >
            <Text style={styles.titleInner} numberOfLines={1}>
              {title}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}
        {showMenu ? (
          <View style={styles.right}>
            <NotificationBell size={20} style={styles.bell} />
            <Pressable onPress={() => router.push('/profile')} hitSlop={12}>
              <Ionicons
                name="person-outline"
                size={20}
                color="#FFFFFF"
                style={styles.bell}
              />
            </Pressable>
            <Pressable onPress={openAvatar} hitSlop={12}>
              {companyName ? (
                companyLogo ? (
                  <Image
                    source={{ uri: companyLogo }}
                    style={styles.avatarPhoto}
                  />
                ) : (
                  <View style={styles.companyAvatar}>
                    <Text style={styles.companyLetter}>
                      {companyName.trim().slice(0, 1).toUpperCase() || '•'}
                    </Text>
                  </View>
                )
              ) : avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarPhoto}
                />
              ) : (
                <View style={styles.avatar}>
                  <Ionicons name="person" size={14} color="#000000" />
                </View>
              )}
            </Pressable>
          </View>
        ) : tray || action ? (
          <View style={styles.tray}>
            {(tray ?? []).map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                hitSlop={12}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color="#FFFFFF"
                  style={styles.trayIcon}
                />
              </Pressable>
            ))}
            {action ? (
              <Pressable onPress={action.onPress} hitSlop={12}>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      {showMenu ? (
        <DrawerMenu
          visible={drawer}
          onClose={() => setDrawer(false)}
          communityId={communityId}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * WhatsApp-style chat heading: picture beside a full-width name, tucked
 * right behind the back chevron. Long names ellipsize instead of
 * squeezing the action icons.
 */
function ChatTitleCluster({
  title,
  avatarUrl,
  avatarLabel,
  statusText,
  statusOnline,
  onPress,
}: {
  title: string;
  avatarUrl: string | null;
  avatarLabel: string;
  statusText: string | null;
  statusOnline: boolean;
  onPress: (() => void) | null;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const letter = avatarLabel.trim().slice(0, 1).toUpperCase() || '•';
  const body = (
    <>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.headAvatar} />
      ) : (
        <View style={[styles.headAvatar, styles.headAvatarFallback]}>
          <Text style={styles.headAvatarText}>{letter}</Text>
        </View>
      )}
      <View style={styles.clusterMid}>
        <Text style={styles.clusterName} numberOfLines={1}>
          {title}
        </Text>
        {statusText ? (
          <Text
            style={[styles.clusterStatus, statusOnline && styles.clusterOnline]}
            numberOfLines={1}
          >
            {statusText}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.cluster}>{body}</View>;
  return (
    <Pressable style={styles.cluster} onPress={onPress} hitSlop={8}>
      {body}
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  safe: { backgroundColor: '#000000' },
  bar: {
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 54,
  },
  left: { flexDirection: 'row', alignItems: 'center' },
  menuBtn: { marginLeft: 12 },
  title: {
    position: 'absolute',
    left: 96,
    right: 96,
    textAlign: 'center',
    fontFamily: fonts.heading,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  titleWrap: {
    position: 'absolute',
    left: 96,
    right: 96,
  },
  titleInner: {
    textAlign: 'center',
    fontFamily: fonts.heading,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  cluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 2,
    minWidth: 0,
  },
  clusterMid: { flex: 1, flexShrink: 1 },
  clusterName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clusterStatus: { fontSize: 12, color: '#FFFFFFAA', marginTop: 1 },
  clusterOnline: { color: '#4ADE80' },
  headAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#FFFFFF55',
  },
  headAvatarFallback: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headAvatarText: { fontSize: 17, fontWeight: '800', color: '#000000' },
  right: { flexDirection: 'row', alignItems: 'center' },
  bell: { marginRight: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  companyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  companyLetter: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  spacer: { width: 26 },
  actionLabel: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  tray: { flexDirection: 'row', alignItems: 'center' },
  trayIcon: { marginLeft: 16 },
  });
}
