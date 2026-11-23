import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchField } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  createFormLink,
  deleteFormLink,
  isCommunityAdmin,
  listFormLinks,
  type FormLink,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';
import {
  listCommunityMySubmissions,
  listCommunityPendingApprovals,
  type Submission,
} from '../../lib/forms';
import {
  resolveSelectedCommunityId,
  useSelectedCommunityId,
} from '../../lib/selectedCommunity';

function statusColors(pal: ThemeColors): Record<Submission['status'], string> {
  return {
    pending: pal.warning,
    approved: pal.primary,
    rejected: pal.danger,
  };
}

function Row({
  item,
  showSubmitter,
}: {
  item: Submission;
  showSubmitter?: boolean;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      style={styles.row}
      onPress={() =>
        router.push({ pathname: '/forms/[id]', params: { id: item.id } })
      }
    >
      <View
        style={[styles.dot, { backgroundColor: statusColors(c)[item.status] }]}
      />
      <View style={styles.mid}>
        <Text style={styles.title}>{item.typeTitle}</Text>
        <Text style={styles.meta}>
          {showSubmitter ? `${item.submitterName} • ` : ''}
          {item.communityName} • {timeAgo(item.created_at)}
        </Text>
      </View>
      <Text style={styles.status}>{item.status.toUpperCase()}</Text>
    </Pressable>
  );
}

export default function FormsHub() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [mine, setMine] = useState<Submission[] | null>(null);
  const [approvals, setApprovals] = useState<Submission[]>([]);
  const [links, setLinks] = useState<FormLink[]>([]);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matchesForm = (item: Submission) =>
    !needle ||
    item.typeTitle.toLowerCase().includes(needle) ||
    item.submitterName.toLowerCase().includes(needle) ||
    item.status.toLowerCase().includes(needle);
  const shownMine = mine === null ? null : mine.filter(matchesForm);
  const shownApprovals = approvals.filter(matchesForm);
  const shownLinks = links.filter(
    (link) => !needle || link.title.toLowerCase().includes(needle),
  );
  const [linksAdmin, setLinksAdmin] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const selectedId = useSelectedCommunityId();

  const load = useCallback(async () => {
    const scoped = await resolveSelectedCommunityId().catch(() => null);
    if (!scoped) {
      setMine([]);
      setApprovals([]);
      setLinks([]);
      setLinksAdmin(false);
      return;
    }
    const [minePage, approvalPage, linkPage, adminFlag] = await Promise.all([
      listCommunityMySubmissions(scoped),
      listCommunityPendingApprovals(scoped).catch((): Submission[] => []),
      listFormLinks(scoped),
      isCommunityAdmin(scoped),
    ]);
    setMine(minePage);
    setApprovals(adminFlag ? approvalPage : []);
    setLinks(linkPage.links);
    setLinksAdmin(adminFlag);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleAddLink() {
    const scoped = await resolveSelectedCommunityId().catch(() => null);
    if (!scoped) return;
    setLinkError(null);
    setLinkBusy(true);
    try {
      await createFormLink(scoped, linkTitle, linkUrl);
      setLinkTitle('');
      setLinkUrl('');
      setAddingLink(false);
      await load();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setLinkBusy(false);
    }
  }

  function confirmDeleteLink(link: FormLink) {
    Alert.alert('Delete link?', link.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFormLink(link.id);
            await load();
          } catch (err) {
            setLinkError(
              err instanceof Error ? err.message : 'Could not delete.',
            );
          }
        },
      },
    ]);
  }

  return (
    <>
      <ScreenHeader title="FORMS" showMenu backTo="/feed" />
      <Screen>
        <Heading>My requests</Heading>
        <Button
          title="Fill form"
          onPress={() => router.push('/forms/new')}
        />
        <View style={{ paddingTop: 12 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search forms"
          />
        </View>
        {shownMine === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (shownMine ?? []).length === 0 ? (
          <Subtext>
            {selectedId
              ? 'No requests in this community yet. Start one with the button above.'
              : 'Join or create a community first, then come back to file a request.'}
          </Subtext>
        ) : (
          <View style={styles.list}>
            {(shownMine ?? []).map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </View>
        )}
        {shownApprovals.length > 0 && (
          <View style={styles.section}>
            <Heading>Approvals ({shownApprovals.length})</Heading>
            <View style={styles.list}>
              {shownApprovals.map((item) => (
                <Row key={item.id} item={item} showSubmitter />
              ))}
            </View>
          </View>
        )}
        {selectedId && (
          <View style={styles.section}>
            <Heading>Form links</Heading>
            <Subtext>Google forms and links shared by admins.</Subtext>
            {shownLinks.length === 0 ? (
              <Subtext>No form links in this community yet.</Subtext>
            ) : (
              <View style={styles.list}>
                {shownLinks.map((link) => (
                  <Pressable
                    key={link.id}
                    style={styles.row}
                    onPress={() =>
                      Linking.openURL(link.url).catch(() =>
                        setLinkError('Could not open this link.'),
                      )
                    }
                  >
                    <Ionicons
                      name="link"
                      size={20}
                      color={c.primary}
                    />
                    <View style={styles.mid}>
                      <Text style={styles.title}>{link.title}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {link.url}
                      </Text>
                    </View>
                    {linksAdmin && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => confirmDeleteLink(link)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={c.danger}
                        />
                      </Pressable>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
            {linksAdmin &&
              (addingLink ? (
                <View style={styles.linkForm}>
                  <Field
                    label="TITLE"
                    placeholder="Staff satisfaction survey"
                    value={linkTitle}
                    onChangeText={setLinkTitle}
                  />
                  <Field
                    label="LINK"
                    placeholder="https://forms.gle/…"
                    autoCapitalize="none"
                    value={linkUrl}
                    onChangeText={setLinkUrl}
                  />
                  <ErrorText message={linkError} />
                  <Button
                    title="Save link"
                    loading={linkBusy}
                    onPress={handleAddLink}
                  />
                </View>
              ) : (
                <>
                  <ErrorText message={linkError} />
                  <Button
                    title="Add form link"
                    variant="outline"
                    onPress={() => setAddingLink(true)}
                  />
                </>
              ))}
          </View>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  list: { marginTop: 8 },
  section: { marginTop: 24 },
  linkForm: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  mid: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text },
  meta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  status: { fontSize: 11, fontWeight: '800', color: c.subtext },
});
}
