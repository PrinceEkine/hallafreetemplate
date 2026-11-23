import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { fonts, radius, type ThemeColors } from '../constants/theme';
import {
  getCommunityModules,
  getOrderedCommunities,
  type OrderedCommunity,
} from '../lib/communities';
import { unreadCommunityIds } from '../lib/chat';
import { exitCommunity, isCommunityAdmin } from '../lib/communityContent';
import {
  COMMUNITY_MODULES,
  DEFAULT_MODULE_SETTINGS,
  type CommunityModuleId,
  type ModuleSettings,
} from '../lib/communityModules';
import {
  getSelectedCommunityId,
  resolveSelectedCommunityId,
  setSelectedCommunityId,
  useSelectedCommunityId,
} from '../lib/selectedCommunity';
import { signOutAndClear } from '../lib/session';
import { useColors } from '../lib/theme';

const PANEL_WIDTH = 340;
const RAIL_WIDTH = 96;

type StaticPath =
  | '/community/new'
  | '/community/join'
  | '/profile'
  | '/forms'
  | '/wallet'
  | '/teams';

export function DrawerMenu({
  visible,
  onClose,
  communityId = null,
}: {
  visible: boolean;
  onClose: () => void;
  communityId?: string | null;
}) {
  const [communities, setCommunities] = useState<OrderedCommunity[]>([]);
  const [modules, setModules] = useState<ModuleSettings>({
    ...DEFAULT_MODULE_SETTINGS,
  });
  // Module rows render only after the real settings load: the all-on
  // default would otherwise flash disabled rows (PAY) on every open.
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [admin, setAdmin] = useState(false);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(PANEL_WIDTH, width * 0.88);
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const storedId = useSelectedCommunityId();
  // Never fall back to another community here: exiting must hit exactly
  // the community the drawer was opened for, or the stored selection.
  const activeId = communityId ?? storedId;
  const activeCommunity = communities.find((c) => c.id === activeId);
  const activeName = activeCommunity?.name ?? 'Community';
  const activeLogo = activeCommunity?.logoUrl ?? null;
  const enabled = modulesLoaded
    ? COMMUNITY_MODULES.filter((m) => modules[m.id])
    : [];
  const needle = query.trim().toLowerCase();
  const filtered = communities.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle),
  );

  useEffect(() => {
    if (!visible) {
      slide.setValue(-panelWidth);
      setQuery('');
      return;
    }
    (async () => {
      const ordered = await getOrderedCommunities().catch(() => ({
        visible: [],
        archived: [],
      }));
      setCommunities(ordered.visible);
      setUnread(await unreadCommunityIds().catch(() => new Set<string>()));
      const stored = await resolveSelectedCommunityId().catch(() => null);
      const target =
        communityId ?? stored ?? ordered.visible[0]?.id ?? null;
      setModulesLoaded(false);
      setAdmin(
        target ? await isCommunityAdmin(target).catch(() => false) : false,
      );
      if (target) {
        try {
          setModules(await getCommunityModules(target));
        } catch {
          setModules({ ...DEFAULT_MODULE_SETTINGS });
        }
      } else {
        setModules({ ...DEFAULT_MODULE_SETTINGS });
      }
      setModulesLoaded(true);
    })();
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, communityId, slide, panelWidth]);

  function go(path: StaticPath) {
    onClose();
    router.push(path);
  }

  function openModule(id: CommunityModuleId) {
    onClose();
    if (id === 'forms') {
      router.push('/forms');
      return;
    }
    if (id === 'pay') {
      router.push('/wallet');
      return;
    }
    if (!activeId) {
      router.push('/teams');
      return;
    }
    const params = { id: activeId };
    switch (id) {
      case 'directory':
        router.push({ pathname: '/community/directory', params });
        break;
      case 'actions':
        router.push({ pathname: '/community/actions', params });
        break;
      case 'task':
        router.push({ pathname: '/community/task', params });
        break;
      case 'media':
        router.push({ pathname: '/community/media', params });
        break;
      case 'files':
        router.push({ pathname: '/community/files', params });
        break;
      case 'approval':
        router.push({ pathname: '/community/approval', params });
        break;
      case 'polls':
        router.push({ pathname: '/community/polls', params });
        break;
      case 'project':
        router.push({ pathname: '/community/project', params });
        break;
      case 'contact':
        router.push({ pathname: '/community/contact', params });
        break;
      default:
        router.push({ pathname: '/community/[id]', params });
        break;
    }
  }

  function switchCommunity(nextId: string) {
    setSelectedCommunityId(nextId);
    onClose();
    router.replace('/feed');
  }

  async function handleSignOut() {
    onClose();
    await signOutAndClear();
    router.replace('/');
  }

  function handleExit() {
    if (!activeId) {
      onClose();
      return;
    }
    const name = activeName;
    const target = activeId;
    Alert.alert(
      `Exit ${name}?`,
      'You can rejoin later with an invite. If you are the last member, the community is scheduled for deletion in 24 hours instead. If you own it, ownership moves to another admin first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              const action = await exitCommunity(target);
              if (getSelectedCommunityId() === target) {
                setSelectedCommunityId(null);
              }
              onClose();
              if (action === 'scheduled') {
                Alert.alert(
                  'Left community',
                  `You were the last member, so ${name} will be permanently deleted in 24 hours unless someone rejoins.`,
                );
              } else if (action === 'deleted') {
                Alert.alert(
                  'Community deleted',
                  `${name} and everything in it is gone.`,
                );
              } else if (action === 'transferred') {
                Alert.alert(
                  'Ownership transferred',
                  `Ownership of ${name} moved to another admin.`,
                );
              }
              router.replace('/teams');
            } catch (err) {
              Alert.alert(
                'Could not exit',
                err instanceof Error ? err.message : 'Try again.',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, transform: [{ translateX: slide }] },
          ]}
        >
          <SafeAreaView edges={[]} style={styles.safe}>
            <View style={styles.columns}>
              <View
                style={[
                  styles.main,
                  { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
              >
                <View style={styles.mainHead}>
                  <Pressable
                    style={styles.mainTitleWrap}
                    onPress={() => {
                      if (!activeId) return;
                      onClose();
                      router.push({
                        pathname: '/community/[id]',
                        params: { id: activeId },
                      });
                    }}
                    hitSlop={8}
                  >
                    {activeLogo ? (
                      <Image
                        source={{ uri: activeLogo }}
                        style={styles.mainLogo}
                      />
                    ) : (
                      <View style={[styles.mainLogo, styles.mainLogoFallback]}>
                        <Text style={styles.mainLogoLetter}>
                          {activeName.trim().slice(0, 1).toUpperCase() || '•'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.mainTitle} numberOfLines={1}>
                      {activeName.toUpperCase()}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.searchBox}>
                  <Ionicons
                    name="search"
                    size={16}
                    color={c.subtext}
                  />
                  <TextInput
                    placeholder="Search communities"
                    placeholderTextColor={c.subtext}
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                  />
                </View>
                <ScrollView
                  contentContainerStyle={styles.mainScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {enabled.map((mod) => (
                    <Pressable
                      key={mod.id}
                      style={styles.menuRow}
                      onPress={() => openModule(mod.id)}
                    >
                      <Ionicons
                        name={mod.icon}
                        size={20}
                        color={c.ink}
                        style={styles.menuIcon}
                      />
                      <Text style={styles.menuLabel}>
                        {mod.id === 'approval' && !admin
                          ? 'REQUESTS'
                          : mod.label}
                      </Text>
                    </Pressable>
                  ))}
                  <View style={styles.divider} />
                  <Pressable
                    style={styles.menuRow}
                    onPress={() => go('/community/join')}
                  >
                    <Ionicons
                      name="key-outline"
                      size={20}
                      color={c.ink}
                      style={styles.menuIcon}
                    />
                    <Text style={styles.menuLabel}>JOIN A COMMUNITY</Text>
                  </Pressable>
                  <Pressable
                    style={styles.menuRow}
                    onPress={() => go('/profile')}
                  >
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={c.ink}
                      style={styles.menuIcon}
                    />
                    <Text style={styles.menuLabel}>MY ACCOUNT</Text>
                  </Pressable>
                  <Pressable style={styles.menuRow} onPress={handleSignOut}>
                    <Ionicons
                      name="log-out-outline"
                      size={20}
                      color={c.ink}
                      style={styles.menuIcon}
                    />
                    <Text style={styles.menuLabel}>SIGN OUT</Text>
                  </Pressable>
                </ScrollView>
                {activeId ? (
                  <Pressable style={styles.exitRow} onPress={handleExit}>
                    <Ionicons
                      name="exit-outline"
                      size={20}
                      color={c.ink}
                    />
                    <Text style={styles.exitText}>Exit Community</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.rail}>
                <ScrollView
                  contentContainerStyle={[
                    styles.railScroll,
                    {
                      paddingTop: 16 + insets.top,
                      paddingBottom: 16 + insets.bottom,
                    },
                  ]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {filtered.map((community) => {
                    const active = community.id === activeId;
                    return (
                      <Pressable
                        key={community.id}
                        style={styles.railItem}
                        onPress={() => switchCommunity(community.id)}
                      >
                        <View style={styles.railAvatarWrap}>
                          {community.logoUrl ? (
                            <Image
                              source={{ uri: community.logoUrl }}
                              style={[
                                styles.railPhoto,
                                active && styles.railAvatarActive,
                              ]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.railAvatar,
                                active && styles.railAvatarActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.railLetter,
                                  active && styles.railLetterActive,
                                ]}
                              >
                                {community.name.trim().slice(0, 1).toUpperCase() || '•'}
                              </Text>
                            </View>
                          )}
                          {community.pinned && (
                            <View style={styles.pinBadge}>
                              <Ionicons
                                name="pin"
                                size={12}
                                color={c.paper}
                              />
                            </View>
                          )}
                          {unread.has(community.id) && (
                            <View style={styles.unreadDot} />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.railName,
                            active && styles.railNameActive,
                          ]}
                          numberOfLines={2}
                        >
                          {community.name.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {filtered.length === 0 && (
                    <Text style={styles.railEmpty}>No match</Text>
                  )}
                  <Pressable
                    style={styles.railItem}
                    onPress={() => go('/community/new')}
                  >
                    <View style={styles.railCreate}>
                      <Ionicons name="add" size={24} color={c.paper} />
                    </View>
                    <Text style={styles.railName}>CREATE NEW</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    panel: {
      backgroundColor: c.paper,
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
    },
    safe: { flex: 1 },
    // Row-reverse keeps the community rail on the left edge (main is first in JSX).
    columns: { flex: 1, flexDirection: 'row-reverse' },
    rail: {
      width: RAIL_WIDTH,
      backgroundColor: c.bg,
      borderRightWidth: 1,
      borderRightColor: c.border,
    },
    railScroll: { paddingVertical: 16, paddingHorizontal: 6 },
    railItem: { alignItems: 'center', marginBottom: 16 },
    railAvatarWrap: { alignItems: 'center', justifyContent: 'center' },
    railAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    // The selected community stands out: a touch bigger with a ring.
    railAvatarActive: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderColor: c.ink,
      backgroundColor: c.paper,
    },
    railPhoto: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    pinBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadDot: {
      position: 'absolute',
      top: 2,
      left: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: c.danger,
      borderWidth: 2,
      borderColor: c.paper,
    },
    railLetter: { fontSize: 20, fontWeight: '800', color: c.ink },
    railLetterActive: { fontSize: 22 },
    railName: {
      fontSize: 10,
      fontWeight: '700',
      color: c.subtext,
      textAlign: 'center',
      marginTop: 6,
    },
    railNameActive: { color: c.ink },
    railEmpty: {
      fontSize: 11,
      color: c.subtext,
      textAlign: 'center',
      marginBottom: 16,
    },
    railCreate: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    main: { flex: 1 },
    mainHead: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 8,
    },
    mainTitle: {
      fontFamily: fonts.heading,
      fontSize: 16,
      color: c.ink,
      flex: 1,
    },
    mainTitleWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    mainLogo: { width: 36, height: 36, borderRadius: 18 },
    mainLogoFallback: {
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mainLogoLetter: { fontSize: 16, fontWeight: '800', color: c.paper },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 12,
      marginTop: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      backgroundColor: c.paper,
    },
    searchInput: { flex: 1, height: 38, fontSize: 14, color: c.text },
    mainScroll: { padding: 12 },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    menuIcon: { marginRight: 12 },
    menuLabel: { fontSize: 14, fontWeight: '700', color: c.text },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 12 },
    exitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    exitText: { fontSize: 14, fontWeight: '700', color: c.text },
  });
}
