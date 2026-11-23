import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  endCallSignal,
  getActiveCall,
  getRoomCall,
  subscribeToAllCallSignals,
  type CallSignal,
} from '../lib/calls';
import { getConversationTitle, getDmPeerInfo } from '../lib/chat';
import { getOpenConversation } from '../lib/openChat';
import {
  getMeeting,
  isCommunityMember,
  listMeetingMembers,
  type MeetingDetail,
} from '../lib/communityContent';
import { useRingtone } from '../lib/ringtone';
import { supabase } from '../lib/supabase';

type Invite = {
  signal: CallSignal;
  meeting: MeetingDetail | null;
  title: string;
  subtitle: string | null;
  kicker: string;
};

/**
 * Global incoming-call popup. Mounted once in the root layout, it
 * listens for room call rows wherever the user is in the app and rings the
 * invited members with a Join / Decline card.
 */
export function IncomingCallOverlay() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [invite, setInvite] = useState<Invite | null>(null);
  useRingtone(invite !== null);
  const handled = useRef<Set<string>>(new Set());
  const joiningRef = useRef(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;

    async function watch(myId: string) {
      if (!alive) return;
      unsub?.();
      unsub = subscribeToAllCallSignals(
        async (signal) => {
          if (!alive) return;
          if (signal.startedBy === myId) return;
          if (handled.current.has(signal.id)) return;
          // Inside this exact thread the banner owns the ring: never
          // double-ring with two players at once.
          if (
            signal.scope === 'chat' &&
            getOpenConversation() === signal.refId
          ) {
            return;
          }
          try {
            if (signal.scope !== 'room') {
              const title = await getConversationTitle(signal.refId).catch(
                () => 'Chat',
              );
              if (!alive || handled.current.has(signal.id)) return;
              setInvite({
                signal,
                meeting: null,
                title,
                subtitle: null,
                kicker: 'INCOMING CALL',
              });
              return;
            }
            const [meeting, members] = await Promise.all([
              getMeeting(signal.refId),
              listMeetingMembers(signal.refId),
            ]);
            if (!alive || !meeting) return;
            if (members.length === 0) {
              // General room: ring every active community member.
              if (!meeting.community_id) return;
              const active = await isCommunityMember(
                meeting.community_id,
              ).catch(() => false);
              if (!alive || !active) return;
            } else if (!members.some((m) => m.userId === myId)) {
              return;
            }
            if (handled.current.has(signal.id)) return;
            setInvite({
              signal,
              meeting,
              title: meeting.name,
              subtitle: meeting.communityName,
              kicker: 'INCOMING MEETING CALL',
            });
          } catch {
            // A failed lookup must never ring a wrong room.
          }
        },
        (signalId) => {
          handled.current.delete(signalId);
          setInvite((prev) => (prev?.signal.id === signalId ? null : prev));
        },
      );
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void watch(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        unsub?.();
        unsub = null;
        handled.current.clear();
        setInvite(null);
      } else if (
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
        session?.user
      ) {
        void watch(session.user.id);
      }
    });
    return () => {
      alive = false;
      unsub?.();
      listener.subscription.unsubscribe();
    };
  }, []);

  // Realtime can drop: while an invite card is up, re-check the
  // signal row so a cancelled call stops ringing by itself.
  useEffect(() => {
    if (!invite) return;
    const refId = invite.signal.refId;
    const signalId = invite.signal.id;
    const isRoom = invite.signal.scope === 'room';
    const timer = setInterval(async () => {
      const row = isRoom
        ? await getRoomCall(refId).catch(() => invite.signal)
        : await getActiveCall(refId).catch(() => invite.signal);
      if (!row) {
        handled.current.add(signalId);
        setInvite(null);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [invite]);

  function dismiss() {
    if (!invite) return;
    const current = invite;
    handled.current.add(current.signal.id);
    setInvite(null);
    if (current.signal.scope === 'chat') {
      void getDmPeerInfo(current.signal.refId)
        .then((peer) => {
          if (!peer.isGroup) {
            return endCallSignal(current.signal.refId);
          }
          return undefined;
        })
        .catch(() => {});
    }
  }

  function join() {
    if (!invite || joiningRef.current) return;
    joiningRef.current = true;
    handled.current.add(invite.signal.id);
    const { signal } = invite;
    setInvite(null);
    setTimeout(() => {
      joiningRef.current = false;
    }, 1000);
    if (signal.scope === 'room') {
      router.push({
        pathname: '/call/[id]',
        params: { id: signal.refId, scope: 'room', media: signal.media },
      } as never);
      return;
    }
    router.push({
      pathname: '/call/[id]',
      params: { id: signal.refId, media: signal.media },
    } as never);
  }

  return (
    <Modal
      visible={invite !== null}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.ring}>
            <Ionicons
              name={invite?.signal.media === 'voice' ? 'call' : 'videocam'}
              size={30}
              color={c.paper}
            />
          </View>
          <Text style={styles.kicker}>
            {invite?.kicker ?? 'INCOMING CALL'}
          </Text>
          <Text style={styles.name} numberOfLines={2}>
            {invite?.title ?? 'Call'}
          </Text>
          {invite?.subtitle ? (
            <Text style={styles.community} numberOfLines={1}>
              {invite.subtitle}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.decline]}
              onPress={dismiss}
              accessibilityLabel="Decline call"
            >
              <Ionicons name="call" size={22} color={c.paper} />
              <Text style={styles.btnText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.join]}
              onPress={join}
              accessibilityLabel="Join call"
            >
              <Ionicons
                name={
                  invite?.signal.media === 'voice' ? 'call' : 'videocam'
                }
                size={22}
                color={c.paper}
              />
              <Text style={styles.btnText}>Join</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: c.paper,
    borderRadius: radius.l,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
  },
  community: { fontSize: 13, color: c.subtext },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  decline: { backgroundColor: c.danger },
  join: { backgroundColor: c.primary },
  btnText: { fontSize: 15, fontWeight: '800', color: c.paper },
});
}
