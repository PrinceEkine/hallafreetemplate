import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EmptyState, SearchField } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import {
  createFolder,
  deleteFileItem,
  deleteFolder,
  isCommunityAdmin,
  listFiles,
  listFolders,
  listVisibleMembers,
  setFileVisibility,
  setFolderVisibility,
  uploadCommunityFiles,
  type FileItem,
  type FileVisibility,
  type FolderItem,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';
import { takePendingMemberSelection } from '../../lib/pendingSelection';
import { useColors } from '../../lib/theme';
import { openWithSignedUrl, removeFromBucket } from '../../lib/uploads';

const UNSORTED_ID = '__unsorted__';
const NEW_FOLDER_CTX = 'new-folder';
const EDIT_VISIBILITY_CTX = 'edit-visibility';

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(name: string, mime: string): 'image' | 'film' | 'musical-notes' | 'document-text' {
  const lower = `${mime} ${name}`.toLowerCase();
  if (lower.includes('image') || /\.(png|jpe?g|gif|webp|heic)$/.test(lower)) {
    return 'image';
  }
  if (lower.includes('video') || /\.(mp4|mov|webm|mkv)$/.test(lower)) {
    return 'film';
  }
  if (lower.includes('audio') || /\.(mp3|wav|m4a|ogg)$/.test(lower)) {
    return 'musical-notes';
  }
  return 'document-text';
}

const VISIBILITY_OPTIONS: { id: FileVisibility; label: string; hint: string }[] = [
  { id: 'all', label: 'All members', hint: 'Everyone in the community' },
  { id: 'admin', label: 'Admins only', hint: 'Owners and admins' },
  { id: 'selected', label: 'Select members', hint: 'Only chosen members' },
];

function visibilityLabel(v: FileVisibility): string {
  return v === 'all' ? 'ALL' : v === 'admin' ? 'ADMINS' : 'SELECTED';
}

function VisibilityBadge({ value }: { value: FileVisibility }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  if (value === 'all') return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{visibilityLabel(value)}</Text>
    </View>
  );
}

type VisibilityTarget =
  | { kind: 'folder'; item: FolderItem }
  | { kind: 'file'; item: FileItem };

export default function Files() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [openFolder, setOpenFolder] = useState<FolderItem | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderVisibility, setNewFolderVisibility] =
    useState<FileVisibility>('all');
  const [folderMembers, setFolderMembers] = useState<string[]>([]);
  const [visibilityTarget, setVisibilityTarget] =
    useState<VisibilityTarget | null>(null);
  const [editVisibility, setEditVisibility] = useState<FileVisibility>('all');
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `files:${id}`,
          () =>
            Promise.all([
              listFiles(id),
              listFolders(id),
              isCommunityAdmin(id),
            ]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open these files once online to save them.');
        return;
      }
      const [page, folderPage, adminFlag] = bundle;
      setFiles(page.files);
      setFolders(folderPage.folders);
      setUnsupported(page.unsupported);
      setAdmin(adminFlag);
      setOpenFolder((prev) => {
        if (!prev || prev.id === UNSORTED_ID) return prev;
        return folderPage.folders.find((f) => f.id === prev.id) ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Picks returning from the member directory page.
      const pickedNew = takePendingMemberSelection(NEW_FOLDER_CTX);
      if (pickedNew !== undefined) {
        setFolderMembers(pickedNew);
        if (pickedNew.length > 0) setNewFolderVisibility('selected');
      }
      const pickedEdit = takePendingMemberSelection(EDIT_VISIBILITY_CTX);
      if (pickedEdit !== undefined) {
        setEditMembers(pickedEdit);
        if (pickedEdit.length > 0) setEditVisibility('selected');
      }
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function openMemberPicker(context: string, selected: string[]) {
    if (!id) return;
    router.push({
      // The generated route types predate this page (task-assign casts too).
      pathname: '/community/visibility-select' as never,
      params: { id, context, selected: selected.join(',') },
    });
  }

  async function handleCreateFolder() {
    if (!id || !folderName.trim() || busy) return;
    if (folderVisibility === 'selected' && folderMembers.length === 0) {
      setError('Pick at least one member, or choose another option.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createFolder(id, folderName, {
        visibility: folderVisibility,
        memberIds: folderMembers,
      });
      setFolderName('');
      setNewFolderVisibility('all');
      setFolderMembers([]);
      setAddingFolder(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setBusy(false);
    }
  }

  function folderActions(folder: FolderItem) {
    Alert.alert(folder.name, 'Manage this folder.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change visibility',
        onPress: () => openVisibilityEditor({ kind: 'folder', item: folder }),
      },
      {
        text: 'Delete folder',
        style: 'destructive',
        onPress: () => confirmDeleteFolder(folder),
      },
    ]);
  }

  function confirmDeleteFolder(folder: FolderItem) {
    Alert.alert(
      'Delete folder?',
      `Files inside "${folder.name}" will be kept but become unsorted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id);
              if (openFolder?.id === folder.id) setOpenFolder(null);
              await load();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Could not delete.',
              );
            }
          },
        },
      ],
    );
  }

  async function handleUpload() {
    if (!id || busy || !openFolder || openFolder.id === UNSORTED_ID) return;
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    setBusy(true);
    try {
      // Files inherit the folder's visibility so nothing leaks outside it.
      const visibility = openFolder.visibility;
      const memberIds =
        visibility === 'selected'
          ? await listVisibleMembers({ folderId: openFolder.id })
          : [];
      await uploadCommunityFiles(
        id,
        picked.assets.map((a) => ({
          uri: a.uri,
          name: a.name ?? 'file',
          mimeType: a.mimeType ?? undefined,
          size: a.size ?? undefined,
        })),
        openFolder.id,
        { visibility, memberIds },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(item: FileItem) {
    try {
      await openWithSignedUrl('community-files', item.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open.');
    }
  }

  function confirmDelete(item: FileItem) {
    Alert.alert('Delete file?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFileItem(item.id);
            await removeFromBucket('community-files', item.path).catch(
              () => {},
            );
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  async function openVisibilityEditor(target: VisibilityTarget) {
    setError(null);
    setVisibilityTarget(target);
    setEditVisibility(target.item.visibility);
    setEditMembers([]);
    if (target.item.visibility === 'selected') {
      const ids =
        target.kind === 'folder'
          ? await listVisibleMembers({ folderId: target.item.id })
          : await listVisibleMembers({ fileId: target.item.id });
      setEditMembers(ids);
    }
  }

  async function handleSaveVisibility() {
    if (!visibilityTarget || busy) return;
    if (editVisibility === 'selected' && editMembers.length === 0) {
      setError('Pick at least one member, or choose another option.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (visibilityTarget.kind === 'folder') {
        await setFolderVisibility(
          visibilityTarget.item.id,
          editVisibility,
          editMembers,
        );
      } else {
        await setFileVisibility(
          visibilityTarget.item.id,
          editVisibility,
          editMembers,
        );
      }
      setVisibilityTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function renderVisibilityOptions(
    value: FileVisibility,
    onPick: (v: FileVisibility) => void,
    context: string,
    selectedIds: string[],
  ) {
    return (
      <>
        {VISIBILITY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.id}
            style={styles.optionRow}
            onPress={() => {
              if (opt.id === 'selected') {
                openMemberPicker(context, selectedIds);
              } else {
                onPick(opt.id);
              }
            }}
          >
            <Ionicons
              name={
                value === opt.id ? 'radio-button-on' : 'radio-button-off'
              }
              size={20}
              color={value === opt.id ? c.ink : c.subtext}
            />
            <View style={styles.optionMid}>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionHint}>{opt.hint}</Text>
            </View>
            {opt.id === 'selected' && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={c.subtext}
              />
            )}
          </Pressable>
        ))}
        {value === 'selected' && (
          <Pressable
            style={styles.pickedRow}
            onPress={() => openMemberPicker(context, selectedIds)}
          >
            <Ionicons name="people-outline" size={18} color={c.ink} />
            <Text style={styles.pickedText}>
              {selectedIds.length === 0
                ? 'Tap to choose members'
                : `${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'} chosen — tap to change`}
            </Text>
          </Pressable>
        )}
      </>
    );
  }

  const allFiles = files ?? [];
  const needle = query.trim().toLowerCase();
  const matched = !needle
    ? allFiles
    : allFiles.filter((f) => f.name.toLowerCase().includes(needle));
  const unsorted = matched.filter((f) => !f.folder_id);
  const visible =
    !openFolder || openFolder.id === UNSORTED_ID
      ? unsorted
      : matched.filter((f) => f.folder_id === openFolder.id);

  type Tile =
    | { kind: 'folder'; folder: FolderItem }
    | { kind: 'unsorted'; count: number }
    | { kind: 'new' };
  const shownFolders = !needle
    ? folders
    : folders.filter((folder) =>
        folder.name.toLowerCase().includes(needle),
      );
  const tiles: Tile[] = [
    ...shownFolders.map(
      (folder): Tile => ({ kind: 'folder', folder }),
    ),
    ...(unsorted.length > 0
      ? [{ kind: 'unsorted' as const, count: unsorted.length }]
      : []),
    ...(admin ? [{ kind: 'new' as const }] : []),
  ];

  return (
    <>
      <ScreenHeader title="FILES" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <ErrorText message={error} />
        <View
          style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search files"
          />
        </View>
        {files === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : unsupported ? (
          <EmptyState
            icon="folder"
            title="Files are not set up yet"
            body="Ask your admin to apply the latest database update, then pull to refresh."
          />
        ) : !openFolder ? (
          <FlatList
            data={tiles}
            keyExtractor={(tile) =>
              tile.kind === 'folder'
                ? tile.folder.id
                : tile.kind === 'unsorted'
                  ? UNSORTED_ID
                  : '__new__'
            }
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListHeaderComponent={
              <>
                <Text style={styles.hint}>
                  Tap a folder to open it, then upload files inside it.
                  {!admin && folders.length === 0
                    ? ' Ask an admin to create one.'
                    : ''}
                </Text>
                {addingFolder && admin && (
                  <View style={styles.newFolderCard}>
                    <Text style={styles.optionTitle}>FOLDER NAME</Text>
                    <TextInput
                      style={styles.newFolderInput}
                      placeholder="Enter a name for the folder"
                      placeholderTextColor={c.subtext}
                      autoFocus
                      value={folderName}
                      onChangeText={setFolderName}
                    />
                    <Text style={styles.optionTitle}>
                      WHO CAN SEE THIS FOLDER
                    </Text>
                    {renderVisibilityOptions(
                      folderVisibility,
                      setNewFolderVisibility,
                      NEW_FOLDER_CTX,
                      folderMembers,
                    )}
                    <Button
                      title="Create folder"
                      loading={busy}
                      onPress={handleCreateFolder}
                    />
                  </View>
                )}
              </>
            }
            ListEmptyComponent={
              <EmptyState
                icon="folder-open"
                title="No folders yet"
                body={
                  admin
                    ? 'Create a folder first, then tap it to add files inside.'
                    : 'Ask an admin to create a folder first.'
                }
              />
            }
            renderItem={({ item: tile }) => {
              if (tile.kind === 'new') {
                return (
                  <Pressable
                    style={[styles.tile, styles.tileDashed]}
                    onPress={() => {
                      setAddingFolder((v) => !v);
                    }}
                  >
                    <Ionicons name="add" size={30} color={c.ink} />
                    <Text style={styles.tileName}>New folder</Text>
                    <Text style={styles.tileSub}>Admins only</Text>
                  </Pressable>
                );
              }
              if (tile.kind === 'unsorted') {
                return (
                  <Pressable
                    style={styles.tile}
                    onPress={() =>
                      setOpenFolder({
                        id: UNSORTED_ID,
                        name: 'Unsorted',
                        visibility: 'all',
                        created_at: '',
                      })
                    }
                  >
                    <Ionicons
                      name="file-tray"
                      size={30}
                      color={c.subtext}
                    />
                    <Text style={styles.tileName}>Unsorted</Text>
                    <Text style={styles.tileSub}>
                      {tile.count} file{tile.count === 1 ? '' : 's'}
                    </Text>
                  </Pressable>
                );
              }
              const folder = tile.folder;
              const count = allFiles.filter(
                (f) => f.folder_id === folder.id,
              ).length;
              return (
                <Pressable
                  style={styles.tile}
                  onPress={() => setOpenFolder(folder)}
                  onLongPress={() =>
                    admin ? folderActions(folder) : undefined
                  }
                >
                  <Ionicons name="folder" size={30} color={c.ink} />
                  <Text style={styles.tileName} numberOfLines={2}>
                    {folder.name}
                  </Text>
                  <Text style={styles.tileSub}>
                    {count} file{count === 1 ? '' : 's'}
                  </Text>
                  {admin && <VisibilityBadge value={folder.visibility} />}
                </Pressable>
              );
            }}
          />
        ) : (
          <>
            <View style={styles.openHead}>
              <Pressable
                style={styles.backBtn}
                onPress={() => setOpenFolder(null)}
                hitSlop={8}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={c.text}
                />
                <Text style={styles.openName} numberOfLines={1}>
                  {openFolder.name}
                </Text>
              </Pressable>
              {admin && openFolder.id !== UNSORTED_ID && (
                <VisibilityBadge value={openFolder.visibility} />
              )}
            </View>
            {openFolder.id === UNSORTED_ID ? (
              <Text style={styles.hintPadded}>
                Files without a folder. New uploads go inside a folder.
              </Text>
            ) : (
              <View style={styles.uploadRow}>
                <Text style={styles.hint}>
                  Uploads land inside “{openFolder.name}”.
                </Text>
                <Pressable
                  style={styles.uploadBtn}
                  onPress={handleUpload}
                  disabled={busy}
                >
                  <Ionicons
                    name="cloud-upload"
                    size={18}
                    color={c.paper}
                  />
                  <Text style={styles.uploadText}>
                    {busy ? 'UPLOADING…' : 'UPLOAD'}
                  </Text>
                </Pressable>
              </View>
            )}
            <FlatList
              data={visible}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.ink}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="folder-open"
                  title="Folder is empty"
                  body={
                    openFolder.id === UNSORTED_ID
                      ? 'Nothing here.'
                      : 'Upload meeting notes, policies, or anything the community needs.'
                  }
                  actionTitle={
                    openFolder.id === UNSORTED_ID ? undefined : 'Upload a file'
                  }
                  onAction={() =>
                    openFolder.id === UNSORTED_ID ? undefined : handleUpload()
                  }
                />
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => handleOpen(item)}
                  >
                    <View style={styles.iconWrap}>
                      <Ionicons
                        name={iconFor(item.name, item.mime)}
                        size={22}
                        color={c.ink}
                      />
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.meta}>
                        {item.authorName}
                        {formatBytes(item.size_bytes)
                          ? ` • ${formatBytes(item.size_bytes)}`
                          : ''}
                        {` • ${timeAgo(item.created_at)}`}
                      </Text>
                      {admin && (
                        <VisibilityBadge value={item.visibility} />
                      )}
                    </View>
                  </Pressable>
                  {admin && (
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        openVisibilityEditor({ kind: 'file', item })
                      }
                    >
                      <Ionicons
                        name="eye-outline"
                        size={20}
                        color={c.subtext}
                      />
                    </Pressable>
                  )}
                  {(item.mine || admin) && (
                    <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={c.danger}
                      />
                    </Pressable>
                  )}
                </View>
              )}
            />
          </>
        )}
      </View>
      <Modal
        visible={visibilityTarget !== null}
        transparent
        onRequestClose={() => setVisibilityTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setVisibilityTarget(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Who can see “{visibilityTarget?.item.name}”
            </Text>
            {renderVisibilityOptions(
              editVisibility,
              setEditVisibility,
              EDIT_VISIBILITY_CTX,
              editMembers,
            )}
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setVisibilityTarget(null)}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtn}
                onPress={handleSaveVisibility}
                disabled={busy}
              >
                <Text style={styles.modalBtnText}>
                  {busy ? 'SAVING…' : 'SAVE'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: c.paper },
    loader: { marginTop: 40 },
    hint: { fontSize: 13, color: c.subtext, lineHeight: 19 },
    hintPadded: {
      fontSize: 13,
      color: c.subtext,
      lineHeight: 19,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    grid: { padding: 10 },
    gridRow: { gap: 10 },
    tile: {
      flex: 1,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.l,
      padding: 16,
      marginVertical: 5,
      alignItems: 'center',
      gap: 6,
    },
    tileDashed: { borderStyle: 'dashed', backgroundColor: c.paper },
    tileName: {
      fontSize: 14,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    tileSub: { fontSize: 12, color: c.subtext },
    badge: {
      backgroundColor: c.ink,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginTop: 2,
      alignSelf: 'center',
    },
    badgeText: { fontSize: 10, fontWeight: '800', color: c.paper },
    newFolderCard: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.l,
      padding: 14,
      marginTop: 12,
      marginBottom: 4,
      gap: 8,
    },
    newFolderInput: {
      backgroundColor: c.paper,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      height: 44,
      fontSize: 15,
      color: c.text,
    },
    optionTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: c.subtext,
      letterSpacing: 1,
      marginTop: 4,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    optionMid: { flex: 1 },
    optionLabel: { fontSize: 14, fontWeight: '700', color: c.text },
    optionHint: { fontSize: 12, color: c.subtext, marginTop: 1 },
    pickedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.paper,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 4,
    },
    pickedText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    openHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 8,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    openName: { fontSize: 17, fontWeight: '800', color: c.text, flex: 1 },
    uploadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 10,
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.ink,
      borderRadius: radius.m,
      paddingHorizontal: 14,
      height: 42,
    },
    uploadText: { fontSize: 13, fontWeight: '800', color: c.paper },
    list: { padding: 16, paddingTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mid: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: c.text },
    meta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalCard: {
      width: '100%',
      maxHeight: '85%',
      backgroundColor: c.paper,
      borderRadius: radius.l,
      padding: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      marginBottom: 8,
    },
    modalBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
    modalBtn: {
      flex: 1,
      backgroundColor: c.ink,
      borderRadius: radius.m,
      paddingVertical: 12,
      alignItems: 'center',
    },
    modalBtnText: { fontSize: 14, fontWeight: '800', color: c.paper },
    modalBtnGhost: { backgroundColor: c.bg },
    modalBtnGhostText: { fontSize: 14, fontWeight: '800', color: c.text },
  });
}
