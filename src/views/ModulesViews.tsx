import {
  Briefcase,
  CheckCircle2,
  Folder,
  Images,
  MessageCircle,
  Moon,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Plus,
  Radio,
  Sun,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { useCalls } from '../components/CallSystem';
import { Logo } from '../components/Logo';
import { useApp } from '../context/AppContext';
import { FORM_DEFS, FORM_TYPES, formatNaira } from '../data/store';
import type { CommunityModuleId, FormType, TaskStatus } from '../types';

export function WelcomeView() {
  const { setState, navigate } = useApp();
  const [nameInput, setNameInput] = useState('Adaeze O.');
  const [role, setRole] = useState<'admin' | 'staff'>('admin');

  function handleEnter(e: React.FormEvent) {
    e.preventDefault();
    setState((prev) => ({
      ...prev,
      signedIn: true,
      userName: nameInput.trim() || 'Adaeze O.',
      userRole: role,
    }));
    navigate({ kind: 'tab', tab: 'feed' });
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[400px] bg-[#111318] border border-white/15 rounded-3xl p-6 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-3">
          <Logo size={68} />
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-[2px] uppercase">
              OPHIXE
            </h1>
            <p className="text-xs text-white/65 mt-1">
              Staff announcements, encrypted chat, calls & workplace hub
            </p>
          </div>
        </div>

        <form onSubmit={handleEnter} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">
              Staff Name
            </label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/20 text-sm text-white outline-none focus:border-[#3EE6C4]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">
              Role Preview
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'staff'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`py-2 rounded-xl text-xs font-extrabold uppercase cursor-pointer border ${
                    role === r
                      ? 'bg-[#3EE6C4] text-black border-[#3EE6C4]'
                      : 'bg-black text-white/75 border-white/15'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-white text-black font-extrabold text-sm cursor-pointer hover:bg-[#3EE6C4] transition-colors"
          >
            ENTER WORKSPACE
          </button>
        </form>
      </div>
    </div>
  );
}

export function ModuleRouterView({ module }: { module: CommunityModuleId }) {
  switch (module) {
    case 'actions':
      return <MeetingRoomsModule />;
    case 'pay':
      return <PayModule />;
    case 'forms':
      return <FormsModule />;
    case 'approval':
      return <ApprovalsModule />;
    case 'task':
      return <TasksModule />;
    case 'polls':
      return <PollsModule />;
    case 'directory':
      return <DirectoryModule />;
    case 'media':
      return (
        <PlaceholderModule
          icon={Images}
          title="MEDIA"
          description="Photos and videos shared across announcements, posts, and team channels."
        />
      );
    case 'files':
      return (
        <PlaceholderModule
          icon={Folder}
          title="FILES"
          description="Handbooks, PDF memos, and shared workplace documents."
        />
      );
    case 'project':
      return (
        <PlaceholderModule
          icon={Briefcase}
          title="PROJECT"
          description="Cross-department initiatives, milestones, and deliverables."
        />
      );
    case 'contact':
      return (
        <PlaceholderModule
          icon={Phone}
          title="CONTACT"
          description="Community helpdesk, HR support line, and emergency contacts."
        />
      );
  }
}

function MeetingRoomsModule() {
  const { state, showToast } = useApp();
  const { startCall, triggerIncomingDemoCall } = useCalls();

  const rooms = state.meetings.filter(
    (m) => m.communityId === state.selectedCommunityId,
  );

  return (
    <div className="p-4 space-y-3">
      <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-heading text-sm font-bold uppercase text-[var(--ink)]">
            Meeting Rooms & Calls
          </div>
          <p className="text-xs text-[var(--subtext)] mt-0.5">
            Join a live voice/video room or test incoming call alerts
          </p>
        </div>
        <button
          type="button"
          onClick={() => triggerIncomingDemoCall('video')}
          className="px-3 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <PhoneIncoming className="w-3.5 h-3.5" />
          <span>Test Incoming</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {room.kind === 'podcast' ? (
                  <Radio className="w-4 h-4 text-[var(--ink)]" />
                ) : (
                  <Video className="w-4 h-4 text-[var(--ink)]" />
                )}
                <span className="text-sm font-extrabold text-[var(--ink)] truncate">
                  {room.name}
                </span>
                {room.live ? (
                  <span className="px-2 py-0.5 rounded bg-[#E5484D] text-white text-[10px] font-extrabold">
                    LIVE • {room.participants}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-[var(--subtext)] mt-1">
                {room.kind === 'management'
                  ? 'Management & department leads'
                  : room.kind === 'podcast'
                    ? 'Audio broadcast channel'
                    : 'Open staff meeting room'}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  startCall({
                    refId: room.id,
                    title: room.name,
                    scope: 'room',
                    media: 'voice',
                  })
                }
                className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Voice</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (room.kind === 'podcast') {
                    showToast('Podcast Radio starts in voice broadcast mode');
                    startCall({
                      refId: room.id,
                      title: room.name,
                      scope: 'room',
                      media: 'voice',
                    });
                    return;
                  }
                  startCall({
                    refId: room.id,
                    title: room.name,
                    scope: 'room',
                    media: 'video',
                  });
                }}
                className="px-3 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayModule() {
  const { state, setState, showToast } = useApp();
  const comm = state.communities.find((c) => c.id === state.selectedCommunityId);
  const dues = state.dues.filter((d) => d.communityId === state.selectedCommunityId);
  const claims = state.claims.filter((c) => c.communityId === state.selectedCommunityId);

  function claimDue(dueId: string) {
    const due = dues.find((d) => d.id === dueId);
    if (!due) return;
    setState((prev) => ({
      ...prev,
      dues: prev.dues.map((d) => (d.id === dueId ? { ...d, claimed: true } : d)),
      claims: [
        {
          id: `claim-${Date.now()}`,
          communityId: prev.selectedCommunityId,
          dueId: due.id,
          dueTitle: due.title,
          memberName: prev.userName,
          amountKobo: due.amountKobo,
          createdAt: 'Just now',
        },
        ...prev.claims,
      ],
    }));
    showToast('Transfer claim submitted to admin');
  }

  function approveClaim(claimId: string, dueId: string, memberName: string) {
    setState((prev) => ({
      ...prev,
      claims: prev.claims.filter((c) => c.id !== claimId),
      dues: prev.dues.map((d) =>
        d.id === dueId
          ? {
              ...d,
              paid: memberName === prev.userName ? true : d.paid,
              claimed: false,
              payers: d.payers.includes(memberName)
                ? d.payers
                : [...d.payers, memberName],
            }
          : d,
      ),
    }));
    showToast(`Confirmed payment for ${memberName}`);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#000000] text-white rounded-2xl p-4 space-y-1.5">
        <div className="text-[10px] font-extrabold tracking-widest text-[#3EE6C4] flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5" />
          COMMUNITY ACCOUNT
        </div>
        <div className="text-lg font-extrabold">{comm?.accountNumber ?? '0128492011'}</div>
        <div className="text-xs text-white/75">
          {comm?.accountName ?? 'Ophixe Welfare'} • {comm?.bankName ?? 'GTBank'}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="font-heading text-xs font-bold uppercase text-[var(--subtext)]">
          DUES & CONTRIBUTIONS
        </div>
        {dues.map((d) => (
          <div
            key={d.id}
            className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-extrabold text-[var(--ink)]">{d.title}</div>
              <div className="text-xs font-bold text-[var(--subtext)] mt-0.5">
                {formatNaira(d.amountKobo)} • {d.payers.length} paid
              </div>
            </div>
            {d.paid ? (
              <span className="px-3 py-1 rounded-lg bg-[#16A34A]/15 text-[#16A34A] text-xs font-extrabold">
                PAID
              </span>
            ) : d.claimed ? (
              <span className="px-3 py-1 rounded-lg bg-[#F5A623]/15 text-[#F5A623] text-xs font-extrabold">
                CLAIMED
              </span>
            ) : (
              <button
                type="button"
                onClick={() => claimDue(d.id)}
                className="px-3 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
              >
                I HAVE TRANSFERRED
              </button>
            )}
          </div>
        ))}
      </div>

      {state.userRole === 'admin' && claims.length > 0 ? (
        <div className="space-y-2">
          <div className="font-heading text-xs font-bold uppercase text-[var(--subtext)]">
            PENDING CLAIMS
          </div>
          {claims.map((c) => (
            <div
              key={c.id}
              className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-sm font-bold text-[var(--ink)]">{c.memberName}</div>
                <div className="text-xs text-[var(--subtext)]">
                  {c.dueTitle} • {formatNaira(c.amountKobo)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => approveClaim(c.id, c.dueId, c.memberName)}
                className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-extrabold cursor-pointer"
              >
                CONFIRM
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormsModule() {
  const { state, setState, showToast } = useApp();
  const [activeType, setActiveType] = useState<FormType | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!activeType) return;
    const typeTitle =
      FORM_TYPES.find((f) => f.id === activeType)?.title ?? activeType;
    setState((prev) => ({
      ...prev,
      submissions: [
        {
          id: `sub-${Date.now()}`,
          communityId: prev.selectedCommunityId,
          type: activeType,
          typeTitle,
          submitterName: prev.userName,
          status: 'pending',
          createdAt: 'Just now',
          fields: values,
        },
        ...prev.submissions,
      ],
    }));
    setActiveType(null);
    setValues({});
    showToast(`${typeTitle} submitted`);
  }

  return (
    <div className="p-4 space-y-4">
      {!activeType ? (
        <div className="space-y-2.5">
          {FORM_TYPES.map((ft) => (
            <button
              key={ft.id}
              type="button"
              onClick={() => {
                setActiveType(ft.id);
                setValues({});
              }}
              className="w-full text-left bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between hover:border-[var(--ink)]/50 cursor-pointer"
            >
              <span className="text-sm font-extrabold text-[var(--ink)]">{ft.title}</span>
              <span className="text-xs font-bold text-[var(--subtext)]">Open</span>
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={submitForm}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-sm font-bold uppercase text-[var(--ink)]">
              {FORM_TYPES.find((f) => f.id === activeType)?.title}
            </h3>
            <button
              type="button"
              onClick={() => setActiveType(null)}
              className="text-xs font-bold text-[var(--subtext)] cursor-pointer"
            >
              Back
            </button>
          </div>
          {FORM_DEFS[activeType].map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-[11px] font-extrabold text-[var(--subtext)]">
                {field.label}
              </label>
              {field.kind === 'select' ? (
                <select
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
                >
                  <option value="">Select…</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'textarea' ? (
                <textarea
                  required={field.required}
                  rows={3}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
                />
              ) : (
                <input
                  required={field.required}
                  type={field.kind === 'date' ? 'date' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
                />
              )}
            </div>
          ))}
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
          >
            SUBMIT REQUEST
          </button>
        </form>
      )}
    </div>
  );
}

function ApprovalsModule() {
  const { state, setState, showToast } = useApp();
  const isAdmin = state.userRole === 'admin';
  const items = state.submissions.filter(
    (s) =>
      s.communityId === state.selectedCommunityId &&
      (isAdmin || s.submitterName === state.userName),
  );

  function decide(id: string, status: 'approved' | 'rejected') {
    setState((prev) => ({
      ...prev,
      submissions: prev.submissions.map((s) =>
        s.id === id ? { ...s, status } : s,
      ),
    }));
    showToast(`Request ${status}`);
  }

  return (
    <div className="p-4 space-y-2.5">
      {items.map((sub) => (
        <div
          key={sub.id}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold text-[var(--ink)]">
                {sub.typeTitle}
              </div>
              <div className="text-xs text-[var(--subtext)]">
                {sub.submitterName} • {sub.createdAt}
              </div>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                sub.status === 'approved'
                  ? 'bg-[#16A34A]/15 text-[#16A34A]'
                  : sub.status === 'rejected'
                    ? 'bg-[#E5484D]/15 text-[#E5484D]'
                    : 'bg-[#F5A623]/15 text-[#F5A623]'
              }`}
            >
              {sub.status}
            </span>
          </div>
          {isAdmin && sub.status === 'pending' ? (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => decide(sub.id, 'approved')}
                className="flex-1 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-extrabold cursor-pointer"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => decide(sub.id, 'rejected')}
                className="flex-1 py-1.5 rounded-lg bg-[#E5484D] text-white text-xs font-extrabold cursor-pointer"
              >
                Decline
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TasksModule() {
  const { state, setState, showToast } = useApp();
  const [title, setTitle] = useState('');
  const tasks = state.tasks.filter((t) => t.communityId === state.selectedCommunityId);

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setState((prev) => ({
      ...prev,
      tasks: [
        {
          id: `task-${Date.now()}`,
          communityId: prev.selectedCommunityId,
          title: title.trim(),
          detail: 'Assigned via web hub',
          status: 'open',
          assigneeNames: [prev.userName],
          createdAt: 'Just now',
        },
        ...prev.tasks,
      ],
    }));
    setTitle('');
    showToast('Task created');
  }

  function cycleStatus(id: string, curr: TaskStatus) {
    const next: TaskStatus =
      curr === 'open' ? 'in_progress' : curr === 'in_progress' ? 'done' : 'open';
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, status: next } : t)),
    }));
  }

  return (
    <div className="p-4 space-y-3">
      <form
        onSubmit={addTask}
        className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3 flex items-center gap-2"
      >
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title…"
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)] outline-none"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </form>

      {tasks.map((t) => (
        <div
          key={t.id}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-start justify-between gap-3"
        >
          <div>
            <div className="text-sm font-extrabold text-[var(--ink)]">{t.title}</div>
            <div className="text-xs text-[var(--subtext)] mt-0.5">{t.detail}</div>
            <div className="text-[11px] font-semibold text-[var(--subtext)] mt-1.5">
              Assignees: {t.assigneeNames.join(', ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => cycleStatus(t.id, t.status)}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[10px] font-extrabold uppercase text-[var(--ink)] cursor-pointer shrink-0"
          >
            {t.status.replace('_', ' ')}
          </button>
        </div>
      ))}
    </div>
  );
}

function PollsModule() {
  const { state, setState } = useApp();
  const polls = state.polls.filter((p) => p.communityId === state.selectedCommunityId);

  function vote(pollId: string, optId: string) {
    setState((prev) => ({
      ...prev,
      polls: prev.polls.map((p) => {
        if (p.id !== pollId || p.closed || p.votedOptionId === optId) return p;
        return {
          ...p,
          votedOptionId: optId,
          options: p.options.map((o) => {
            if (o.id === optId) return { ...o, votes: o.votes + 1 };
            if (o.id === p.votedOptionId) return { ...o, votes: Math.max(0, o.votes - 1) };
            return o;
          }),
        };
      }),
    }));
  }

  return (
    <div className="p-4 space-y-3">
      {polls.map((poll) => {
        const total = Math.max(
          1,
          poll.options.reduce((s, o) => s + o.votes, 0),
        );
        return (
          <div
            key={poll.id}
            className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-extrabold text-[var(--ink)]">
                {poll.question}
              </div>
              {poll.closed ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[var(--card)] text-[var(--subtext)]">
                  CLOSED
                </span>
              ) : null}
            </div>
            <div className="space-y-1.5">
              {poll.options.map((opt) => {
                const pct = Math.round((opt.votes / total) * 100);
                const chosen = poll.votedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={poll.closed}
                    onClick={() => vote(poll.id, opt.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      chosen
                        ? 'border-[var(--ink)] bg-[var(--ink)]/5'
                        : 'border-[var(--border)] hover:bg-[var(--bg)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)]">
                      <span>{opt.label}</span>
                      <span>
                        {pct}% ({opt.votes})
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DirectoryModule() {
  const { state, setState, navigate } = useApp();
  const { startCall } = useCalls();
  const members = state.members[state.selectedCommunityId] ?? [];

  function messageMember(name: string) {
    const hit = state.threads.find(
      (t) => !t.isGroup && t.name.toLowerCase() === name.toLowerCase(),
    );
    if (hit) {
      navigate({ kind: 'chat-thread', threadId: hit.id });
      return;
    }
    const id = `dm-${Date.now()}`;
    setState((prev) => ({
      ...prev,
      threads: [
        {
          id,
          communityId: prev.selectedCommunityId,
          name: name.toUpperCase(),
          preview: 'New encrypted conversation',
          time: 'Now',
          unread: 0,
          fav: false,
          isGroup: false,
          online: true,
          messages: [],
        },
        ...prev.threads,
      ],
    }));
    navigate({ kind: 'chat-thread', threadId: id });
  }

  return (
    <div className="p-4 space-y-2.5">
      {members.map((m) => (
        <div
          key={m.userId}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[var(--ink)] text-[var(--paper)] font-extrabold flex items-center justify-center shrink-0">
              {m.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-[var(--ink)] truncate">
                {m.name}
              </div>
              <div className="text-xs text-[var(--subtext)] truncate">
                {m.tag ?? m.role} • {m.email}
              </div>
            </div>
          </div>

          {m.userId !== 'me' ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => messageMember(m.name)}
                className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink)] cursor-pointer"
                aria-label={`Message ${m.name}`}
              >
                <MessageCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  startCall({
                    refId: `dir-${m.userId}`,
                    title: m.name.toUpperCase(),
                    scope: 'dm',
                    media: 'voice',
                    targetOnline: true,
                  })
                }
                className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink)] cursor-pointer"
                aria-label={`Voice call ${m.name}`}
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  startCall({
                    refId: `dir-${m.userId}`,
                    title: m.name.toUpperCase(),
                    scope: 'dm',
                    media: 'video',
                    targetOnline: true,
                  })
                }
                className="p-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] cursor-pointer"
                aria-label={`Video call ${m.name}`}
              >
                <Video className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-extrabold text-[var(--subtext)]">YOU</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PlaceholderModule({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4">
      <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-6 text-center space-y-2.5">
        <div className="w-12 h-12 rounded-full bg-[var(--bg)] mx-auto flex items-center justify-center text-[var(--ink)]">
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="font-heading text-base font-bold uppercase text-[var(--ink)]">
          {title}
        </h3>
        <p className="text-xs text-[var(--subtext)] max-w-[300px] mx-auto">
          {description}
        </p>
      </div>
    </div>
  );
}

export function NotificationsView() {
  const { state, setState, navigate } = useApp();

  function markAllRead() {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-heading text-xs font-bold uppercase text-[var(--subtext)]">
          NOTIFICATIONS
        </span>
        <button
          type="button"
          onClick={markAllRead}
          className="text-xs font-bold text-[var(--ink)] cursor-pointer"
        >
          Mark all read
        </button>
      </div>
      <div className="space-y-2">
        {state.notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              setState((prev) => ({
                ...prev,
                notifications: prev.notifications.map((item) =>
                  item.id === n.id ? { ...item, read: true } : item,
                ),
              }));
              if (n.targetModule) {
                navigate({ kind: 'module', module: n.targetModule });
              } else if (n.targetTab) {
                navigate({ kind: 'tab', tab: n.targetTab });
              }
            }}
            className="w-full text-left bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-start justify-between gap-2 cursor-pointer"
          >
            <div>
              <div className="text-sm font-extrabold text-[var(--ink)] flex items-center gap-2">
                {!n.read ? (
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                ) : null}
                <span>{n.title}</span>
              </div>
              <div className="text-xs text-[var(--text)] mt-0.5">{n.body}</div>
            </div>
            <span className="text-[11px] text-[var(--subtext)] shrink-0">{n.time}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileView() {
  const { state, setState, theme, toggleTheme, resetDemo, showToast } = useApp();

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-5 flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-full bg-[var(--ink)] text-[var(--paper)] font-extrabold text-xl flex items-center justify-center">
          {state.userName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-base font-extrabold text-[var(--ink)]">
            {state.userName}
          </div>
          <div className="text-xs font-bold uppercase text-[var(--subtext)]">
            {state.userRole} •{' '}
            {state.communities.find((c) => c.id === state.selectedCommunityId)
              ?.name ?? 'Workspace'}
          </div>
        </div>
      </div>

      <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold text-[var(--ink)]">Appearance</div>
            <div className="text-xs text-[var(--subtext)]">
              Switch between Light and Dark themes
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3.5 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4" />
                <span>LIGHT</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4" />
                <span>DARK</span>
              </>
            )}
          </button>
        </div>

        <div className="h-px bg-[var(--border)]" />

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold text-[var(--ink)]">Role View</div>
            <div className="text-xs text-[var(--subtext)]">
              Toggle Admin vs Staff permissions
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = state.userRole === 'admin' ? 'staff' : 'admin';
              setState((prev) => ({ ...prev, userRole: next }));
              showToast(`Switched to ${next.toUpperCase()} view`);
            }}
            className="px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs font-extrabold uppercase text-[var(--ink)] cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{state.userRole}</span>
          </button>
        </div>

        <div className="h-px bg-[var(--border)]" />

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold text-[var(--ink)]">Reset Demo</div>
            <div className="text-xs text-[var(--subtext)]">
              Restore initial demo workspace state
            </div>
          </div>
          <button
            type="button"
            onClick={resetDemo}
            className="px-3.5 py-2 rounded-xl bg-[var(--danger)] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>RESET</span>
          </button>
        </div>
      </div>
    </div>
  );
}
