import { Ionicons } from '@expo/vector-icons';
import { ensureCallPermissions } from '../../lib/permissions';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius } from '../../constants/theme';

// Fixed dark call UI by design: calls stay dark in both themes.
import {
  channelForConversation,
  channelForRoom,
  deleteMyPresence,
  endCallSignal,
  getActiveCall,
  getCallPresence,
  getCallToken,
  getRoomCall,
  markCallAnswered,
  subscribeToCallPresence,
  subscribeToCallSignals,
  subscribeToRoomSignals,
  upsertMyPresence,
  type CallMedia,
  type CallPresence,
} from '../../lib/calls';
import {
  getConversationTitle,
  getDmPeerInfo,
  logAnsweredCall,
  logMissedCall,
} from '../../lib/chat';
import { getMeeting } from '../../lib/communityContent';
import { startCallKeepalive, stopCallKeepalive } from '../../lib/callKeepalive';
import { getMyAvatarUrl, publicUrl } from '../../lib/uploads';
import { withTimeout } from '../../lib/net';

import { useRingtone } from '../../lib/ringtone';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  clearMinimizedRoom,
  getLiveEngine,
  getMinimizedRoom,
  isMinimizedRoom,
  setLiveEngine,
  setMinimizedRoom,
} from '../../lib/minimizedCall';

/**
 * Voice/video calls over Agora RTC. The chat thread inserts a call_signals
 * row (which fans out an incoming-call push) before navigating here; leaving
 * this screen deletes the row and ends the call for everyone.
 *
 * Meeting rooms pass scope=room: joining never ends the meeting — members
 * trickle in and out while the row stays live until an admin (or the
 * starter) ends it from the meetings list.
 *
 * The Agora native module only exists in EAS dev/production builds — under
 * Expo Go the screen explains that instead of crashing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = any;

let AgoraModule: {
  createAgoraRtcEngine?: () => AnyEngine;
  RtcSurfaceView?: React.ComponentType<{ canvas: object; style?: object }>;
  ChannelProfileType?: { ChannelProfileCommunication: number };
  ClientRoleType?: { ClientRoleBroadcaster: number };
  VideoSourceType?: {
    VideoSourceCameraPrimary: number;
    VideoSourceRemote: number;
  };
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AgoraModule = require('react-native-agora');
} catch {
  AgoraModule = null;
}

function CallScreen() {
  const { id, media, scope } = useLocalSearchParams<{
    id?: string;
    media?: CallMedia;
    scope?: string;
  }>();
  const demo = !isSupabaseConfigured();
  const isRoom = scope === 'room';
  // Effective media: the route param first, corrected by the live signal
  // row when it arrives (push taps carry no media of their own).
  const [callMedia, setCallMedia] = useState<CallMedia>(
    media === 'voice' ? 'voice' : 'video',
  );
  const wantVideo = callMedia !== 'voice';
  // Rooms join audio-first but can always upgrade: camera and share
  // stay available there even on a voice row.
  const canVideo = wantVideo || isRoom;
  const [title, setTitle] = useState('Call');
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(media === 'voice');
  const [speaker, setSpeaker] = useState(media !== 'voice');
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [featured, setFeatured] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [amStarter, setAmStarter] = useState(true);
  const [callGroup, setCallGroup] = useState<boolean | null>(null);
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [presence, setPresence] = useState<CallPresence[]>([]);
  const [selfUid, setSelfUid] = useState<number | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<number[]>([]);
  const [remoteVideoOff, setRemoteVideoOff] = useState<Record<number, boolean>>({});
  const speakersKeyRef = useRef('');
  // Only the starter hears ringback, until someone answers; rooms never
  // ring here (the incoming-call popup already rang for them), and neither
  // does anyone joining an active call.
  useRingtone(
    !demo && !isRoom && amStarter && !answered && !error && status !== 'Ended',
  );
  // One-to-one calls ring: the starter sees Calling, the joiner Ringing.
  // Group and meeting calls wait for the room to fill instead.
  const [waitingLabel, setWaitingLabel] = useState('Waiting for others…');
  const engineRef = useRef<AnyEngine | null>(null);
  const releasedEnginesRef = useRef<WeakSet<object>>(new WeakSet());
  const channelRef = useRef('');
  const joinedRef = useRef(false);
  const idRef = useRef(id);
  idRef.current = id;
  const roomRef = useRef(isRoom);
  roomRef.current = isRoom;
  // Missed-call logging: a 1-1 call I started, joined, and hung up with
  // nobody ever joining leaves a "Missed call" message in the chat.
  const starterRef = useRef<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const groupRef = useRef(true);
  const signalMediaRef = useRef<CallMedia | null>(null);
  const hadPeersRef = useRef(false);
  const mediaRef = useRef<CallMedia>(callMedia);
  mediaRef.current = callMedia;
  const userToggledVideoRef = useRef(false);

  const leavingRef = useRef(false);
  const secondsRef = useRef(0);
  secondsRef.current = seconds;
  const uidRef = useRef<number | null>(null);
  const markedRef = useRef(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const videoOffRef = useRef(videoOff);
  videoOffRef.current = videoOff;

  const safeTeardownEngine = useCallback((eng: AnyEngine | null) => {
    if (!eng || releasedEnginesRef.current.has(eng)) return;
    releasedEnginesRef.current.add(eng);
    try {
      if (joinedRef.current) {
        joinedRef.current = false;
        try {
          eng.leaveChannel();
        } catch {
          // Already left.
        }
      }
      try {
        eng.unregisterEventHandler?.();
      } catch {
        // No handler registry.
      }
      eng.release?.();
    } catch {
      // Tearing down.
    }
  }, []);

  // Ending is instant: the channel drops and the screen exits on tap.
  // History + signal cleanup chase in the background with bounded
  // retries, so a slow network never traps the user on a dead call.
  // Chat calls end for everyone on leave; room calls stay live so the
  // meeting survives members coming and going.
  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    clearMinimizedRoom();
    setLiveEngine(null);
    const refId = idRef.current;
    const room = roomRef.current;
    const joined = joinedRef.current;
    setStatus('Ended');
    const engine = engineRef.current;
    engineRef.current = null;
    safeTeardownEngine(engine);
    stopCallKeepalive();
    if (refId && !demo) {
      void (async () => {
        await deleteMyPresence(room ? 'room' : 'chat', refId).catch(() => {});
        if (room) return;
        const starterLeft =
          joined &&
          !groupRef.current &&
          starterRef.current &&
          starterRef.current === myIdRef.current;
        const mediaNow = signalMediaRef.current ?? mediaRef.current;
        if (starterLeft && !hadPeersRef.current) {
          await logMissedCall(refId, mediaNow).catch(() => {});
        } else if (starterLeft && hadPeersRef.current) {
          await logAnsweredCall(refId, mediaNow, secondsRef.current).catch(
            () => {},
          );
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await withTimeout(endCallSignal(refId), 8000);
            break;
          } catch {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      })();
    }
    router.back();
  }, [demo, safeTeardownEngine]);
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  /** The other side hung up: same teardown as leaving, then exit. */
  const remoteEnd = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    clearMinimizedRoom();
    setLiveEngine(null);
    const refId = idRef.current;
    const joined = joinedRef.current;
    try {
      const engine = engineRef.current;
      engineRef.current = null;
      safeTeardownEngine(engine);
    } finally {
      // I started a 1-1 call: missed when nobody joined, logged with its
      // duration when they did.
      if (
        refId &&
        !demo &&
        joined &&
        !groupRef.current &&
        starterRef.current &&
        starterRef.current === myIdRef.current
      ) {
        if (!hadPeersRef.current) {
          void logMissedCall(
            refId,
            signalMediaRef.current ?? mediaRef.current,
          ).catch(() => {});
        } else {
          void logAnsweredCall(
            refId,
            signalMediaRef.current ?? mediaRef.current,
            secondsRef.current,
          ).catch(() => {});
        }
      }
      stopCallKeepalive();
      setStatus('Ended');
      setTimeout(() => router.back(), 1200);
    }
  }, [demo, safeTeardownEngine]);
  const remoteEndRef = useRef(remoteEnd);
  remoteEndRef.current = remoteEnd;

  useEffect(() => {
    if (!id || demo) return;
    if (!AgoraModule?.createAgoraRtcEngine) {
      setError(
        'Voice and video calls need the native app build (EAS dev or production). This Expo Go preview cannot load the calling engine.',
      );
      setStatus('Unavailable here');
      return;
    }
    // Hold audio from the moment the screen opens — ringing included —
    // so minimizing never drops the call. Every exit path stops it.
    startCallKeepalive();
    // Returning from the mini bar remounts: drop the bar for this room.
    clearMinimizedRoom(id);
    let cancelled = false;
    let engine: AnyEngine | null = null;
    (async () => {
      try {
        // Native builds kill the process when the engine touches hardware
        // without a grant — hold mic/camera (plus notifications for
        // incoming calls) before anything else. Denial parks here.
        // Resolve the true call media from the live signal row first: some
        // entries (notification taps) carry no media of their own, and the
        // permission + engine decisions below depend on it.
        let liveMedia: CallMedia = media === 'voice' ? 'voice' : 'video';
        if (isRoom) {
          const [room, signal] = await Promise.all([
            getMeeting(id).catch(() => null),
            getRoomCall(id).catch(() => null),
          ]);
          if (cancelled) return;
          if (room) setTitle(room.name);
          setCallGroup(true);
          if (signal) {
            starterRef.current = signal.startedBy;
            signalMediaRef.current = signal.media;
            liveMedia = signal.media;
            setCallMedia(signal.media);
            setVideoOff(signal.media === 'voice');
            setSpeaker(signal.media !== 'voice');
          }
        } else {
          const [name, signal, peer, session] = await Promise.all([
            getConversationTitle(id).catch(() => 'Chat'),
            getActiveCall(id).catch(() => null),
            getDmPeerInfo(id).catch(() => null),
            supabase.auth.getUser().catch(() => null),
          ]);
          if (cancelled) return;
          setTitle(name);
          const group = peer?.isGroup !== false;
          groupRef.current = group;
          setCallGroup(group);
          const myId =
            (session as { data?: { user?: { id?: string } } } | null)?.data
              ?.user?.id ?? null;
          myIdRef.current = myId;
          starterRef.current = signal?.startedBy ?? null;
          signalMediaRef.current = signal?.media ?? null;
          if (peer && !peer.isGroup && peer.peerAvatar) {
            setPeerAvatarUrl(publicUrl('avatars', peer.peerAvatar));
          }
          if (signal) {
            liveMedia = signal.media;
            setCallMedia(signal.media);
            setVideoOff(signal.media === 'voice');
            setSpeaker(signal.media !== 'voice');
          }
          if (!group && signal && myId) {
            const starter = signal.startedBy === myId;
            setAmStarter(starter);
            setWaitingLabel(starter ? 'Calling…' : 'Ringing…');
          } else if (!group) {
            setWaitingLabel('Calling…');
          }
        }
        if (cancelled) return;
        const video = liveMedia !== 'voice';
        mediaRef.current = liveMedia;
        videoOffRef.current = !video;
        const { mic: micOk, camera: camOk } = await ensureCallPermissions(
          video,
        ).catch(() => ({ mic: false, camera: false }));
        if (cancelled) return;
        if (!micOk) {
          setError(
            'Ophixe needs microphone access to place calls. Allow it in system settings, then rejoin.',
          );
          setStatus('Blocked');
          return;
        }
        if (!camOk) {
          setError(
            'Ophixe needs camera access for video calls. Allow it in system settings, then rejoin.',
          );
          setStatus('Blocked');
          return;
        }
        // Titles, labels, and media resolved above, before permissions.
        const channel = isRoom
          ? channelForRoom(id)
          : channelForConversation(id);
        channelRef.current = channel;
        const { token, uid, appId } = await getCallToken(channel);
        if (cancelled) return;
        // Returning from the mini bar: the engine never left this room,
        // so rebind to it instead of joining twice (a duplicate join
        // comes back rejected as engine error -17).
        const parked = getMinimizedRoom();
        const reattach =
          !!parked && parked.roomId === id && parked.joined === true;
        engine =
          (reattach ? (getLiveEngine() as AnyEngine | null) : null) ??
          AgoraModule!.createAgoraRtcEngine!();
        engineRef.current = engine;
        setLiveEngine(engine);
        if (!reattach) {
          engine.initialize({ appId });
        }
        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            joinedRef.current = true;
            if (!cancelled) setStatus('Connected');
            startCallKeepalive();
          },
          onUserJoined: (_conn: unknown, remoteUid: number) => {
            setPeers((prev) =>
              prev.includes(remoteUid) ? prev : [...prev, remoteUid],
            );
          },
          onUserOffline: (_conn: unknown, remoteUid: number) => {
            setPeers((prev) => prev.filter((u) => u !== remoteUid));
            setRemoteVideoOff((prev) => {
              if (!(remoteUid in prev)) return prev;
              const next = { ...prev };
              delete next[remoteUid];
              return next;
            });
          },
          onUserMuteVideo: (_conn: unknown, remoteUid: number, isMuted: boolean) => {
            if (!cancelled) {
              setRemoteVideoOff((prev) => ({ ...prev, [remoteUid]: isMuted }));
            }
          },
          onRemoteVideoStateChanged: (
            _conn: unknown,
            remoteUid: number,
            state: number,
          ) => {
            // RemoteVideoState: 0 = stopped, 2 = decoding.
            if (!cancelled && (state === 0 || state === 2)) {
              setRemoteVideoOff((prev) => ({
                ...prev,
                [remoteUid]: state === 0,
              }));
            }
          },
          onTokenPrivilegeWillExpire: () => {
            void getCallToken(channel)
              .then((fresh) => {
                if (!cancelled) engineRef.current?.renewToken?.(fresh.token);
              })
              .catch(() => {});
          },
          onError: (err: unknown) => {
            if (!cancelled) {
              setError(`Call error (${String(err)}).`);
            }
          },
          onAudioVolumeIndication: (
            _conn: unknown,
            volumes: unknown,
          ) => {
            // Local uid arrives as 0; only re-render when the set changes.
            const mine = uidRef.current;
            const live = Array.isArray(volumes) ? volumes : [];
            const active = live
              .map((s) => {
                const rec = s as { uid?: unknown; volume?: unknown };
                const uid =
                  typeof rec.uid === 'number' && rec.uid !== 0
                    ? rec.uid
                    : (mine ?? -1);
                return typeof rec.volume === 'number' && rec.volume > 5
                  ? uid
                  : -1;
              })
              .filter((uid) => uid >= 0);
            const key = [...new Set(active)].sort((a, b) => a - b).join(',');
            if (key !== speakersKeyRef.current) {
              speakersKeyRef.current = key;
              if (!cancelled) {
                setSpeakers(
                  key ? key.split(',').map((n) => Number(n)) : [],
                );
              }
            }
          },
          onConnectionStateChanged: (_conn: unknown, state: unknown) => {
            // ConnectionStateType: 3 = connected, 4 = reconnecting, 5 = failed.
            if (cancelled) return;
            const s = Number(state);
            if (s === 3) {
              setError(null);
              setStatus('Connected');
            } else if (s === 4) {
              setStatus('Reconnecting…');
            } else if (s === 5) {
              setError(
                'Call connection failed — check your network and rejoin.',
              );
              setStatus('Failed');
            }
          },
        });
        const profiles = AgoraModule!.ChannelProfileType;
        if (profiles) {
          engine.setChannelProfile(
            profiles.ChannelProfileCommunication,
          );
        }
        if (video) {
          engine.enableVideo();
          try {
            // 360p keeps calls smooth on poor networks; the default
            // 540p stutters on the low-end links our users have.
            engine.setVideoEncoderConfiguration?.({
              dimensions: { width: 640, height: 360 },
              frameRate: 15,
            });
          } catch {
            // Older engines keep defaults.
          }
          engine.startPreview();
        } else {
          engine.enableAudio();
        }
        // Fresh mutes every call: mute flags persist on the shared
        // engine, so a camera muted in a previous call would otherwise
        // publish nothing here while the local preview looks fine.
        try {
          engine.muteLocalAudioStream(mutedRef.current);
          engine.muteLocalVideoStream(!video || videoOffRef.current);
        } catch {
          // Engine gone.
        }
        engine.setEnableSpeakerphone(video);
        const roles = AgoraModule!.ClientRoleType;
        const joinRc: unknown = reattach
          ? 0
          : engine.joinChannel(token, channel, uid, {
              clientRoleType: roles?.ClientRoleBroadcaster ?? 1,
            });
        if (typeof joinRc === 'number' && joinRc !== 0 && joinRc !== -17) {
          throw new Error(
            `Could not join the call (engine error ${joinRc}).`,
          );
        }
        if (reattach || joinRc === -17) {
          // Already inside: a rejected duplicate join still means the
          // engine is in the channel, so carry on connected.
          joinedRef.current = true;
          if (!cancelled) setStatus('Connected');
          startCallKeepalive();
        }
        uidRef.current = uid;
        setSelfUid(uid);
        try {
          engine.enableAudioVolumeIndication?.(300, 3, false);
        } catch {
          // Volume indication is cosmetic.
        }
        void getMyAvatarUrl()
          .then((url) => {
            if (!cancelled) setMyAvatar(url);
          })
          .catch(() => {});
        // Returning to a minimized room: repopulate peers from presence
        // (join events do not refire for members already inside).
        void getCallPresence(isRoom ? 'room' : 'chat', id)
          .then((flags) => {
            if (cancelled) return;
            const others = flags
              .map((f) => f.agoraUid)
              .filter((u) => u !== uid);
            if (others.length > 0) {
              hadPeersRef.current = true;
              setAnswered(true);
              setPeers((prev) => [...new Set([...prev, ...others])]);
            }
          })
          .catch(() => {});
        void upsertMyPresence(isRoom ? 'room' : 'chat', id, uid, {
          muted: mutedRef.current,
          sharing: false,
        }).catch(() => {});
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not join.');
          setStatus('Failed');
        }
      }
    })();
    return () => {
      cancelled = true;
      // A minimized room keeps its engine joined behind the mini bar.
      if (isMinimizedRoom(id)) return;
      setLiveEngine(null);
      safeTeardownEngine(engine);
      engineRef.current = null;
      stopCallKeepalive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, demo]);

  useEffect(() => {
    if (peers.length > 0) {
      hadPeersRef.current = true;
      setAnswered(true);
      if (id && !demo && !markedRef.current) {
        markedRef.current = true;
        void markCallAnswered(
          isRoom ? { meetingId: id } : { conversationId: id },
        );
      }
    }
    if (status !== 'Connected' || peers.length === 0) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status, peers.length, id, demo, isRoom]);

  // The meeting ended under us: leave the channel instead of idling alone.
  useEffect(() => {
    if (!id || demo || !isRoom) return;
    return subscribeToRoomSignals(id, (signal) => {
      if (!signal) {
        void leaveRef.current();
        return;
      }
      starterRef.current = signal.startedBy;
      signalMediaRef.current = signal.media;
      if (!userToggledVideoRef.current) {
        setCallMedia(signal.media);
        setVideoOff(signal.media === 'voice');
      }
    });
  }, [id, demo, isRoom]);

  // A 1-1/group call the other side ended: tear down and exit instead of
  // idling on a dead channel. Ending truly ends it for everyone now.
  // A late-arriving row also heals labels when the mount fetch raced it.
  useEffect(() => {
    if (!id || demo || isRoom) return;
    return subscribeToCallSignals(id, (signal) => {
      if (!signal) {
        if (!leavingRef.current) void remoteEndRef.current();
        return;
      }
      starterRef.current = signal.startedBy;
      signalMediaRef.current = signal.media;
      if (!userToggledVideoRef.current) {
        setCallMedia(signal.media);
        setVideoOff(signal.media === 'voice');
      }
      const myId = myIdRef.current;
      if (!groupRef.current && myId) {
        const starter = signal.startedBy === myId;
        setAmStarter(starter);
        setWaitingLabel(starter ? 'Calling…' : 'Ringing…');
      }
    });
  }, [id, demo, isRoom]);

  // Realtime can drop on flaky networks: while the call screen is up,
  // re-check the signal row every 5s so a hung-up call exits itself
  // instead of idling on a dead channel. Read failures never end a
  // call — only a confirmed-gone row does.
  useEffect(() => {
    if (!id || demo) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (leavingRef.current) return;
      if (Date.now() - started < 12000) return;
      void (async () => {
        try {
          const row = isRoom
            ? await getRoomCall(id).catch(() => 'unknown')
            : await getActiveCall(id).catch(() => 'unknown');
          if (row === 'unknown' || row || leavingRef.current) return;
          if (isRoom) leaveRef.current();
          else void remoteEndRef.current();
        } catch {
          // A failed check must never end a live call.
        }
      })();
    }, 5000);
    return () => clearInterval(timer);
  }, [id, demo, isRoom]);

  // Live mute/share flags for mute badges and the single-sharer lock.
  useEffect(() => {
    if (!id || demo) return;
    return subscribeToCallPresence(isRoom ? 'room' : 'chat', id, setPresence);
  }, [id, demo, isRoom]);

  // Unanswered calls end by themselves: 45s of ringing with nobody
  // joining hangs up, logs the miss on the starter side, and exits —
  // instead of ringing forever. Rooms are exempt: meetings wait.
  useEffect(() => {
    if (demo || isRoom || answered || error || status === 'Ended') return;
    const timer = setTimeout(() => {
      if (leavingRef.current) return;
      setStatus('Ended');
      setTimeout(() => void leaveRef.current(), 1200);
    }, 45000);
    return () => clearTimeout(timer);
  }, [demo, isRoom, answered, error, status]);

  // Minimized calls keep audio but pause the camera: the OS may reclaim
  // it while backgrounded, and nobody watches a backgrounded preview.
  // Screen shares are exempt — sharing happens outside the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const engine = engineRef.current;
      if (!engine || sharing) return;
      try {
        if (state !== 'active' && wantVideo && !videoOff) {
          engine.muteLocalVideoStream(true);
        } else if (state === 'active' && wantVideo && !videoOff) {
          engine.muteLocalVideoStream(false);
        }
      } catch {
        // Engine gone.
      }
    });
    return () => sub.remove();
  }, [wantVideo, videoOff, sharing]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      engineRef.current?.muteLocalAudioStream(next);
    } catch {
      // Engine unavailable.
    }
    if (id && !demo && uidRef.current !== null) {
      void upsertMyPresence(isRoom ? 'room' : 'chat', id, uidRef.current, {
        muted: next,
      }).catch(() => {});
    }
  }

  function toggleVideo() {
    userToggledVideoRef.current = true;
    const next = !videoOff;
    setVideoOff(next);
    // A voice room upgrades to video the moment the camera turns on.
    if (!next) setCallMedia('video');
    try {
      const engine = engineRef.current;
      if (!engine) return;
      if (next) {
        engine.muteLocalVideoStream(true);
        engine.stopPreview();
        if (!sharing) {
          engine.updateChannelMediaOptions?.({ publishCameraTrack: false });
        }
      } else {
        engine.enableVideo();
        engine.setVideoEncoderConfiguration?.({
          dimensions: { width: 640, height: 360 },
          frameRate: 15,
        });
        engine.startPreview();
        engine.muteLocalVideoStream(false);
        if (!sharing) {
          engine.updateChannelMediaOptions?.({ publishCameraTrack: true });
        }
      }
    } catch {
      // Engine unavailable.
    }
  }

  function toggleSpeaker() {
    const next = !speaker;
    setSpeaker(next);
    try {
      engineRef.current?.setEnableSpeakerphone(next);
    } catch {
      // Engine unavailable.
    }
  }

  function switchCamera() {
    try {
      engineRef.current?.switchCamera();
    } catch {
      // Engine unavailable.
    }
  }

  async function toggleShare() {
    const engine = engineRef.current;
    if (!engine || !id || demo) return;
    // iOS screen sharing needs a ReplayKit broadcast extension, which Expo
    // managed builds cannot ship — Android only for now.
    if (Platform.OS !== 'android') {
      setError(
        'Screen sharing works on Android for now. iOS needs a custom native build with a broadcast extension.',
      );
      return;
    }
    try {
      if (sharing) {
        engine.stopScreenCapture();
        try {
          engine.updateChannelMediaOptions?.({
            publishScreenCaptureVideo: false,
            publishCameraTrack: wantVideo && !videoOff,
          });
        } catch {
          // Older engines keep defaults.
        }
        setSharing(false);
        if (uidRef.current !== null) {
          await upsertMyPresence(isRoom ? 'room' : 'chat', id, uidRef.current, {
            sharing: false,
          }).catch(() => {});
        }
        return;
      }
      // One sharer at a time: anyone already sharing blocks the attempt.
      const other = presence.find(
        (p) => p.sharing && p.agoraUid !== uidRef.current,
      );
      if (other) {
        setError(`${other.name} is already sharing.`);
        return;
      }
      if (uidRef.current === null) {
        setError('Join the call first, then share.');
        return;
      }
      // Sharing is video: a voice room upgrades so the stage renders it.
      setCallMedia('video');
      // The video module may never have started on an audio-first join:
      // without this the capture runs but nobody can see a thing.
      try {
        engine.enableVideo();
        engine.muteLocalVideoStream(false);
      } catch {
        // Engine unavailable.
      }
      try {
        await upsertMyPresence(isRoom ? 'room' : 'chat', id, uidRef.current, {
          sharing: true,
        });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code ?? '';
        if (code === '23505' || /already|duplicate|unique/i.test(String((err as Error | null)?.message ?? err))) {
          setError('Someone just started sharing. Try again later.');
        } else {
          setError(err instanceof Error ? err.message : 'Could not share screen.');
        }
        return;
      }
      try {
        // Both calls answer with codes, not throws: check them, or a
        // dead capture looks shared while viewers see nothing.
        const startRc: unknown = engine.startScreenCapture({
          captureVideo: true,
          captureAudio: true,
          videoParams: {
            width: 1280,
            height: 720,
            frameRate: 15,
            bitrate: 1500,
          },
        });
        if (typeof startRc === 'number' && startRc !== 0) {
          throw new Error(
            `Could not start screen capture (engine error ${startRc}).`,
          );
        }
        // Capture alone publishes nothing: switch the published track from
        // camera to screen or nobody sees anything.
        const switchRc: unknown = engine.updateChannelMediaOptions?.({
          publishScreenCaptureVideo: true,
          publishCameraTrack: false,
        });
        if (typeof switchRc === 'number' && switchRc !== 0) {
          try {
            engine.stopScreenCapture();
          } catch {
            // Already stopped.
          }
          throw new Error(
            `Could not publish the screen (engine error ${switchRc}).`,
          );
        }
      } catch (captureErr) {
        // Release the single-sharer lock: a failed start must never
        // block everyone else's Share button.
        if (uidRef.current !== null) {
          await upsertMyPresence(
            isRoom ? 'room' : 'chat',
            id,
            uidRef.current,
            { sharing: false },
          ).catch(() => {});
        }
        throw captureErr;
      }
      setError(null);
      setSharing(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not share screen.',
      );
    }
  }

  const RtcSurfaceView = AgoraModule?.RtcSurfaceView ?? null;
  const SourceType = AgoraModule?.VideoSourceType;
  // Fullscreen video: one feed fills the stage, tap to switch to the next.
  // Defaults to the first peer so you see who you talk to.
  const tiles = [
    { id: 'local', uid: null as number | null },
    ...peers.map((uid) => ({ id: `remote:${uid}`, uid })),
  ];
  const featuredTile =
    tiles.find((t) => t.id === featured) ??
    tiles.find((t) => t.uid !== null) ?? { id: 'local', uid: null as number | null };
  const featuredIndex = Math.max(
    0,
    tiles.findIndex((t) => t.id === featuredTile.id),
  );
  const flagByUid = new Map(presence.map((p) => [p.agoraUid, p]));
  const featuredFlag =
    featuredTile.uid === null
      ? null
      : (flagByUid.get(featuredTile.uid) ?? null);
  const otherSharer = presence.find(
    (p) => p.sharing && p.agoraUid !== uidRef.current,
  );
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  function cycleFeed() {
    if (tiles.length < 2) return;
    const next = tiles[(featuredIndex + 1) % tiles.length];
    if (next) setFeatured(next.id);
  }

  // WhatsApp-style voice roster: yourself plus every peer, each with
  // avatar, name, mute state, and a speaking highlight.
  const voiceTiles = useMemo(() => {
    const accentFor = (uid: number) =>
      TILE_ACCENTS[Math.abs(uid) % TILE_ACCENTS.length];
    const self = {
      key: 'self',
      uid: selfUid,
      name: 'You',
      avatarUrl: myAvatar,
      muted,
      isSelf: true,
    };
    const others = peers.map((uid) => {
      const flag = presence.find((p) => p.agoraUid === uid);
      const named =
        flag?.name && flag.name !== 'Someone' ? flag.name : null;
      return {
        key: String(uid),
        uid,
        name: named ?? (!isRoom && !callGroup ? title : 'Member'),
        avatarUrl:
          flag?.avatarUrl ??
          (!isRoom && !callGroup ? peerAvatarUrl : null),
        muted: flag?.muted ?? false,
        isSelf: false,
      };
    });
    return [self, ...others].map((t) => ({
      ...t,
      accent: accentFor(t.uid ?? 0),
      speaking: t.uid !== null && speakers.includes(t.uid),
    }));
  }, [
    peers,
    presence,
    selfUid,
    myAvatar,
    muted,
    speakers,
    isRoom,
    callGroup,
    title,
    peerAvatarUrl,
  ]);

  // Rooms minimize to a floating bar: the engine stays joined and the
  // unmount skips teardown while the room is parked there.
  function minimize() {
    if (!id || !isRoom || leavingRef.current) return;
    setLiveEngine(engineRef.current);
    setMinimizedRoom({
      roomId: id,
      media: mediaRef.current,
      joined: joinedRef.current,
    });
    router.back();
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
      <View style={styles.top}>
        <View style={styles.topMid}>
          <Text style={styles.title} numberOfLines={1}>
            {title.toUpperCase().slice(0, 28)}
          </Text>
          <Text style={styles.status}>
            {status === 'Connected'
              ? peers.length > 0
                ? clock
                : waitingLabel
              : status}
          </Text>
        </View>
        {isRoom ? (
          <Pressable
            onPress={minimize}
            hitSlop={12}
            accessibilityLabel="Minimize meeting"
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.stage}>
        {status === 'Connecting…' && !error ? (
          wantVideo && !videoOff && RtcSurfaceView && SourceType ? (
            // The preview surface mounts before the join lands so the
            // camera binds to a live view, like the reference sample.
            <View style={styles.videoStage}>
              <RtcSurfaceView
                style={styles.fullscreen}
                canvas={{ sourceType: SourceType.VideoSourceCameraPrimary }}
              />
              <View style={styles.connectingVeil}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#FFFFFF" />
          )
        ) : RtcSurfaceView && SourceType && wantVideo && status === 'Connected' ? (
          <View style={styles.videoStage}>
            <Pressable
              style={styles.fullscreen}
              onPress={cycleFeed}
              accessibilityLabel="Switch video"
            >
              {featuredTile.uid === null && (videoOff || sharing) ? (
                <View style={styles.placeholder}>
                  <Ionicons
                    name={
                      sharing ? 'share-outline' : 'videocam-off-outline'
                    }
                    size={48}
                    color="#FFFFFF"
                  />
                  <Text style={styles.placeholderText}>
                    {sharing ? "You're sharing" : 'Camera off'}
                  </Text>
                </View>
              ) : featuredTile.uid !== null &&
                remoteVideoOff[featuredTile.uid] &&
                !featuredFlag?.sharing ? (
                <View style={styles.placeholder}>
                  {featuredFlag?.avatarUrl || (!isRoom && !callGroup && peerAvatarUrl) ? (
                    <Image
                      source={{
                        uri: (featuredFlag?.avatarUrl ?? peerAvatarUrl) as string,
                      }}
                      style={styles.voiceAvatar}
                    />
                  ) : (
                    <View style={[styles.voiceAvatar, styles.voiceAvatarFallback]}>
                      <Text style={styles.voiceAvatarText}>
                        {(featuredFlag?.name ?? title).slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.placeholderText}>
                    {(featuredFlag?.name && featuredFlag.name !== 'Someone'
                      ? featuredFlag.name
                      : title)}{' '}
                    • Camera off
                  </Text>
                </View>
              ) : (
                <RtcSurfaceView
                  style={StyleSheet.absoluteFill}
                  canvas={
                    featuredTile.uid === null
                      ? {
                          sourceType:
                            SourceType.VideoSourceCameraPrimary,
                        }
                      : {
                          sourceType: SourceType.VideoSourceRemote,
                          uid: featuredTile.uid,
                        }
                  }
                />
              )}
              {featuredTile.uid !== null && !videoOff && !sharing ? (
                <Pressable
                  style={styles.pipTile}
                  onPress={cycleFeed}
                  accessibilityLabel="Your camera preview"
                >
                  <RtcSurfaceView
                    style={StyleSheet.absoluteFill}
                    canvas={{
                      sourceType: SourceType.VideoSourceCameraPrimary,
                    }}
                  />
                </Pressable>
              ) : null}
              {featuredTile.uid === null ? (
                <View style={styles.youTag}>
                  <Text style={styles.youTagText}>YOU</Text>
                </View>
              ) : null}
              {(featuredTile.uid === null && muted) ||
              featuredFlag?.muted ? (
                <View style={styles.muteTag}>
                  <Ionicons name="mic-off" size={14} color="#FFFFFF" />
                  <Text style={styles.muteTagText}>MUTED</Text>
                </View>
              ) : null}
              {featuredFlag?.sharing ? (
                <View style={styles.shareTag}>
                  <Text style={styles.shareTagText}>SHARING</Text>
                </View>
              ) : null}
            </Pressable>
            {tiles.length > 1 ? (
              <Text style={styles.switchHint}>
                {featuredIndex + 1} of {tiles.length} • Tap to switch
              </Text>
            ) : null}
          </View>
        ) : !wantVideo ? (
          <ScrollView
            contentContainerStyle={styles.voiceGrid}
            showsVerticalScrollIndicator={false}
          >
            {voiceTiles.map((tile) => (
              <VoiceTile
                key={tile.key}
                name={tile.name}
                avatarUrl={tile.avatarUrl}
                muted={tile.muted}
                speaking={tile.speaking}
                accent={tile.accent}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.audioOnly}>
            <Ionicons
              name="videocam-off-outline"
              size={64}
              color="#FFFFFF"
            />
            <Text style={styles.audioText}>{error ?? waitingLabel}</Text>
          </View>
        )}
        {sharing ? (
          <View style={styles.sharePill}>
            <Text style={styles.sharePillText}>Sharing your screen</Text>
          </View>
        ) : null}
        {!sharing && otherSharer ? (
          <View style={styles.sharePill}>
            <Text style={styles.sharePillText}>
              {otherSharer.name} is sharing
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.controls, !wantVideo && styles.controlsPill]}>
        <CallButton
          icon={muted ? 'mic-off' : 'mic'}
          label={muted ? 'Unmute' : 'Mute'}
          compact={!wantVideo}
          onPress={toggleMute}
        />
        {canVideo ? (
          <CallButton
            icon={videoOff ? 'videocam-off' : 'videocam'}
            label="Camera"
            compact={!wantVideo}
            onPress={toggleVideo}
          />
        ) : null}
        {canVideo && !videoOff ? (
          <CallButton
            icon="camera-reverse"
            label="Flip"
            compact={!wantVideo}
            onPress={switchCamera}
          />
        ) : null}
        <CallButton
          icon={speaker ? 'volume-high' : 'volume-low'}
          label="Speaker"
          compact={!wantVideo}
          onPress={toggleSpeaker}
        />
        {canVideo ? (
          <CallButton
            icon="share-outline"
            label={sharing ? 'Stop' : 'Share'}
            compact={!wantVideo}
            active={sharing}
            onPress={toggleShare}
          />
        ) : null}
        <CallButton
          icon="call"
          label={isRoom ? 'Leave' : 'End'}
          compact={!wantVideo}
          danger
          onPress={() => leave()}
        />
      </View>
    </SafeAreaView>
  );
}

function CallButton({
  icon,
  label,
  onPress,
  danger = false,
  active = false,
  compact = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.btnWrap, compact && styles.btnWrapCompact]}>
      <Pressable
        style={[
          styles.btn,
          compact && styles.btnCompact,
          danger && styles.btnDanger,
          active && styles.btnActive,
        ]}
        onPress={onPress}
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon as never}
          size={compact ? 21 : 24}
          color="#FFFFFF"
        />
      </Pressable>
      {label ? (
        <Text style={[styles.btnLabel, compact && styles.btnLabelCompact]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const TILE_ACCENTS = ['#53BDEB', '#F15A8B', '#F08A4B', '#4ADE80', '#A78BFA'];

function VoiceTile({
  name,
  avatarUrl,
  muted,
  speaking,
  accent,
}: {
  name: string;
  avatarUrl: string | null;
  muted: boolean;
  speaking: boolean;
  accent: string;
}) {
  const letter = name.trim().slice(0, 1).toUpperCase() || '•';
  return (
    <View
      style={[
        styles.voiceTile,
        speaking && { borderColor: accent, borderWidth: 2 },
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.tileAvatar} />
      ) : (
        <View style={[styles.tileAvatar, styles.tileAvatarFallback]}>
          <Text style={styles.tileAvatarText}>{letter}</Text>
        </View>
      )}
      {muted ? (
        <View style={styles.tileMute}>
          <Ionicons name="mic-off" size={12} color="#FFFFFF" />
        </View>
      ) : null}
      <Text style={[styles.tileDots, { color: accent }]}>
        {'•••••••'}
      </Text>
      <Text style={[styles.tileName, { color: accent }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  topMid: { flex: 1, alignItems: 'center' },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    textAlign: 'center',
  },
  status: {
    fontSize: 13,
    color: '#B9B9BE',
    marginTop: 4,
    textAlign: 'center',
  },
  errorBar: {
    backgroundColor: '#3A1113',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#FFB4B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  videoStage: { flex: 1, width: '100%', gap: 8 },
  fullscreen: {
    flex: 1,
    width: '100%',
    borderRadius: radius.m,
    overflow: 'hidden',
    backgroundColor: '#1A1A1E',
  },
  connectingVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  youTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  youTagText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  muteTag: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  muteTagText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  shareTag: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shareTagText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  pipTile: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 96,
    height: 136,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFFFFF55',
    backgroundColor: '#101014',
    zIndex: 4,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderText: { fontSize: 14, color: '#FFFFFF' },
  switchHint: { fontSize: 11, color: '#B9B9BE', textAlign: 'center' },
  audioOnly: { alignItems: 'center', gap: 20 },
  audioText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  voiceAvatar: { width: 140, height: 140, borderRadius: 70 },
  voiceAvatarFallback: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceAvatarText: { fontSize: 52, fontWeight: '800', color: '#000000' },
  sharePill: {
    marginTop: 16,
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sharePillText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingVertical: 24,
  },
  btnWrap: { alignItems: 'center', gap: 6, minWidth: 64 },
  btnWrapCompact: { minWidth: 48, gap: 4 },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2A2A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCompact: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  btnDanger: { backgroundColor: '#E5484D' },
  btnActive: { backgroundColor: '#000000', borderWidth: 2, borderColor: '#FFFFFF' },
  btnLabel: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnLabelCompact: { fontSize: 10 },
  controlsPill: {
    backgroundColor: '#1F2C34',
    borderRadius: 32,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    justifyContent: 'center',
  },
  voiceTile: {
    width: '47%',
    aspectRatio: 0.78,
    backgroundColor: '#1F2C34',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  tileAvatar: { width: 72, height: 72, borderRadius: 36 },
  tileAvatarFallback: {
    backgroundColor: '#374045',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileAvatarText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  tileMute: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDots: { fontSize: 10, letterSpacing: 3 },
  tileName: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
});

export default function CallScreenEntry() {
  return <CallScreen />;
}
