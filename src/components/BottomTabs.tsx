import {
  Calendar,
  Home,
  Megaphone,
  MessageCircle,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { TabId } from '../types';

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'update', label: 'Update', icon: Megaphone },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'feed', label: 'Home', icon: Home },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'events', label: 'Event', icon: Calendar },
];

export function BottomTabs({ activeTab }: { activeTab: TabId | null }) {
  const { state, navigate } = useApp();

  const chatUnread = state.threads
    .filter((t) => !t.isGroup)
    .reduce((sum, t) => sum + t.unread, 0);
  const teamsUnread = state.threads
    .filter((t) => t.isGroup && t.communityId === state.selectedCommunityId)
    .reduce((sum, t) => sum + t.unread, 0);
  const updateUnread = state.notifications.filter(
    (n) => !n.read && n.targetTab === 'update',
  ).length;

  const badges: Record<TabId, number> = {
    update: updateUnread,
    chat: chatUnread,
    feed: 0,
    teams: teamsUnread,
    events: 0,
  };

  return (
    <nav className="sticky bottom-0 z-20 bg-[var(--paper)] border-t border-[var(--border)] h-[70px] px-2 flex items-center justify-around shrink-0">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = activeTab === t.id;
        const badge = badges[t.id];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ kind: 'tab', tab: t.id })}
            className={`relative flex flex-col items-center justify-center gap-1 px-4 py-1.5 rounded-xl transition-colors cursor-pointer ${
              active
                ? 'text-[var(--ink)]'
                : 'text-[var(--subtext)] hover:text-[var(--text)]'
            }`}
          >
            <div className="relative">
              <Icon className="w-[22px] h-[22px]" />
              {badge > 0 ? (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] rounded-full bg-[var(--ink)] text-[var(--paper)] text-[10px] font-bold flex items-center justify-center px-1">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </div>
            <span className="text-[11px] font-semibold">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
