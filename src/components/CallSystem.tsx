import {
  Camera,
  ChevronDown,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  SwitchCamera,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useApp } from '../context/AppContext';

export type CallMedia = 'voice' | 'video';
export type CallScope = 'dm' | 'group' | 'room';

export type CallPeerTile = {
  id: string;
  name: string;
  muted: boolean;
  videoOff: boolean;
  speaking: boolean;
  sharingScreen?: boolean;
};

export type ActiveCallSession = {
  id: string;
  refId: string;
  title: string;
  scope: CallScope;
  media: CallMedia;
  direction: 'outgoing' | 'incoming';
  status:
    | 'Calling…'
    | 'Ringing…'
    | 'Connecting…'
    | 'Connected'
    | 'Reconnecting…'
    | 'No answer';
  startedAt: number;
  connectedAt: number | null;
  minimized: boolean;
  targetOnline?: boolean;
  peers: CallPeerTile[];
};

type StartCallInput = {
  refId: string;
  title: string;
  scope: CallScope;
  media: CallMedia;
  targetOnline?: boolean;
  peers?: string[];
};

type CallContextValue = {
  activeCall: ActiveCallSession | null;
  incomingCall: ActiveCallSession | null;
  startCall: (input: StartCallInput) => void;
  triggerIncomingDemoCall: (media?: CallMedia) => void;
  acceptIncomingCall: () => void;
  declineIncomingCall: () => void;
  minimizeCall: () => void;
  expandCall: () => void;
  endCall: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatShortDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function playToneBurst(
  ctx: AudioContext,
  freqs: number[],
  durationMs: number,
  gainValue: number,
) {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  gain.connect(ctx.destination);

  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.04);
  }
}

function useCallRingtone(mode: 'outgoing' | 'incoming' | null) {
  useEffect(() => {
    if (!mode || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioCtx();
    } catch {
      return;
    }

    const playCycle = () => {
      if (!audioCtx || audioCtx.state === 'closed') return;
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume().catch(() => {});
      }
      if (mode === 'outgoing') {
        playToneBurst(audioCtx, [440, 480], 700, 0.03);
      } else {
        playToneBurst(audioCtx, [523.25, 659.25], 260, 0.05);
        setTimeout(() => {
          if (audioCtx && audioCtx.state !== 'closed') {
            playToneBurst(audioCtx, [659.25, 783.99], 320, 0.05);
          }
        }, 300);
      }
    };

    playCycle();
    const timer = window.setInterval(playCycle, mode === 'outgoing' ? 2800 : 2200);

    return () => {
      window.clearInterval(timer);
      if (audioCtx && audioCtx.state !== 'closed') {
        void audioCtx.close().catch(() => {});
      }
    };
  }, [mode]);
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { state, setState, showToast } = useApp();
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCallSession | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Media controls
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [screenSharing, setScreenSharing] = useState(false);
  const [featuredPeerId, setFeaturedPeerId] = useState<string>('remote-0');
  const [localMediaError, setLocalMediaError] = useState<string | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const userToggledVideoRef = useRef(false);
  const callMediaRef = useRef<CallMedia>('voice');

  const stopAllTracks = useCallback(() => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setCamStream(null);
    setScreenStream(null);
    setScreenSharing(false);
  }, []);

  const logCallToThread = useCallback(
    (session: ActiveCallSession, answered: boolean, durationSec: number) => {
      if (session.scope === 'room') return;
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      const kindLabel = session.media === 'video' ? 'Video call' : 'Voice call';
      const text = answered
        ? `${kindLabel} • ${formatShortDuration(Math.max(1, durationSec))}`
        : `Missed ${kindLabel.toLowerCase()}`;

      setState((prev) => ({
        ...prev,
        threads: prev.threads.map((t) => {
          if (t.id !== session.refId) return t;
          return {
            ...t,
            preview: text,
            time: nowLabel,
            messages: [
              ...t.messages,
              {
                id: `call-msg-${Date.now()}`,
                senderId: 'me',
                senderName: prev.userName,
                text,
                time: nowLabel,
              },
            ],
          };
        }),
      }));
    },
    [setState],
  );

  // Acquire local browser camera/mic when call starts or camera turns back on
  const syncLocalMedia = useCallback(
    async (wantVideo: boolean, facing: 'user' | 'environment', isMuted: boolean) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setLocalMediaError('Camera preview unavailable in this browser context');
        return;
      }
      try {
        // Stop old camera stream cleanly before reacquiring
        if (camStreamRef.current) {
          camStreamRef.current.getTracks().forEach((t) => t.stop());
          camStreamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: wantVideo
            ? {
                facingMode: facing,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
        });
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !isMuted;
        });
        camStreamRef.current = stream;
        setCamStream(stream);
        setLocalMediaError(null);
      } catch {
        setCamStream(null);
        setLocalMediaError(
          wantVideo
            ? 'Camera/mic permission unavailable — using avatar tile'
            : 'Microphone unavailable — audio simulation active',
        );
      }
    },
    [],
  );

  const startCall = useCallback(
    (input: StartCallInput) => {
      if (activeCall) {
        showToast('Already in a call — end or minimize it first');
        return;
      }
      stopAllTracks();
      userToggledVideoRef.current = false;
      callMediaRef.current = input.media;
      const isVideo = input.media === 'video';
      setMuted(false);
      setVideoOff(!isVideo);
      setSpeakerOn(isVideo);
      setFacingMode('user');
      setElapsed(0);
      setFeaturedPeerId('remote-0');

      const peerNames =
        input.peers && input.peers.length > 0
          ? input.peers
          : input.scope === 'room'
            ? ['Idris Yusuf', 'Kemi Bisi', 'Chioma Gozie']
            : [input.title];

      const initialStatus: ActiveCallSession['status'] =
        input.scope === 'room' || input.scope === 'group'
          ? 'Connecting…'
          : 'Calling…';

      const session: ActiveCallSession = {
        id: `call-${Date.now()}`,
        refId: input.refId,
        title: input.title,
        scope: input.scope,
        media: input.media,
        direction: 'outgoing',
        status: initialStatus,
        startedAt: Date.now(),
        connectedAt: null,
        minimized: false,
        targetOnline: input.targetOnline ?? true,
        peers: peerNames.map((name, idx) => ({
          id: `remote-${idx}`,
          name,
          muted: idx % 2 === 1,
          videoOff: !isVideo || idx === 2,
          speaking: idx === 0,
        })),
      };

      setActiveCall(session);
      if (input.scope === 'room') {
        setState((prev) => ({
          ...prev,
          meetings: prev.meetings.map((m) =>
            m.id === input.refId
              ? { ...m, live: true, participants: Math.max(1, m.participants + 1) }
              : m,
          ),
        }));
      }
      void syncLocalMedia(isVideo, 'user', false);
    },
    [activeCall, setState, showToast, stopAllTracks, syncLocalMedia],
  );

  const triggerIncomingDemoCall = useCallback(
    (media: CallMedia = 'video') => {
      if (activeCall || incomingCall) {
        showToast('A call is already active');
        return;
      }
      const communityMembers = state.members[state.selectedCommunityId] ?? [];
      const caller =
        communityMembers.find((m) => m.userId !== 'me')?.name ?? 'Idris Yusuf';
      const matchingThread =
        state.threads.find(
          (t) =>
            !t.isGroup &&
            t.name.toLowerCase().includes(caller.split(' ')[0].toLowerCase()),
        ) ?? state.threads.find((t) => !t.isGroup);

      setIncomingCall({
        id: `inc-${Date.now()}`,
        refId: matchingThread?.id ?? 'dm-2',
        title: matchingThread?.name ?? caller.toUpperCase(),
        scope: 'dm',
        media,
        direction: 'incoming',
        status: 'Ringing…',
        startedAt: Date.now(),
        connectedAt: null,
        minimized: false,
        targetOnline: true,
        peers: [
          {
            id: 'remote-0',
            name: matchingThread?.name ?? caller,
            muted: false,
            videoOff: media === 'voice',
            speaking: true,
          },
        ],
      });
    },
    [activeCall, incomingCall, showToast, state.members, state.selectedCommunityId, state.threads],
  );

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    stopAllTracks();
    userToggledVideoRef.current = false;
    const isVideo = incomingCall.media === 'video';
    callMediaRef.current = incomingCall.media;
    setMuted(false);
    setVideoOff(!isVideo);
    setSpeakerOn(isVideo);
    setFacingMode('user');
    setElapsed(0);
    setFeaturedPeerId('remote-0');

    setActiveCall({
      ...incomingCall,
      status: 'Connecting…',
      startedAt: Date.now(),
    });
    setIncomingCall(null);
    void syncLocalMedia(isVideo, 'user', false);
  }, [incomingCall, stopAllTracks, syncLocalMedia]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    logCallToThread(incomingCall, false, 0);
    setIncomingCall(null);
    showToast('Call declined');
  }, [incomingCall, logCallToThread, showToast]);

  const endCall = useCallback(() => {
    if (!activeCall) return;
    const wasConnected = activeCall.connectedAt !== null;
    const dur = wasConnected
      ? Math.max(1, Math.round((Date.now() - activeCall.connectedAt!) / 1000))
      : 0;
    logCallToThread(activeCall, wasConnected, dur);
    if (activeCall.scope === 'room') {
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === activeCall.refId
            ? {
                ...m,
                participants: Math.max(0, m.participants - 1),
                live: m.participants - 1 > 0,
              }
            : m,
        ),
      }));
    }
    stopAllTracks();
    setActiveCall(null);
    setElapsed(0);
  }, [activeCall, logCallToThread, setState, stopAllTracks]);

  const minimizeCall = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, minimized: true } : null));
  }, []);

  const expandCall = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, minimized: false } : null));
  }, []);

  // Outgoing call state machine + 45s unanswered timeout
  useEffect(() => {
    if (!activeCall) return;

    if (activeCall.status === 'Calling…') {
      const ringTimer = window.setTimeout(() => {
        setActiveCall((prev) =>
          prev && prev.id === activeCall.id && prev.status === 'Calling…'
            ? { ...prev, status: 'Ringing…' }
            : prev,
        );
      }, 650);
      return () => window.clearTimeout(ringTimer);
    }

    if (activeCall.status === 'Ringing…') {
      // Online peers or rooms auto-connect cleanly; offline DM peers ring up to 45s then show No answer
      if (activeCall.targetOnline !== false) {
        const connectTimer = window.setTimeout(() => {
          setActiveCall((prev) =>
            prev && prev.id === activeCall.id && prev.status === 'Ringing…'
              ? { ...prev, status: 'Connecting…' }
              : prev,
          );
        }, 1600);
        return () => window.clearTimeout(connectTimer);
      }

      const timeoutTimer = window.setTimeout(() => {
        setActiveCall((prev) =>
          prev && prev.id === activeCall.id && prev.status === 'Ringing…'
            ? { ...prev, status: 'No answer' }
            : prev,
        );
      }, 45000);
      return () => window.clearTimeout(timeoutTimer);
    }

    if (activeCall.status === 'Connecting…') {
      const joinedTimer = window.setTimeout(() => {
        setActiveCall((prev) =>
          prev && prev.id === activeCall.id && prev.status === 'Connecting…'
            ? {
                ...prev,
                status: 'Connected',
                connectedAt: prev.connectedAt ?? Date.now(),
              }
            : prev,
        );
      }, 850);
      return () => window.clearTimeout(joinedTimer);
    }

    if (activeCall.status === 'No answer') {
      const autoClose = window.setTimeout(() => {
        endCall();
      }, 1500);
      return () => window.clearTimeout(autoClose);
    }
  }, [activeCall, endCall]);

  // Connected timer + subtle speaking activity pulse
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'Connected') return;
    const timer = window.setInterval(() => {
      setElapsed((e) => e + 1);
      setActiveCall((prev) => {
        if (!prev || prev.status !== 'Connected') return prev;
        return {
          ...prev,
          peers: prev.peers.map((p, idx) => ({
            ...p,
            speaking:
              !p.muted && (Math.floor(Date.now() / 1600) + idx) % prev.peers.length === 0,
          })),
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.id, activeCall?.status]);

  // Real mic level meter via Web Audio AnalyserNode when camStream has audio
  useEffect(() => {
    if (!activeCall || muted || !camStream || camStream.getAudioTracks().length === 0) {
      setMicLevel(0);
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    let audioCtx: AudioContext | null = null;
    let rafId = 0;
    try {
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(camStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setMicLevel(avg);
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
    } catch {
      setMicLevel(0);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (audioCtx && audioCtx.state !== 'closed') {
        void audioCtx.close().catch(() => {});
      }
    };
  }, [activeCall, muted, camStream]);

  // Ringtone playback for outgoing ringing or incoming call
  const ringMode = incomingCall
    ? 'incoming'
    : activeCall && (activeCall.status === 'Calling…' || activeCall.status === 'Ringing…')
      ? 'outgoing'
      : null;
  useCallRingtone(ringMode);

  // Sync mute state cleanly onto live audio track
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (camStreamRef.current) {
      camStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
    }
  };

  // Fixed mid-call video upgrade: keeps audio active, updates callMedia without being overwritten
  const toggleVideo = async () => {
    if (!activeCall) return;
    userToggledVideoRef.current = true;
    const nextOff = !videoOff;
    setVideoOff(nextOff);
    const nextMedia: CallMedia = nextOff ? 'voice' : 'video';
    callMediaRef.current = nextMedia;
    setSpeakerOn(!nextOff);
    setActiveCall((prev) => (prev ? { ...prev, media: nextMedia } : null));

    if (nextOff) {
      if (camStreamRef.current) {
        camStreamRef.current.getVideoTracks().forEach((t) => t.stop());
        const audioOnly = new MediaStream(camStreamRef.current.getAudioTracks());
        camStreamRef.current = audioOnly;
        setCamStream(audioOnly.getTracks().length ? audioOnly : null);
      }
    } else {
      await syncLocalMedia(true, facingMode, muted);
    }
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (!videoOff) {
      await syncLocalMedia(true, nextFacing, muted);
    }
  };

  const toggleSpeaker = () => {
    setSpeakerOn((s) => !s);
  };

  const toggleScreenShare = async () => {
    if (!activeCall) return;
    if (screenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenStream(null);
      setScreenSharing(false);
      return;
    }

    // Single-sharer lock: prevent sharing if a remote participant is already sharing
    const remoteSharer = activeCall.peers.find((p) => p.sharingScreen);
    if (remoteSharer) {
      showToast(`${remoteSharer.name} is already sharing their screen`);
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      showToast('Screen sharing is not supported in this browser');
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [track] = display.getVideoTracks();
      if (track) {
        track.onended = () => {
          setScreenStream(null);
          setScreenSharing(false);
          screenStreamRef.current = null;
        };
      }
      screenStreamRef.current = display;
      setScreenStream(display);
      setScreenSharing(true);
    } catch {
      showToast('Screen share cancelled');
    }
  };

  // Recovery demo helpers inside active call (reconnection recovery & remote cam toggle)
  const simulateReconnect = () => {
    if (!activeCall || activeCall.status !== 'Connected') return;
    setActiveCall((prev) => (prev ? { ...prev, status: 'Reconnecting…' } : null));
    window.setTimeout(() => {
      setActiveCall((prev) =>
        prev && prev.status === 'Reconnecting…'
          ? { ...prev, status: 'Connected' }
          : prev,
      );
    }, 1800);
  };

  const toggleRemoteCameraDemo = () => {
    setActiveCall((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        peers: prev.peers.map((p, idx) =>
          idx === 0 ? { ...p, videoOff: !p.videoOff } : p,
        ),
      };
    });
  };

  const addParticipantDemo = () => {
    const communityMembers = state.members[state.selectedCommunityId] ?? [];
    setActiveCall((prev) => {
      if (!prev) return prev;
      const existingNames = new Set(prev.peers.map((p) => p.name));
      const candidate = communityMembers.find(
        (m) => m.userId !== 'me' && !existingNames.has(m.name),
      );
      if (!candidate) {
        showToast('All community members are already in this call');
        return prev;
      }
      return {
        ...prev,
        scope: prev.scope === 'dm' ? 'group' : prev.scope,
        peers: [
          ...prev.peers,
          {
            id: `remote-${Date.now()}`,
            name: candidate.name,
            muted: false,
            videoOff: prev.media === 'voice',
            speaking: false,
          },
        ],
      };
    });
  };

  const contextValue = useMemo<CallContextValue>(
    () => ({
      activeCall,
      incomingCall,
      startCall,
      triggerIncomingDemoCall,
      acceptIncomingCall,
      declineIncomingCall,
      minimizeCall,
      expandCall,
      endCall,
    }),
    [
      activeCall,
      incomingCall,
      startCall,
      triggerIncomingDemoCall,
      acceptIncomingCall,
      declineIncomingCall,
      minimizeCall,
      expandCall,
      endCall,
    ],
  );

  return (
    <CallContext.Provider value={contextValue}>
      {children}

      {/* Minimized Call Bar */}
      {activeCall && activeCall.minimized ? (
        <div className="fixed top-[60px] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-24px)] max-w-[496px] rounded-xl bg-[#000000] text-white px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-xl border border-white/15">
          <button
            type="button"
            onClick={expandCall}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80] animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-bold truncate">{activeCall.title}</div>
              <div className="text-[11px] text-[#3EE6C4] font-semibold">
                {activeCall.status === 'Connected'
                  ? `Connected • ${formatDuration(elapsed)}`
                  : activeCall.status}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
                muted ? 'bg-[#E5484D]' : 'bg-white/15 hover:bg-white/25'
              }`}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={toggleSpeaker}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
                speakerOn ? 'bg-[#3EE6C4] text-black' : 'bg-white/15 text-white'
              }`}
              aria-label="Toggle speaker"
            >
              {speakerOn ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={endCall}
              className="px-2.5 h-8 rounded-full bg-[#E5484D] hover:opacity-90 text-white text-[11px] font-extrabold cursor-pointer"
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}

      {/* Full Call Stage */}
      {activeCall && !activeCall.minimized ? (
        <CallStageModal
          session={activeCall}
          myName={state.userName}
          elapsed={elapsed}
          muted={muted}
          videoOff={videoOff}
          speakerOn={speakerOn}
          screenSharing={screenSharing}
          camStream={camStream}
          screenStream={screenStream}
          micLevel={micLevel}
          localMediaError={localMediaError}
          featuredPeerId={featuredPeerId}
          onSelectFeatured={setFeaturedPeerId}
          onMinimize={minimizeCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onFlipCamera={flipCamera}
          onToggleSpeaker={toggleSpeaker}
          onToggleScreenShare={toggleScreenShare}
          onSimulateReconnect={simulateReconnect}
          onToggleRemoteCamera={toggleRemoteCameraDemo}
          onAddParticipant={addParticipantDemo}
          onEnd={endCall}
        />
      ) : null}

      {/* Incoming Call Overlay */}
      {incomingCall ? (
        <div className="fixed inset-x-0 top-3 z-[60] flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-[460px] rounded-2xl bg-[#111318] text-white p-4 shadow-2xl border border-white/15 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#3EE6C4] text-black font-extrabold text-lg flex items-center justify-center shrink-0 relative">
              {incomingCall.title.slice(0, 1).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-black border border-white/30 flex items-center justify-center">
                {incomingCall.media === 'video' ? (
                  <Video className="w-3 h-3 text-[#3EE6C4]" />
                ) : (
                  <PhoneIncoming className="w-3 h-3 text-[#3EE6C4]" />
                )}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#3EE6C4]">
                Incoming {incomingCall.media === 'video' ? 'Video' : 'Voice'} Call
              </div>
              <div className="text-[15px] font-extrabold truncate">
                {incomingCall.title}
              </div>
              <div className="text-[12px] text-white/65">Ringing…</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={declineIncomingCall}
                className="w-11 h-11 rounded-full bg-[#E5484D] hover:opacity-90 flex items-center justify-center cursor-pointer"
                aria-label="Decline call"
              >
                <PhoneOff className="w-5 h-5 text-white" />
              </button>
              <button
                type="button"
                onClick={acceptIncomingCall}
                className="w-11 h-11 rounded-full bg-[#22C55E] hover:opacity-90 flex items-center justify-center cursor-pointer"
                aria-label="Accept call"
              >
                <Phone className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CallContext.Provider>
  );
}

function StreamVideo({
  stream,
  mirrored = false,
  className = '',
}: {
  stream: MediaStream | null;
  mirrored?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  if (!stream || stream.getVideoTracks().length === 0) return null;
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''} ${className}`}
    />
  );
}

function CallStageModal({
  session,
  myName,
  elapsed,
  muted,
  videoOff,
  speakerOn,
  screenSharing,
  camStream,
  screenStream,
  micLevel,
  localMediaError,
  featuredPeerId,
  onSelectFeatured,
  onMinimize,
  onToggleMute,
  onToggleVideo,
  onFlipCamera,
  onToggleSpeaker,
  onToggleScreenShare,
  onSimulateReconnect,
  onToggleRemoteCamera,
  onAddParticipant,
  onEnd,
}: {
  session: ActiveCallSession;
  myName: string;
  elapsed: number;
  muted: boolean;
  videoOff: boolean;
  speakerOn: boolean;
  screenSharing: boolean;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
  micLevel: number;
  localMediaError: string | null;
  featuredPeerId: string;
  onSelectFeatured: (id: string) => void;
  onMinimize: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onFlipCamera: () => void;
  onToggleSpeaker: () => void;
  onToggleScreenShare: () => void;
  onSimulateReconnect: () => void;
  onToggleRemoteCamera: () => void;
  onAddParticipant: () => void;
  onEnd: () => void;
}) {
  const [swappedLocalMain, setSwappedLocalMain] = useState(false);

  const isVideoMode =
    !videoOff ||
    screenSharing ||
    session.media === 'video' ||
    session.peers.some((p) => !p.videoOff);

  const activePeer =
    session.peers.find((p) => p.id === featuredPeerId) ?? session.peers[0];

  const isReconnecting = session.status === 'Reconnecting…';
  const hasLocalCamVideo = Boolean(!videoOff && camStream && camStream.getVideoTracks().length > 0);
  const localSpeaking = !muted && micLevel > 0.08;

  const tiles = [
    {
      id: 'local',
      name: `${myName} (You)`,
      muted,
      videoOff,
      speaking: localSpeaking,
      isLocal: true,
    },
    ...session.peers.map((p) => ({
      ...p,
      isLocal: false,
    })),
  ];

  const statusTone =
    session.status === 'Connected'
      ? 'text-[#4ADE80]'
      : isReconnecting || session.status === 'No answer'
        ? 'text-[#F5A623]'
        : 'text-[#3EE6C4]';

  return (
    <div className="fixed inset-0 z-50 bg-[#050608] text-white flex flex-col">
      {/* Top Bar */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 bg-black/60 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onMinimize}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 cursor-pointer"
            title="Minimize call"
            aria-label="Minimize call"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold truncate flex items-center gap-2">
              <span>{session.title}</span>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                {session.scope === 'room'
                  ? 'Room'
                  : session.scope === 'group'
                    ? 'Group'
                    : 'Direct'}
              </span>
            </div>
            <div className={`text-[12px] font-bold ${statusTone}`}>
              {session.status === 'Connected'
                ? `Connected • ${formatDuration(elapsed)}`
                : session.status}
              {session.peers.length > 0
                ? ` • ${session.peers.length + 1} in call`
                : ''}
            </div>
          </div>
        </div>

        {/* Helpful live test/room utilities */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onAddParticipant}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            title="Add colleague to call"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
          <button
            type="button"
            onClick={onToggleRemoteCamera}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            title="Toggle peer camera fallback"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Peer Cam</span>
          </button>
          {session.status === 'Connected' ? (
            <button
              type="button"
              onClick={onSimulateReconnect}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Test connection recovery"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Recover</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Reconnecting banner */}
      {isReconnecting ? (
        <div className="bg-[#F5A623]/20 border-b border-[#F5A623]/40 px-4 py-1.5 text-center text-[12px] font-bold text-[#FCD34D]">
          Connection interrupted — reconnecting media stream…
        </div>
      ) : null}

      {/* Main Call Stage */}
      <div className="flex-1 relative overflow-hidden flex flex-col justify-center p-4">
        {isVideoMode ? (
          <div className="relative w-full max-w-[680px] mx-auto flex-1 flex flex-col justify-center">
            {/* Screen Share Stage if active */}
            {screenSharing && screenStream ? (
              <div className="relative w-full h-full max-h-[68vh] rounded-2xl overflow-hidden bg-[#101318] border border-[#3EE6C4]/50">
                <StreamVideo stream={screenStream} className="!object-contain bg-black" />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/75 text-[#3EE6C4] text-[11px] font-extrabold flex items-center gap-1.5">
                  <MonitorUp className="w-3.5 h-3.5" />
                  Sharing your screen
                </div>
              </div>
            ) : swappedLocalMain ? (
              /* Local camera as main stage */
              <div className="relative w-full h-full max-h-[68vh] min-h-[340px] rounded-2xl overflow-hidden bg-[#161922] border border-white/10 flex flex-col items-center justify-center">
                {hasLocalCamVideo ? (
                  <StreamVideo stream={camStream} mirrored />
                ) : (
                  <PeerAvatarFallback
                    name={myName}
                    subtitle={
                      videoOff
                        ? 'Your camera is off'
                        : localMediaError ?? 'Preparing camera…'
                    }
                    speaking={localSpeaking}
                  />
                )}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-xs font-bold flex items-center gap-1.5">
                  <span>{myName} (You)</span>
                  {muted ? <MicOff className="w-3.5 h-3.5 text-[#E5484D]" /> : null}
                </div>
              </div>
            ) : (
              /* Featured Remote Peer Stage (with remote camera-off fallback!) */
              <div className="relative w-full h-full max-h-[68vh] min-h-[340px] rounded-2xl overflow-hidden bg-gradient-to-b from-[#171A23] to-[#0B0D12] border border-white/10 flex flex-col items-center justify-center">
                {activePeer && !activePeer.videoOff ? (
                  <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                    <div
                      className={`w-28 h-28 rounded-full bg-[#1F2C34] border-2 flex items-center justify-center text-4xl font-extrabold transition-all ${
                        activePeer.speaking
                          ? 'border-[#3EE6C4] ring-4 ring-[#3EE6C4]/25'
                          : 'border-white/25'
                      }`}
                    >
                      {activePeer.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-extrabold">{activePeer.name}</div>
                      <div className="text-xs text-[#3EE6C4] font-semibold mt-0.5">
                        {session.status === 'Connected'
                          ? activePeer.speaking
                            ? 'Speaking • HD Video'
                            : 'Video Connected'
                          : session.status}
                      </div>
                    </div>
                  </div>
                ) : (
                  <PeerAvatarFallback
                    name={activePeer?.name ?? session.title}
                    subtitle={
                      session.status === 'Connected'
                        ? 'Camera off'
                        : session.status
                    }
                    speaking={Boolean(activePeer?.speaking)}
                  />
                )}

                {activePeer ? (
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-xs font-bold flex items-center gap-1.5">
                    <span>{activePeer.name}</span>
                    {activePeer.muted ? (
                      <MicOff className="w-3.5 h-3.5 text-[#E5484D]" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {/* Floating Tappable Local PiP Tile */}
            <button
              type="button"
              onClick={() => setSwappedLocalMain((v) => !v)}
              className="absolute bottom-4 right-4 w-[104px] h-[142px] rounded-xl overflow-hidden bg-[#1D212B] border-2 border-white/25 hover:border-[#3EE6C4] shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-colors"
              title="Tap to swap main & self view"
            >
              {swappedLocalMain ? (
                <div className="flex flex-col items-center gap-1.5 px-2">
                  <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center font-extrabold">
                    {(activePeer?.name ?? session.title).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold truncate max-w-[90px]">
                    {activePeer?.name ?? session.title}
                  </span>
                </div>
              ) : hasLocalCamVideo ? (
                <StreamVideo stream={camStream} mirrored />
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-2">
                  <div className="w-11 h-11 rounded-full bg-[#3EE6C4] text-black flex items-center justify-center font-extrabold">
                    {myName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[10px] font-bold text-white/80">
                    {videoOff ? 'Cam off' : 'You'}
                  </span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold">
                {swappedLocalMain ? 'Peer' : 'You'}
              </span>
            </button>

            {/* Participant switcher strip when 2+ peers */}
            {session.peers.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto pb-1">
                {session.peers.map((p) => {
                  const selected = activePeer?.id === p.id && !swappedLocalMain;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSwappedLocalMain(false);
                        onSelectFeatured(p.id);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border cursor-pointer shrink-0 ${
                        selected
                          ? 'border-[#3EE6C4] bg-[#3EE6C4]/15 text-[#3EE6C4]'
                          : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{p.name}</span>
                      {p.videoOff ? (
                        <VideoOff className="w-3 h-3 text-white/50" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          /* Voice Call Participant Tiles */
          <div className="w-full max-w-[540px] mx-auto flex flex-col items-center justify-center gap-6">
            <div
              className={`grid gap-4 w-full ${
                tiles.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {tiles.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-2xl p-5 bg-[#12151C] border flex flex-col items-center gap-3 transition-all ${
                    t.speaking
                      ? 'border-[#3EE6C4] ring-2 ring-[#3EE6C4]/30'
                      : 'border-white/10'
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold ${
                      t.isLocal
                        ? 'bg-[#3EE6C4] text-black'
                        : 'bg-[#1F2C34] text-white'
                    }`}
                  >
                    {t.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center min-w-0 w-full">
                    <div className="text-[13px] font-bold truncate">{t.name}</div>
                    <div className="text-[11px] text-white/60 mt-0.5 flex items-center justify-center gap-1">
                      {t.muted ? (
                        <>
                          <MicOff className="w-3 h-3 text-[#E5484D]" />
                          <span className="text-[#E5484D]">Muted</span>
                        </>
                      ) : t.speaking ? (
                        <span className="text-[#4ADE80] font-semibold">Speaking</span>
                      ) : (
                        <span>Listening</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {localMediaError ? (
              <div className="text-[11px] text-white/55 text-center">
                {localMediaError}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar (compact controlsPill on voice, circular bar on video) */}
      <div className="px-4 pb-6 pt-2 flex justify-center">
        <div
          className={`flex items-center justify-center gap-2 sm:gap-3 flex-wrap ${
            !isVideoMode
              ? 'bg-[#1F2C34] px-4 py-3 rounded-2xl border border-white/10 shadow-2xl'
              : 'bg-black/75 px-4 py-3 rounded-2xl border border-white/10'
          }`}
        >
          <ControlButton
            active={muted}
            danger={muted}
            icon={muted ? MicOff : Mic}
            label={muted ? 'Unmute' : 'Mute'}
            compact={!isVideoMode}
            onClick={onToggleMute}
          />
          <ControlButton
            active={!videoOff}
            icon={videoOff ? VideoOff : Video}
            label="Camera"
            compact={!isVideoMode}
            onClick={onToggleVideo}
          />
          {!videoOff ? (
            <ControlButton
              icon={SwitchCamera}
              label="Flip"
              compact={!isVideoMode}
              onClick={onFlipCamera}
            />
          ) : null}
          <ControlButton
            active={speakerOn}
            icon={speakerOn ? Volume2 : VolumeX}
            label="Speaker"
            compact={!isVideoMode}
            onClick={onToggleSpeaker}
          />
          <ControlButton
            active={screenSharing}
            icon={MonitorUp}
            label={screenSharing ? 'Stop' : 'Share'}
            compact={!isVideoMode}
            onClick={onToggleScreenShare}
          />
          <button
            type="button"
            onClick={onEnd}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              !isVideoMode ? 'min-w-[54px]' : 'min-w-[60px]'
            }`}
          >
            <span className="w-11 h-11 rounded-full bg-[#E5484D] hover:opacity-90 flex items-center justify-center text-white shadow-lg">
              <PhoneOff className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-bold text-white/90">
              {session.scope === 'room' ? 'Leave' : 'End'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PeerAvatarFallback({
  name,
  subtitle,
  speaking,
}: {
  name: string;
  subtitle: string;
  speaking: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 p-6 text-center">
      <div
        className={`w-28 h-28 rounded-full bg-[#1F2C34] border-2 flex items-center justify-center text-4xl font-extrabold text-white transition-all ${
          speaking ? 'border-[#3EE6C4] ring-4 ring-[#3EE6C4]/25' : 'border-white/20'
        }`}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div>
        <div className="text-lg font-extrabold text-white">{name}</div>
        <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[11px] font-bold text-white/80">
          <VideoOff className="w-3 h-3" />
          <span>{subtitle}</span>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  active = false,
  danger = false,
  compact = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  danger?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
        compact ? 'min-w-[52px]' : 'min-w-[58px]'
      }`}
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          danger
            ? 'bg-[#E5484D] text-white'
            : active
              ? 'bg-[#3EE6C4] text-black'
              : 'bg-white/15 hover:bg-white/25 text-white'
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-[10px] font-bold text-white/85 leading-none">
        {label}
      </span>
    </button>
  );
}
