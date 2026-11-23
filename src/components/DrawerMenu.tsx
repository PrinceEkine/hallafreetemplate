import {
  BarChart2,
  Briefcase,
  CheckCircle2,
  FileText,
  Folder,
  Images,
  KeyRound,
  ListTodo,
  LogOut,
  Phone,
  Pin,
  Plus,
  Search,
  User,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_MODULES } from '../data/store';
import type { CommunityModuleId } from '../types';

const MODULE_ICONS: Record<CommunityModuleId, React.ComponentType<{ className?: string }>> = {
  directory: Users,
  actions: Video,
  task: ListTodo,
  forms: FileText,
  media: Images,
  files: Folder,
  approval: CheckCircle2,
  polls: BarChart2,
  pay: Wallet,
  project: Briefcase,
  contact: Phone,
};

export function DrawerMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, setState, navigate, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');

  if (!open) return null;

  const activeCommunity = state.communities.find(
    (c) => c.id === state.selectedCommunityId,
  );
  const needle = query.trim().toLowerCase();
  const filteredCommunities = state.communities.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle),
  );

  function switchCommunity(id: string) {
    setState((prev) => ({
      ...prev,
      selectedCommunityId: id,
      communities: prev.communities.map((c) =>
        c.id === id ? { ...c, unread: false } : c,
      ),
    }));
    onClose();
    navigate({ kind: 'tab', tab: 'feed' });
  }

  function openModule(modId: CommunityModuleId) {
    onClose();
    navigate({ kind: 'module', module: modId });
  }

  function handleCreateCommunity(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const id = `comm-${Date.now()}`;
    const code = `${name.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}-2026`;
    setState((prev) => ({
      ...prev,
      selectedCommunityId: id,
      communities: [
        ...prev.communities,
        {
          id,
          name,
          description: newDesc.trim() || `${name} staff workspace.`,
          inviteCode: code,
          modules: {
            directory: true,
            actions: true,
            task: true,
            forms: true,
            media: true,
            files: true,
            approval: true,
            polls: true,
            pay: true,
            project: true,
            contact: true,
          },
        },
      ],
      members: {
        ...prev.members,
        [id]: [
          {
            userId: 'me',
            name: prev.userName,
            role: 'owner',
            tag: 'Founder',
            email: 'staff@ophixe.com',
            phone: '+234 803 000 1001',
          },
        ],
      },
    }));
    setNewName('');
    setNewDesc('');
    setCreating(false);
    onClose();
    showToast(`Created ${name} (${code})`);
    navigate({ kind: 'tab', tab: 'feed' });
  }

  function handleJoinCommunity(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const existing = state.communities.find((c) => c.inviteCode === code);
    if (existing) {
      switchCommunity(existing.id);
      setJoinCode('');
      setJoining(false);
      showToast(`Switched to ${existing.name}`);
      return;
    }
    const id = `comm-${Date.now()}`;
    const name = code.split('-')[0] || 'Staff Branch';
    setState((prev) => ({
      ...prev,
      selectedCommunityId: id,
      communities: [
        ...prev.communities,
        {
          id,
          name,
          description: `Joined via invite code ${code}.`,
          inviteCode: code,
          modules: {
            directory: true,
            actions: true,
            task: true,
            forms: true,
            media: true,
            files: true,
            approval: true,
            polls: true,
            pay: true,
            project: true,
            contact: true,
          },
        },
      ],
    }));
    setJoinCode('');
    setJoining(false);
    onClose();
    showToast(`Joined ${name}`);
    navigate({ kind: 'tab', tab: 'feed' });
  }

  function handleSignOut() {
    onClose();
    setState((prev) => ({ ...prev, signedIn: false }));
    navigate({ kind: 'welcome' });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="relative z-10 w-[340px] max-w-[90vw] h-full bg-[var(--paper)] flex shadow-2xl border-r border-[var(--border)]">
        {/* Left community rail (96px) */}
        <div className="w-[92px] bg-[var(--bg)] border-r border-[var(--border)] py-4 px-2 flex flex-col items-center gap-4 overflow-y-auto shrink-0">
          {filteredCommunities.map((community) => {
            const active = community.id === state.selectedCommunityId;
            return (
              <button
                key={community.id}
                type="button"
                onClick={() => switchCommunity(community.id)}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="relative">
                  <div
                    className={`rounded-full flex items-center justify-center font-extrabold transition-all ${
                      active
                        ? 'w-[56px] h-[56px] text-[20px] border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]'
                        : 'w-[50px] h-[50px] text-[18px] bg-[var(--card)] text-[var(--ink)] group-hover:bg-[var(--border)]'
                    }`}
                  >
                    {community.name.slice(0, 1).toUpperCase()}
                  </div>
                  {community.pinned ? (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center">
                      <Pin className="w-2.5 h-2.5" />
                    </span>
                  ) : null}
                  {community.unread && !active ? (
                    <span className="absolute top-0.5 -left-0.5 w-3 h-3 rounded-full bg-[var(--danger)] border-2 border-[var(--paper)]" />
                  ) : null}
                </div>
                <span
                  className={`text-[10px] font-bold text-center mt-1.5 leading-tight uppercase ${
                    active ? 'text-[var(--ink)]' : 'text-[var(--subtext)]'
                  }`}
                >
                  {community.name}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setJoining(false);
            }}
            className="flex flex-col items-center cursor-pointer"
          >
            <div className="w-[50px] h-[50px] rounded-full bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center hover:opacity-90">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-[var(--subtext)] text-center mt-1.5">
              CREATE NEW
            </span>
          </button>
        </div>

        {/* Right main panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--paper)]">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[var(--ink)] text-[var(--paper)] font-extrabold flex items-center justify-center shrink-0">
                {(activeCommunity?.name ?? 'C').slice(0, 1).toUpperCase()}
              </div>
              <span className="font-heading text-[16px] font-bold text-[var(--ink)] uppercase truncate">
                {activeCommunity?.name ?? 'Community'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--paper)]">
              <Search className="w-4 h-4 text-[var(--subtext)] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search communities"
                className="w-full text-[13px] bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--subtext)]"
              />
            </div>
          </div>

          {creating ? (
            <form onSubmit={handleCreateCommunity} className="p-3 space-y-2.5">
              <div className="text-xs font-extrabold tracking-wider text-[var(--text)]">
                NEW COMMUNITY
              </div>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Community name (e.g. Abuja Hub)"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-bold cursor-pointer"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--subtext)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : joining ? (
            <form onSubmit={handleJoinCommunity} className="p-3 space-y-2.5">
              <div className="text-xs font-extrabold tracking-wider text-[var(--text)]">
                JOIN BY INVITE CODE
              </div>
              <input
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. IKEJA-BR-2026"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none uppercase"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-bold cursor-pointer"
                >
                  Join
                </button>
                <button
                  type="button"
                  onClick={() => setJoining(false)}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--subtext)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {COMMUNITY_MODULES.map((mod) => {
                const Icon = MODULE_ICONS[mod.id];
                const label =
                  mod.id === 'approval' && state.userRole !== 'admin'
                    ? 'REQUESTS'
                    : mod.label;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => openModule(mod.id)}
                    className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-[var(--bg)] text-left transition-colors cursor-pointer"
                  >
                    <Icon className="w-[18px] h-[18px] text-[var(--ink)] shrink-0" />
                    <span className="text-[13px] font-bold text-[var(--text)]">
                      {label}
                    </span>
                  </button>
                );
              })}

              <div className="h-px bg-[var(--border)] my-3" />

              <button
                type="button"
                onClick={() => setJoining(true)}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-[var(--bg)] text-left transition-colors cursor-pointer"
              >
                <KeyRound className="w-[18px] h-[18px] text-[var(--ink)] shrink-0" />
                <span className="text-[13px] font-bold text-[var(--text)]">
                  JOIN A COMMUNITY
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate({ kind: 'profile' });
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-[var(--bg)] text-left transition-colors cursor-pointer"
              >
                <User className="w-[18px] h-[18px] text-[var(--ink)] shrink-0" />
                <span className="text-[13px] font-bold text-[var(--text)]">
                  MY ACCOUNT
                </span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-[var(--bg)] text-left transition-colors cursor-pointer"
              >
                <LogOut className="w-[18px] h-[18px] text-[var(--ink)] shrink-0" />
                <span className="text-[13px] font-bold text-[var(--text)]">
                  SIGN OUT
                </span>
              </button>
            </nav>
          )}
        </div>
      </aside>
    </div>
  );
}
