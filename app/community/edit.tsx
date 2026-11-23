import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
  getCommunityBasics,
  isCommunityAdmin,
  isCommunityMember,
  setCommunityBank,
  updateCommunity,
  updateCommunityAdminFields,
  updateCommunityLogo,
  updateCommunityProfile,
} from '../../lib/communityContent';
import {
  uploadCommunityLogo,
  type PickedAsset,
} from '../../lib/uploads';

export default function EditCommunity() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [member, setMember] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [rules, setRules] = useState('');
  const [domain, setDomain] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logo, setLogo] = useState<PickedAsset | null>(null);
  const [bank, setBank] = useState('');
  const [bankNumber, setBankNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [adminFlag, memberFlag] = await Promise.all([
        isCommunityAdmin(id),
        isCommunityMember(id),
      ]);
      setAdmin(adminFlag);
      setMember(memberFlag);
      if (memberFlag) {
        const basics = await getCommunityBasics(id);
        if (basics) {
          setName(basics.name);
          setAbout(basics.description);
          setWebsite(basics.website);
          setPhone(basics.phone);
          setEmail(basics.email);
          setRules(basics.rules);
          setDomain(basics.emailDomain);
          setLogoUrl(basics.logoUrl);
          setBank(basics.bankName);
          setBankNumber(basics.accountNumber);
          setBankName(basics.accountName);
        }
      }
    })();
  }, [id]);

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

  async function handleSave() {
    setError(null);
    if (!id) return;
    if (!admin) {
      // Members refresh the public About + Website only.
      setLoading(true);
      try {
        await updateCommunityProfile(id, {
          description: about,
          website,
        });
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save.');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (name.trim().length < 3) {
      setError('Give your community a name (3+ characters).');
      return;
    }
    if (rules.trim().length > 1000) {
      setError('Rules must be 1000 characters or less.');
      return;
    }
    setLoading(true);
    try {
      await updateCommunity(id, {
        name,
        description: about,
        website,
        phone,
      });
      await updateCommunityAdminFields(id, {
        email,
        rules,
        emailDomain: domain,
      });
      if (logo) {
        const path = await uploadCommunityLogo(id, logo);
        await updateCommunityLogo(id, path);
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBank() {
    setError(null);
    setBankSaved(false);
    if (!id) return;
    if (bankNumber.trim().length < 4) {
      setError('Enter the community account number.');
      return;
    }
    setBankLoading(true);
    try {
      await setCommunityBank(id, {
        bank,
        number: bankNumber,
        name: bankName,
      });
      setBankSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBankLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="EDIT COMMUNITY" communityId={id ?? null} showMenu />
      <Screen>
        <Heading>Edit community</Heading>
        {admin === null || member === null ? (
          <Subtext>Checking permissions…</Subtext>
        ) : !member ? (
          <Subtext>Join this community first, then come back to edit.</Subtext>
        ) : !admin ? (
          <>
            <Subtext>Members can refresh the About and Website.</Subtext>
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
            <Button title="Save changes" loading={loading} onPress={handleSave} />
          </>
        ) : (
          <>
            <Text style={styles.label}>COMPANY LOGO</Text>
            <View style={styles.logoRow}>
              {logo ? (
                <Image source={{ uri: logo.uri }} style={styles.logo} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoFallback]}>
                  <Text style={styles.logoLetter}>
                    {name.trim().slice(0, 1).toUpperCase() || '•'}
                  </Text>
                </View>
              )}
              <Pressable onPress={handlePickLogo} hitSlop={8}>
                <Text style={styles.changeLogo}>CHANGE LOGO</Text>
              </Pressable>
            </View>
            <Field
              label="COMMUNITY NAME"
              placeholder="Lagos Operations"
              value={name}
              onChangeText={setName}
            />
            <Field
              label="WEBSITE (OPTIONAL)"
              placeholder="https://company.com"
              autoCapitalize="none"
              value={website}
              onChangeText={setWebsite}
            />
            <Field
              label="COMMUNITY PHONE NUMBER"
              placeholder="+234 800 000 0000"
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={phone}
              onChangeText={setPhone}
            />
            <Field
              label="ABOUT THE COMMUNITY"
              placeholder="What is this community for?"
              multiline
              numberOfLines={4}
              value={about}
              onChangeText={setAbout}
            />
            <Field
              label="CONTACT EMAIL (OPTIONAL)"
              placeholder="hello@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label="WORK EMAIL DOMAIN (OPTIONAL)"
              placeholder="company.com"
              autoCapitalize="none"
              value={domain}
              onChangeText={setDomain}
            />
            <Subtext>
              Staff with an address on this domain can join by verifying
              their work email.
            </Subtext>
            <Field
              label="COMMUNITY RULES (OPTIONAL, 1000 MAX)"
              placeholder="Be kind, stay on topic…"
              multiline
              numberOfLines={6}
              value={rules}
              onChangeText={(text) => setRules(text.slice(0, 1000))}
            />
            <Subtext>
              {rules.trim().length}/1000 characters
              {rules.trim() ? '' : ' — leave empty for no rules.'}
            </Subtext>
            <ErrorText message={error} />
            <Button title="Save changes" loading={loading} onPress={handleSave} />
            <Text style={styles.label}>BANK ACCOUNT FOR DUES</Text>
            <Subtext>Members pay here by transfer, then tap I&apos;ve paid.</Subtext>
            <Field
              label="BANK"
              placeholder="GTBank"
              value={bank}
              onChangeText={setBank}
            />
            <Field
              label="ACCOUNT NUMBER"
              placeholder="0123456789"
              keyboardType="number-pad"
              maxLength={10}
              value={bankNumber}
              onChangeText={setBankNumber}
            />
            <Field
              label="ACCOUNT NAME"
              placeholder="Lagos Operations"
              value={bankName}
              onChangeText={setBankName}
            />
            {bankSaved ? <Subtext>Bank details saved.</Subtext> : null}
            <Button
              title="Save bank details"
              variant="outline"
              loading={bankLoading}
              onPress={handleSaveBank}
            />
          </>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 72, height: 72, borderRadius: 36 },
  logoFallback: {
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { fontSize: 28, fontWeight: '800', color: c.paper },
  changeLogo: { fontSize: 13, fontWeight: '800', color: c.primary },
});
}
