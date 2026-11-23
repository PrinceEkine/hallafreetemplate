import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { listMyCommunities } from '../../lib/communities';
import { isCommunityAdmin } from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { createDue } from '../../lib/wallet';

export default function NewDue() {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const scoped = await resolveSelectedCommunityId().catch(() => null);
      setCommunityId(scoped);
      if (scoped) {
        const mine = await listMyCommunities().catch((): never[] => []);
        setCommunityName(mine.find((c) => c.id === scoped)?.name ?? '');
        setAdmin(await isCommunityAdmin(scoped).catch(() => false));
      }
      setReady(true);
    })();
  }, []);

  async function handleCreate() {
    setError(null);
    if (!communityId) {
      setError('Join or create a community first, then come back.');
      return;
    }
    if (!admin) {
      setError('Only community admins can create dues.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Give the due a title.');
      return;
    }
    const naira = Math.floor(Number(amount.replace(/[^0-9.]/g, '')));
    if (!Number.isFinite(naira) || naira <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setLoading(true);
    try {
      await createDue(communityId, title, naira * 100);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create due.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW DUE" />
      <Screen>
        <Heading>New community due</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !communityId ? (
          <Subtext>
            Join or create a community first, then come back to create a due.
          </Subtext>
        ) : !admin ? (
          <Subtext>
            Only community admins can create dues. Ask a community admin to
            create this for you.
          </Subtext>
        ) : (
          <>
            {communityName ? (
              <Subtext>Creating in {communityName}</Subtext>
            ) : null}
            <Field
              label="TITLE"
              placeholder="Security Fee"
              value={title}
              onChangeText={setTitle}
            />
            <Field
              label="AMOUNT (₦)"
              placeholder="2000"
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <ErrorText message={error} />
            <Button title="Create due" loading={loading} onPress={handleCreate} />
          </>
        )}
      </Screen>
    </>
  );
}
