import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Avatar,
  SearchField,
  SectionTitle,
} from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { Button, ErrorText } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import {
  getCommunityBasics,
  isCommunityMember,
  isCommunityOwner,
  listCommunityMembers,
  setContactVisibility,
  setSupportMember,
  type CommunityBasics,
  type MemberEntry,
} from '../../lib/communityContent';
import { createDm } from '../../lib/chat';
import { useColors } from '../../lib/theme';

export default function Contact() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [basics, setBasics] = useState<CommunityBasics | null>(null);
  const [contacts, setContacts] = useState<MemberEntry[]>([]);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shownContacts = contacts.filter(
    (m) => !needle || m.name.toLowerCase().includes(needle),
  );
  const [owner, setOwner] = useState(false);
  const [member, setMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `contact:${id}`,
          async () => {
            const [basicsData, memberFlag, ownerFlag] = await Promise.all([
              getCommunityBasics(id),
              isCommunityMember(id),
              isCommunityOwner(id),
            ]);
            if (!memberFlag) {
              return { basicsData, memberFlag, ownerFlag, contacts: [] };
            }
            const page = await listCommunityMembers(id, { limit: 200 });
            const active = page.members.filter(
              (m) => m.status === 'active',
            );
            const staff = active.filter(
              (m) => m.role === 'owner' || m.role === 'admin',
            );
            const support = active.filter(
              (m) =>
                m.isSupport && m.role !== 'owner' && m.role !== 'admin',
            );
            const visible = ownerFlag
              ? [...staff, ...support]
              : [...staff.filter((m) => m.showInContact), ...support];
            return { basicsData, memberFlag, ownerFlag, contacts: visible };
          },
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open contacts once online to save them.');
        return;
      }
      setBasics(bundle.basicsData);
      setMember(bundle.memberFlag);
      setOwner(bundle.ownerFlag);
      setContacts(bundle.contacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleMessage(member: MemberEntry) {
    if (!id) return;
    setError(null);
    setBusyId(member.userId);
    try {
      const conversationId = await createDm(member.userId, id);
      router.replace({
        pathname: '/chat/[id]',
        params: { id: conversationId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start chat.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleVisibility(member: MemberEntry) {
    if (!id) return;
    setError(null);
    try {
      const staff = member.role === 'owner' || member.role === 'admin';
      if (staff) {
        await setContactVisibility(id, member.userId, !member.showInContact);
      } else {
        await setSupportMember(id, member.userId, false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.');
    }
  }

  async function handleEmail() {
    if (!basics?.email) return;
    const subject = encodeURIComponent(`Question for ${basics.name}`);
    try {
      await Linking.openURL(`mailto:${basics.email}?subject=${subject}`);
    } catch {
      setError('Could not open your email app.');
    }
  }

  async function handleCopyPhone() {
    if (!basics?.phone) return;
    try {
      await Clipboard.setStringAsync(basics.phone);
      setCopied(true);
    } catch {
      setError('Could not copy the number.');
    }
  }

  async function handleCall() {
    if (!basics?.phone) return;
    try {
      await Linking.openURL(`tel:${basics.phone.replace(/\s/g, '')}`);
    } catch {
      setError('Could not place the call.');
    }
  }

  async function handleWebsite() {
    if (!basics?.website) return;
    const url = basics.website.startsWith('http')
      ? basics.website
      : `https://${basics.website}`;
    try {
      await Linking.openURL(url);
    } catch {
      setError('Could not open the website.');
    }
  }

  return (
    <>
      <ScreenHeader title="CONTACT" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : !basics ? (
          <ErrorText message={error || 'Community not found.'} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.name}>{basics.name}</Text>
              <Text style={styles.meta}>
                {basics.privacy.toUpperCase()} • Owner: {basics.ownerName}
              </Text>
              {basics.website ? (
                <Pressable onPress={handleWebsite}>
                  <Text style={styles.website}>{basics.website}</Text>
                </Pressable>
              ) : null}
              {basics.description ? (
                <Text style={styles.about}>{basics.description}</Text>
              ) : null}
              {member ? (
                <>
                  {basics.phone ? (
                    <View style={styles.phoneBox}>
                      <Text style={styles.phoneLabel}>
                        COMMUNITY PHONE NUMBER
                      </Text>
                      <Text style={styles.phone}>{basics.phone}</Text>
                      <View style={styles.phoneBtns}>
                        <Pressable
                          style={styles.phoneBtn}
                          onPress={handleCall}
                        >
                          <Ionicons
                            name="call-outline"
                            size={16}
                            color={c.paper}
                          />
                          <Text style={styles.phoneBtnText}>CALL</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.phoneBtn, styles.phoneBtnGhost]}
                          onPress={handleCopyPhone}
                        >
                          <Ionicons
                            name="copy-outline"
                            size={16}
                            color={c.text}
                          />
                          <Text style={styles.phoneBtnGhostText}>
                            {copied ? 'COPIED!' : 'COPY'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.hint}>
                      No community phone number yet.
                      {owner
                        ? ' Add one from Edit community so members can reach you.'
                        : ' Ask an admin to add one.'}
                    </Text>
                  )}
                  {basics.email ? (
                    <Button
                      title="Send us an email"
                      onPress={handleEmail}
                    />
                  ) : (
                    <Text style={styles.hint}>
                      No community email yet.
                      {owner
                        ? ' Add one from Edit community so members can reach you.'
                        : ' Ask an admin to add one.'}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.hint}>
                    Join this community to see the phone number and contacts.
                  </Text>
                  <Button
                    title="Join community"
                    onPress={() => router.push('/community/join')}
                  />
                </>
              )}
            </View>
            {member ? (
              <>
                <View style={styles.sectionRow}>
                  <View style={styles.sectionGrow}>
                    <SectionTitle>ADMINS & SUPPORT</SectionTitle>
                  </View>
                  {owner && (
                    <Pressable
                      style={styles.addBtn}
                      onPress={() =>
                        id &&
                        router.push({
                          // The generated route types predate this page.
                          pathname: '/community/contact-add' as never,
                          params: { id },
                        })
                      }
                    >
                      <Ionicons name="add" size={16} color={c.paper} />
                      <Text style={styles.addText}>ADD</Text>
                    </Pressable>
                  )}
                </View>
                {owner && (
                  <Text style={styles.hint}>
                    As the owner you can add members to support, or remove
                    admins and support from this contact list.
                  </Text>
                )}
                <View style={{ paddingBottom: 8 }}>
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="Search contacts"
                  />
                </View>
                {shownContacts.length === 0 ? (
                  <Text style={styles.hint}>
                    {query
                      ? 'Nobody matches that search.'
                      : 'No admin contact listed. Try the phone number instead.'}
                  </Text>
                ) : (
                  shownContacts.map((m) => {
                    const staff =
                      m.role === 'owner' || m.role === 'admin';
                    return (
                      <Pressable
                        key={m.userId}
                        style={styles.row}
                        onPress={() =>
                          router.push({
                            pathname: '/member/[id]',
                            params: { id: m.userId, community: id },
                          })
                        }
                      >
                        <Avatar name={m.name} size={44} uri={m.avatarUrl} />
                        <View style={styles.mid}>
                          <Text style={styles.rowName}>{m.name}</Text>
                          <View style={styles.roleRow}>
                            <Text style={styles.roleTag}>
                              {staff ? m.role.toUpperCase() : 'SUPPORT'}
                            </Text>
                            {owner && staff && !m.showInContact && (
                              <Text style={styles.hiddenTag}>HIDDEN</Text>
                            )}
                          </View>
                        </View>
                        {owner && (
                          <Pressable
                            hitSlop={8}
                            onPress={() => handleVisibility(m)}
                          >
                            <Text style={styles.visibility}>
                              {staff && !m.showInContact ? 'ADD' : 'REMOVE'}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          hitSlop={8}
                          disabled={busyId === m.userId}
                          onPress={() => handleMessage(m)}
                        >
                          <Text style={styles.message}>
                            {busyId === m.userId ? '…' : 'MESSAGE'}
                          </Text>
                        </Pressable>
                      </Pressable>
                    );
                  })
                )}
              </>
            ) : null}
            <ErrorText message={error} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16 },
    loader: { marginTop: 40 },
    card: { backgroundColor: c.paper, borderRadius: radius.l, padding: 20 },
    name: { fontSize: 22, fontWeight: '800', color: c.text },
    meta: { fontSize: 13, color: c.subtext, marginTop: 4 },
    website: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '700',
      marginTop: 8,
    },
    about: { fontSize: 14, color: c.text, marginTop: 8, lineHeight: 21 },
    phoneBox: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      padding: 14,
      marginTop: 16,
      marginBottom: 4,
      alignItems: 'center',
    },
    phoneLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.subtext,
      letterSpacing: 1,
    },
    phone: { fontSize: 24, fontWeight: '800', color: c.ink, marginTop: 4 },
    phoneBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
    phoneBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.ink,
      borderRadius: radius.m,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    phoneBtnText: { fontSize: 13, fontWeight: '800', color: c.paper },
    phoneBtnGhost: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.border },
    phoneBtnGhostText: { fontSize: 13, fontWeight: '800', color: c.text },
    hint: { fontSize: 14, color: c.subtext, lineHeight: 21 },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionGrow: { flex: 1 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.ink,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
    },
    addText: { fontSize: 12, fontWeight: '800', color: c.paper },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    mid: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: '700', color: c.text },
    roleRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    roleTag: {
      backgroundColor: c.ink,
      color: c.paper,
      fontWeight: '800',
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    hiddenTag: {
      fontSize: 11,
      fontWeight: '800',
      color: c.subtext,
      paddingVertical: 3,
    },
    visibility: { fontSize: 12, fontWeight: '800', color: c.danger },
    message: { fontSize: 13, fontWeight: '800', color: c.primary },
  });
}
