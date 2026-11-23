import {
  Check,
  Clock,
  Lock,
  Pencil,
  Phone,
  PhoneIncoming,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Star,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCalls } from '../components/CallSystem';
import { useApp } from '../context/AppContext';
import { STICKERS } from '../data/store';
import type { ChatMessage, ChatThread } from '../types';

export function ChatListView() {
  const { state, setState, navigate, showToast } = useApp();
  const { triggerIncomingDemoCall } = useCalls();
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const needle = query.trim().toLowerCase();
  const dms = state.threads.filter((t) => {
    if (t.isGroup) return false;
    if (favOnly && !t.fav) return false;
    if (!needle) return true;
    return (
      t.name.toLowerCase().includes(needle) ||
      t.preview.toLowerCase().includes(needle)
    );
  });

  const members = (state.members[state.selectedCommunityId] ?? []).filter(
    (m) => m.userId !== 'me',
  );

  function openThread(t: ChatThread) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((item) =>
        item.id === t.id ? { ...item, unread: 0 } : item,
      ),
    }));
    navigate({ kind: 'chat-thread', threadId: t.id });
  }

  function startDmWith(name: string) {
    const existing = state.threads.find(
      (t) => !t.isGroup && t.name.toLowerCase() === name.toLowerCase(),
    );
    setCreating(false);
    if (existing) {
      openThread(existing);
      return;
    }
    const id = `dm-${Date.now()}`;
    const created: ChatThread = {
      id,
      communityId: state.selectedCommunityId,
      name: name.toUpperCase(),
      preview: 'New encrypted conversation',
      time: 'Now',
      unread: 0,
      fav: false,
      isGroup: false,
      online: true,
      disappearSeconds: 0,
      messages: [],
    };
    setState((prev) => ({ ...prev, threads: [created, ...prev.threads] }));
    navigate({ kind: 'chat-thread', threadId: id });
    showToast(`Started chat with ${name}`);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--paper)]">
          <Search className="w-4 h-4 text-[var(--subtext)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search direct messages"
            className="w-full text-[13px] bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--subtext)]"
          />
        </div>
        <button
          type="button"
          onClick={() => triggerIncomingDemoCall('video')}
          className="h-[38px] px-2.5 rounded-xl border border-[var(--border)] bg-[var(--paper)] text-[var(--ink)] text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0 hover:bg-[var(--bg)]"
          title="Simulate incoming call"
        >
          <PhoneIncoming className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-[38px] px-3 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>NEW</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFavOnly(false)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
            !favOnly
              ? 'bg-[var(--ink)] text-[var(--paper)]'
              : 'bg-[var(--paper)] border border-[var(--border)] text-[var(--subtext)]'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFavOnly(true)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer ${
            favOnly
              ? 'bg-[var(--ink)] text-[var(--paper)]'
              : 'bg-[var(--paper)] border border-[var(--border)] text-[var(--subtext)]'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          Favorites
        </button>
      </div>

      {creating ? (
        <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-[var(--ink)]">
              Start chat with colleague
            </span>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-[var(--subtext)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => startDmWith(m.name)}
                className="w-full py-2 flex items-center justify-between text-left hover:bg-[var(--bg)] px-2 rounded-lg cursor-pointer"
              >
                <div>
                  <div className="text-sm font-bold text-[var(--ink)]">{m.name}</div>
                  <div className="text-[11px] text-[var(--subtext)]">{m.tag ?? m.role}</div>
                </div>
                <span className="text-xs font-bold text-[var(--subtext)]">Message</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {dms.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openThread(t)}
            className="w-full text-left bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center gap-3 hover:border-[var(--ink)]/40 transition-colors cursor-pointer"
          >
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-full bg-[var(--ink)] text-[var(--paper)] font-extrabold flex items-center justify-center text-base">
                {t.name.slice(0, 1)}
              </div>
              {t.online ? (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22C55E] border-2 border-[var(--paper)]" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-extrabold text-[var(--ink)] truncate flex items-center gap-1.5">
                  <span>{t.name}</span>
                  {t.fav ? <Star className="w-3 h-3 fill-[#F5A623] text-[#F5A623]" /> : null}
                </div>
                <span className="text-[11px] font-semibold text-[var(--subtext)] shrink-0">
                  {t.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[12px] text-[var(--subtext)] truncate">
                  {t.preview}
                </span>
                {t.unread > 0 ? (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--ink)] text-[var(--paper)] text-[10px] font-extrabold flex items-center justify-center px-1 shrink-0">
                    {t.unread}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TeamsView() {
  const { state, setState, navigate, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  const needle = query.trim().toLowerCase();
  const groups = state.threads.filter((t) => {
    if (!t.isGroup || t.communityId !== state.selectedCommunityId) return false;
    if (!needle) return true;
    return (
      t.name.toLowerCase().includes(needle) ||
      (t.description ?? '').toLowerCase().includes(needle)
    );
  });

  function openOrJoinGroup(t: ChatThread) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((item) =>
        item.id === t.id ? { ...item, joined: true, unread: 0 } : item,
      ),
    }));
    navigate({ kind: 'chat-thread', threadId: t.id });
  }

  function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = groupName.trim().toUpperCase();
    if (!name) return;
    const id = `grp-${Date.now()}`;
    const created: ChatThread = {
      id,
      communityId: state.selectedCommunityId,
      name,
      preview: groupDesc.trim() || 'New team channel',
      description: groupDesc.trim() || 'Team channel',
      time: 'Now',
      unread: 0,
      fav: false,
      isGroup: true,
      joined: true,
      messages: [],
    };
    setState((prev) => ({ ...prev, threads: [created, ...prev.threads] }));
    setGroupName('');
    setGroupDesc('');
    setCreating(false);
    showToast(`Created team ${name}`);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--paper)]">
          <Search className="w-4 h-4 text-[var(--subtext)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams & channels"
            className="w-full text-[13px] bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--subtext)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-[38px] px-3 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>TEAM</span>
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={createGroup}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-2.5"
        >
          <input
            required
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Team / Group name"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
          />
          <input
            value={groupDesc}
            onChange={(e) => setGroupDesc(e.target.value)}
            placeholder="Description"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--subtext)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
            >
              Create
            </button>
          </div>
        </form>
      ) : null}

      <div className="space-y-2">
        {groups.map((g) => (
          <div
            key={g.id}
            className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-full bg-[var(--card)] text-[var(--ink)] font-extrabold flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-extrabold text-[var(--ink)] truncate">
                  {g.name}
                </span>
                {g.unread > 0 ? (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--ink)] text-[var(--paper)] text-[10px] font-extrabold flex items-center justify-center px-1">
                    {g.unread}
                  </span>
                ) : null}
              </div>
              <div className="text-[12px] text-[var(--subtext)] truncate">
                {g.description ?? g.preview}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openOrJoinGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer shrink-0 ${
                g.joined
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'border border-[var(--ink)] text-[var(--ink)]'
              }`}
            >
              {g.joined ? 'OPEN' : 'JOIN'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const DISAPPEAR_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
];

export function ChatThreadView({ threadId }: { threadId: string }) {
  const { state, setState, showToast } = useApp();
  const { startCall } = useCalls();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const thread = state.threads.find((t) => t.id === threadId);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  if (!thread) {
    return (
      <div className="p-6 text-center text-sm text-[var(--subtext)]">
        Conversation not found.
      </div>
    );
  }

  const isCallLog = (txt: string) =>
    txt.startsWith('Missed ') ||
    txt.startsWith('Voice call') ||
    txt.startsWith('Video call');

  function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (editingMsg) {
      setState((prev) => ({
        ...prev,
        threads: prev.threads.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === editingMsg.id ? { ...m, text, edited: true } : m,
                ),
              }
            : t,
        ),
      }));
      setEditingMsg(null);
      setDraft('');
      return;
    }

    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      senderId: 'me',
      senderName: state.userName,
      text,
      time: nowLabel,
      replyTo: replyTo
        ? { senderName: replyTo.senderName, text: replyTo.text }
        : undefined,
    };

    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              preview: text,
              time: nowLabel,
              messages: [...t.messages, msg],
            }
          : t,
      ),
    }));
    setDraft('');
    setReplyTo(null);
  }

  function sendSticker(src: string, label: string) {
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      senderId: 'me',
      senderName: state.userName,
      text: `[Sticker: ${label}]`,
      sticker: src,
      time: nowLabel,
    };
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              preview: `Sticker: ${label}`,
              time: nowLabel,
              messages: [...t.messages, msg],
            }
          : t,
      ),
    }));
    setShowStickers(false);
  }

  function toggleReaction(msgId: string, emoji: string) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: t.messages.map((m) => {
            if (m.id !== msgId) return m;
            const current = m.reactions ?? [];
            const hit = current.find((r) => r.emoji === emoji);
            const next = hit
              ? current
                  .map((r) =>
                    r.emoji === emoji
                      ? {
                          ...r,
                          byMe: !r.byMe,
                          count: r.count + (r.byMe ? -1 : 1),
                        }
                      : r,
                  )
                  .filter((r) => r.count > 0)
              : [...current, { emoji, byMe: true, count: 1 }];
            return { ...m, reactions: next };
          }),
        };
      }),
    }));
    setSelectedMsgId(null);
  }

  function deleteMessage(msgId: string) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId
          ? { ...t, messages: t.messages.filter((m) => m.id !== msgId) }
          : t,
      ),
    }));
    setSelectedMsgId(null);
  }

  function cycleDisappearTimer() {
    if (!thread) return;
    const currIdx = DISAPPEAR_OPTIONS.findIndex(
      (o) => o.seconds === (thread.disappearSeconds ?? 0),
    );
    const next = DISAPPEAR_OPTIONS[(currIdx + 1) % DISAPPEAR_OPTIONS.length];
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId ? { ...t, disappearSeconds: next.seconds } : t,
      ),
    }));
    showToast(`Disappearing messages: ${next.label}`);
  }

  const activeTimerLabel =
    DISAPPEAR_OPTIONS.find((o) => o.seconds === (thread.disappearSeconds ?? 0))
      ?.label ?? 'Off';

  return (
    <div className="flex flex-col h-[calc(100vh-54px)] bg-[var(--bg)]">
      {/* Sub-toolbar with E2EE indicator, Disappearing timer & Voice/Video call actions */}
      <div className="bg-[var(--paper)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16A34A]">
            <Lock className="w-3 h-3" />
            E2EE
          </span>
          <button
            type="button"
            onClick={cycleDisappearTimer}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[11px] font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
            title="Cycle disappearing message timer"
          >
            <Clock className="w-3 h-3" />
            <span>{activeTimerLabel}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              startCall({
                refId: thread.id,
                title: thread.name,
                scope: thread.isGroup ? 'group' : 'dm',
                media: 'voice',
                targetOnline: thread.isGroup ? true : thread.online !== false,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Voice</span>
          </button>
          <button
            type="button"
            onClick={() =>
              startCall({
                refId: thread.id,
                title: thread.name,
                scope: thread.isGroup ? 'group' : 'dm',
                media: 'video',
                targetOnline: thread.isGroup ? true : thread.online !== false,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {thread.messages.length === 0 ? (
          <div className="text-center text-xs text-[var(--subtext)] py-10">
            End-to-end encrypted thread. Say hello or start a voice/video call.
          </div>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === 'me';
            const callLog = isCallLog(m.text);
            const missed = m.text.startsWith('Missed ');
            const isSelected = selectedMsgId === m.id;

            if (callLog) {
              return (
                <div key={m.id} className="flex justify-center my-1">
                  <div
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                      missed
                        ? 'bg-[#E5484D]/10 border-[#E5484D]/30 text-[#E5484D]'
                        : 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A]'
                    }`}
                  >
                    {m.text.toLowerCase().includes('video') ? (
                      <Video className="w-3.5 h-3.5" />
                    ) : (
                      <Phone className="w-3.5 h-3.5" />
                    )}
                    <span>{m.text}</span>
                    <span className="opacity-70">• {m.time}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  onClick={() => setSelectedMsgId(isSelected ? null : m.id)}
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] cursor-pointer ${
                    mine
                      ? 'bg-[var(--ink)] text-[var(--paper)] rounded-br-sm'
                      : 'bg-[var(--paper)] text-[var(--text)] border border-[var(--border)] rounded-bl-sm'
                  }`}
                >
                  {thread.isGroup && !mine ? (
                    <div className="text-[10px] font-extrabold opacity-70 mb-0.5">
                      {m.senderName}
                    </div>
                  ) : null}

                  {m.replyTo ? (
                    <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-black/15 text-[11px] border-l-2 border-[#3EE6C4]">
                      <div className="font-bold">{m.replyTo.senderName}</div>
                      <div className="truncate opacity-80">{m.replyTo.text}</div>
                    </div>
                  ) : null}

                  {m.sticker ? (
                    <img
                      src={m.sticker}
                      alt={m.text}
                      className="w-24 h-24 object-contain"
                    />
                  ) : (
                    <p className="leading-snug whitespace-pre-wrap">{m.text}</p>
                  )}

                  <div className="text-[10px] opacity-65 mt-1 flex items-center justify-end gap-1">
                    {m.edited ? <span>Edited •</span> : null}
                    <span>{m.time}</span>
                    {mine ? <Check className="w-3 h-3" /> : null}
                  </div>
                </div>

                {m.reactions && m.reactions.length > 0 ? (
                  <div className="flex items-center gap-1 mt-1 px-1">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => toggleReaction(m.id, r.emoji)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer ${
                          r.byMe
                            ? 'bg-[var(--accent)]/25 border-[var(--accent)] text-[var(--ink)]'
                            : 'bg-[var(--paper)] border-[var(--border)] text-[var(--text)]'
                        }`}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isSelected ? (
                  <div className="mt-1 flex items-center gap-1.5 bg-[var(--paper)] border border-[var(--border)] rounded-xl px-2 py-1 shadow-md">
                    {['👍', '❤️', '😂', '🔥'].map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => toggleReaction(m.id, em)}
                        className="text-sm hover:scale-125 transition-transform cursor-pointer px-1"
                      >
                        {em}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(m);
                        setSelectedMsgId(null);
                      }}
                      className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    {mine && !m.sticker ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsg(m);
                          setDraft(m.text);
                          setSelectedMsgId(null);
                        }}
                        className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => deleteMessage(m.id)}
                        className="p-1 text-[var(--danger)] cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* Sticker Picker */}
      {showStickers ? (
        <div className="bg-[var(--paper)] border-t border-[var(--border)] p-3 grid grid-cols-6 gap-2">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => sendSticker(s.src, s.label)}
              className="p-1.5 rounded-xl hover:bg-[var(--bg)] flex items-center justify-center cursor-pointer"
              title={s.label}
            >
              <img src={s.src} alt={s.label} className="w-10 h-10 object-contain" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Reply / Edit indicator */}
      {replyTo || editingMsg ? (
        <div className="bg-[var(--paper)] border-t border-[var(--border)] px-4 py-1.5 flex items-center justify-between text-xs">
          <div className="truncate text-[var(--subtext)]">
            {editingMsg
              ? `Editing: ${editingMsg.text}`
              : `Replying to ${replyTo?.senderName}: ${replyTo?.text}`}
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setEditingMsg(null);
              setDraft('');
            }}
            className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}

      {/* Composer */}
      <form
        onSubmit={sendMessage}
        className="bg-[var(--paper)] border-t border-[var(--border)] p-3 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setShowStickers((v) => !v)}
          className={`p-2 rounded-xl border border-[var(--border)] cursor-pointer ${
            showStickers ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--subtext)]'
          }`}
          aria-label="Stickers"
        >
          <Smile className="w-5 h-5" />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
        />
        <button
          type="submit"
          className="w-10 h-10 rounded-xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center cursor-pointer shrink-0"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
