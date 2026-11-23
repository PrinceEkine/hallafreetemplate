import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DropdownMenu, type DropdownItem } from '../../components/DropdownMenu';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorText, Screen } from '../../components/ui';
import { fonts, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  deleteAnnouncement,
  isEdited,
  reportContent,
  REPORT_REASONS,
} from '../../lib/content';
import { isCommunityAdmin } from '../../lib/communityContent';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/uploads';

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toUpperCase();
}

type Detail = {
  id: string;
  title: string;
  body: string;
  date: string;
  time: string;
  postId: string | null;
  communityId: string;
  communityName: string;
  adminsOnly: boolean;
  edited: boolean;
  images: string[];
};

export default function AnnouncementDetail() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const demo = !isSupabaseConfigured();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Detail | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || demo) return;
    try {
      const FULL_SELECT =
        'id,title,body,post_id,created_at,updated_at,admins_only,community_id,community:communities!announcements_community_id_fkey(name)';
      const LEGACY_SELECT =
        'id,title,body,post_id,created_at,community_id,community:communities!announcements_community_id_fkey(name)';
      let res = await supabase
        .from('announcements')
        .select(FULL_SELECT)
        .eq('id', id)
        .single();
      if (res.error && /column|schema cache/i.test(String(res.error.message ?? ''))) {
        res = await supabase
          .from('announcements')
          .select(LEGACY_SELECT)
          .eq('id', id)
          .single();
      }
      if (res.error || !res.data) {
        setError('Announcement not found.');
        return;
      }
      const row = res.data as unknown as {
        id: string;
        title: string;
        body: string;
        post_id: string | null;
        created_at: string;
        updated_at?: string | null;
        admins_only?: boolean | null;
        community_id: string;
        community: { name: string } | null;
      };
      const communityId = String(row.community_id);
      const adminFlag = await isCommunityAdmin(communityId).catch(() => false);
      setAdmin(adminFlag);
      if (row.admins_only && !adminFlag) {
        setError('This announcement is only visible to admins.');
        return;
      }
      const { data: media } = await supabase
        .from('announcement_media')
        .select('path')
        .eq('announcement_id', String(row.id))
        .order('position', { ascending: true });
      setItem({
        id: String(row.id),
        title: String(row.title),
        body: String(row.body),
        date: formatDate(String(row.created_at)),
        time: formatTime(String(row.created_at)),
        postId: row.post_id ? String(row.post_id) : null,
        communityId,
        communityName: row.community?.name ?? 'Community',
        adminsOnly: !!row.admins_only,
        edited: isEdited(String(row.created_at), row.updated_at),
        images: (
          (media as unknown as { path: string }[] | null) ?? []
        ).map((m) => publicUrl('post-media', String(m.path))),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id, demo]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCopy() {
    if (!item) return;
    Clipboard.setStringAsync(`${item.title}\n\n${item.body}`).catch(() => {});
  }

  function handleShare() {
    if (!item) return;
    Share.share({
      message: `${item.title}\n\n${item.body}\n\n— via Ophixe`,
    }).catch(() => {});
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert('Delete announcement?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAnnouncement(item.id);
            router.replace('/update');
          } catch {
            setError('Could not delete.');
          }
        },
      },
    ]);
  }

  function handleReport() {
    if (!item) return;
    Alert.alert('Report announcement?', 'Your admins will review it.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportContent(
              { announcementId: item.id },
              item.communityId,
              reason,
            );
            Alert.alert('Reported', 'Thanks — the admins have been notified.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not report.');
          }
        },
      })),
    ]);
  }

  function menuItems(): DropdownItem[] {
    if (!item) return [];
    if (admin) {
      return [
        {
          label: 'Edit',
          icon: 'pencil-outline',
          onPress: () =>
            router.push({
              pathname: '/announce/edit' as never,
              params: { id: item.id },
            }),
        },
        {
          label: 'Delete',
          icon: 'trash-outline',
          destructive: true,
          onPress: confirmDelete,
        },
        { label: 'Copy', icon: 'copy-outline', onPress: handleCopy },
        {
          label: 'Share',
          icon: 'share-social-outline',
          onPress: handleShare,
        },
      ];
    }
    return [
      { label: 'Copy', icon: 'copy-outline', onPress: handleCopy },
      {
        label: 'Share',
        icon: 'share-social-outline',
        onPress: handleShare,
      },
      { label: 'Report', icon: 'flag-outline', onPress: handleReport },
    ];
  }

  return (
    <>
      <ScreenHeader
        title="ANNOUNCEMENT"
        action={item ? { label: '•••', onPress: () => setMenuOpen(true) } : null}
      />
      <DropdownMenu
        visible={menuOpen}
        position={{ top: insets.top + 70, right: 12 }}
        items={menuItems()}
        onClose={() => setMenuOpen(false)}
      />
      <Screen>
        {demo ? (
          <Text style={styles.notice}>Connect Supabase to view announcements.</Text>
        ) : !item ? (
          <>
            <ActivityIndicator style={styles.loader} color={c.ink} />
            <ErrorText message={error} />
          </>
        ) : (
          <View>
            <Text style={styles.community}>{item.communityName}</Text>
            {item.adminsOnly ? (
              <Text style={styles.adminTag}>ADMINS ONLY</Text>
            ) : null}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.date}>
              {item.date} • {item.time}
              {item.edited ? ' • EDITED' : ''}
            </Text>
            <Text style={styles.body}>{item.body}</Text>
            {item.images.length > 0 ? (
              <PhotoCarousel uris={item.images} />
            ) : null}
            {item.postId ? (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  router.push({
                    pathname: '/post/[id]',
                    params: { id: item.postId as string },
                  })
                }
              >
                <Text style={styles.seeMore}>SEE MORE →</Text>
              </Pressable>
            ) : null}
            <ErrorText message={error} />
          </View>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  notice: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
  },
  community: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
  },
  adminTag: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: c.paper,
    backgroundColor: c.ink,
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: c.text,
    marginTop: 6,
  },
  date: { fontSize: 12, color: c.subtext, marginTop: 4, fontWeight: '600' },
  body: { fontSize: 15, color: c.text, marginTop: 14, lineHeight: 23 },
  seeMore: {
    fontSize: 13,
    fontWeight: '800',
    color: c.primary,
    marginTop: 16,
  },
});
}
