import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts } from '../constants/theme';

// Fixed black header by design: it does not follow the theme.
import { listMyCommunities } from '../lib/communities';
import { useSelectedCommunityId } from '../lib/selectedCommunity';
import { getMyAvatarUrl } from '../lib/uploads';
import { DrawerMenu } from './DrawerMenu';
import { NotificationBell } from './ui';

export function AppHeader({ title }: { title: string }) {
  const [drawer, setDrawer] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const selectedId = useSelectedCommunityId();
  useFocusEffect(
    useCallback(() => {
      getMyAvatarUrl().then(setAvatarUrl).catch(() => {});
      if (!selectedId) {
        setCompanyName(null);
        setCompanyLogo(null);
        return;
      }
      listMyCommunities()
        .then((list) => {
          const found = list.find((c) => c.id === selectedId);
          setCompanyName(found?.name ?? null);
          setCompanyLogo(found?.logoUrl ?? null);
        })
        .catch(() => {});
    }, [selectedId]),
  );

  function openAvatar() {
    if (selectedId) {
      router.push({ pathname: '/community/[id]', params: { id: selectedId } });
    } else {
      router.push('/profile');
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.bar}>
        <Pressable onPress={() => setDrawer(true)} hitSlop={12}>
          <Ionicons name="menu" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.right}>
          <NotificationBell size={22} style={styles.bell} />
          <Pressable onPress={() => router.push('/profile')} hitSlop={12}>
            <Ionicons
              name="person-outline"
              size={22}
              color="#FFFFFF"
              style={styles.bell}
            />
          </Pressable>
          <Pressable onPress={openAvatar} hitSlop={8}>
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
              <Image source={{ uri: avatarUrl }} style={styles.avatarPhoto} />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={16} color="#000000" />
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <DrawerMenu visible={drawer} onClose={() => setDrawer(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title: {
    position: 'absolute',
    left: 60,
    right: 60,
    textAlign: 'center',
    fontFamily: fonts.heading,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  right: { flexDirection: 'row', alignItems: 'center' },
  bell: { marginRight: 12 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E2E6',
  },
  companyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  companyLetter: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
