import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { bustCommunityCache } from '../../lib/communities';
import { setSelectedCommunityId } from '../../lib/selectedCommunity';
import { supabase } from '../../lib/supabase';

export default function JoinCommunity() {
  const { code: codeParam, email: emailParam } = useLocalSearchParams<{ code?: string; email?: string }>();
  const [code, setCode] = useState(
    typeof codeParam === 'string' ? codeParam : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [joinedActive, setJoinedActive] = useState(false);
  const autoTried = useRef(false);

  async function joinWith(raw: string) {
    setError(null);
    if (raw.trim().length < 4) {
      setError('Enter the invite code from your admin.');
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');
      const { data, error: rpcError } = await supabase.rpc(
        'join_community_by_code',
        { p_code: raw.trim() },
      );
      if (rpcError) throw rpcError;
      bustCommunityCache();
      const { data: membership } = await supabase
        .from('community_members')
        .select('status')
        .eq('community_id', data)
        .eq('user_id', user.id)
        .single();
      if (membership?.status === 'active' && data) {
        setSelectedCommunityId(String(data));
      }
      setJoinedActive(membership?.status === 'active');
      setDone(
        membership?.status === 'active'
          ? 'You are now a member. Your chats, posts and updates are waiting.'
          : 'Your request is with the admins. We will let you in as soon as they approve you.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
    } finally {
      setLoading(false);
    }
  }

  function handleJoin() {
    void joinWith(code);
  }

  // Invite links land here with a code: join immediately instead of
  // making the user tap through.
  useEffect(() => {
    if (
      !autoTried.current &&
      typeof codeParam === 'string' &&
      codeParam.trim().length >= 4
    ) {
      autoTried.current = true;
      void joinWith(codeParam);
    }
  }, [codeParam]);

  return (
    <>
      <ScreenHeader title="JOIN COMMUNITY" />
      <Screen>
        {done ? (
          <>
            <Heading>{joinedActive ? "You're in" : 'Request sent'}</Heading>
            <Subtext>{done}</Subtext>
            {joinedActive ? (
              <Button
                title="View my teams"
                onPress={() => router.replace('/teams')}
              />
            ) : (
              <Button
                title="Back home"
                onPress={() => router.replace('/feed')}
              />
            )}
          </>
        ) : (
          <>
            <Heading>Join a community</Heading>
            <Subtext>
              Enter the invite code shared by your community admin.
            </Subtext>
            {typeof emailParam === 'string' && emailParam ? (
              <Subtext>
                Verified {emailParam} — this community also needs its invite code.
              </Subtext>
            ) : null}
            <Field
              label="INVITE CODE"
              placeholder="a1b2c3d4"
              autoCapitalize="none"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
            />
            <ErrorText message={error} />
            <Button title="Join" loading={loading} onPress={handleJoin} />
            <Button
              title="Scan QR instead"
              variant="outline"
              onPress={() => router.push('/community/scan')}
            />
            <Button
              title="Browse public communities"
              variant="outline"
              onPress={() => router.push('/community/discover')}
            />
            <Button
              title="Join with a work email"
              variant="outline"
              onPress={() => router.push('/community/join-email')}
            />
          </>
        )}
      </Screen>
    </>
  );
}
