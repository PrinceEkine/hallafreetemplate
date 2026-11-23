import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Screen,
} from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { createCommunity } from '../../lib/communities';
import { updateCommunityLogo } from '../../lib/communityContent';
import { setSelectedCommunityId } from '../../lib/selectedCommunity';
import {
  DEFAULT_MODULE_SETTINGS,
  type ModuleSettings,
} from '../../lib/communityModules';
import {
  removeFromBucket,
  uploadCommunityLogo,
  type PickedAsset,
} from '../../lib/uploads';

const PRIVACY = ['Public', 'Private'] as const;
const ACCESS = ['Anyone', 'Approval', 'Invite'] as const;

function Chips<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => onPick(o)}
            style={[styles.chip, value === o && styles.chipActive]}
          >
            <Text style={[styles.chipText, value === o && styles.chipTextActive]}>
              {o}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function NewCommunity() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [privacy, setPrivacy] = useState<(typeof PRIVACY)[number]>('Public');
  const [access, setAccess] = useState<(typeof ACCESS)[number]>('Anyone');
  const [modules] = useState<ModuleSettings>({
    ...DEFAULT_MODULE_SETTINGS,
  });
  const [logo, setLogo] = useState<PickedAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePickLogo() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setLogo({
      uri: asset.uri,
      name: asset.name ?? 'logo.jpg',
      mimeType: asset.mimeType ?? undefined,
      size: asset.size ?? undefined,
    });
  }

  async function handleCreate() {
    setError(null);
    if (name.trim().length < 3) {
      setError('Give your community a name (3+ characters).');
      return;
    }
    setLoading(true);
    try {
      const id = await createCommunity({
        name: name.trim(),
        description: about.trim(),
        privacy: privacy.toLowerCase(),
        who_can_join: access.toLowerCase(),
        website: website.trim(),
        modules,
      });
      if (logo) {
        let uploaded: string | null = null;
        try {
          uploaded = await uploadCommunityLogo(id, logo);
          await updateCommunityLogo(id, uploaded);
        } catch {
          if (uploaded) {
            await removeFromBucket('avatars', uploaded).catch(() => {});
          }
        }
      }
      setSelectedCommunityId(id);
      router.replace({
        pathname: '/community/[id]',
        params: { id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create community.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="CREATE COMMUNITY" />
      <Screen>
        <Text style={styles.label}>COMPANY LOGO (OPTIONAL)</Text>
        {logo ? (
          <View style={styles.logoWrap}>
            <Image source={{ uri: logo.uri }} style={styles.logo} />
            <Pressable onPress={() => setLogo(null)} hitSlop={8}>
              <Text style={styles.remove}>REMOVE</Text>
            </Pressable>
          </View>
        ) : (
          <Button
            title="Add a company logo"
            variant="outline"
            onPress={handlePickLogo}
          />
        )}
        <Field
          label="COMMUNITY NAME"
          placeholder="Lagos Operations"
          value={name}
          onChangeText={setName}
        />
        <Chips
          label="PRIVACY"
          options={PRIVACY}
          value={privacy}
          onPick={setPrivacy}
        />
        <Chips
          label="WHO CAN JOIN"
          options={ACCESS}
          value={access}
          onPick={setAccess}
        />
        <Field
          label="WEBSITE (OPTIONAL)"
          placeholder="https://company.com"
          autoCapitalize="none"
          value={website}
          onChangeText={setWebsite}
        />
        <Field
          label="ABOUT THE COMMUNITY"
          placeholder="What is this community for?"
          multiline
          numberOfLines={4}
          value={about}
          onChangeText={setAbout}
        />
        <ErrorText message={error} />
        <Button title="Create" loading={loading} onPress={handleCreate} />
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  fieldWrap: { marginTop: 16 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: radius.m,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 14, fontWeight: '700', color: c.ink },
  chipTextActive: { color: c.paper },
  logoWrap: { gap: 8, marginBottom: 4 },
  logo: { width: 96, height: 96, borderRadius: 48 },
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
});
}
