import { Bell, ChevronLeft, Menu, User } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function AppHeader({
  title,
  showBack = false,
  onOpenDrawer,
  chatHeader,
}: {
  title: string;
  showBack?: boolean;
  onOpenDrawer: () => void;
  chatHeader?: {
    name: string;
    statusText: string;
    online?: boolean;
  };
}) {
  const { state, navigate, goBack } = useApp();
  const activeCommunity = state.communities.find(
    (c) => c.id === state.selectedCommunityId,
  );
  const unreadNotifs = state.notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 bg-[#000000] text-white h-[54px] px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        ) : null}
        {!chatHeader ? (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Open workspace menu"
          >
            <Menu className="w-6 h-6 text-white" />
          </button>
        ) : null}
        {chatHeader ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white text-black font-extrabold text-base flex items-center justify-center shrink-0">
              {chatHeader.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white truncate leading-tight">
                {chatHeader.name}
              </div>
              <div
                className={`text-[11px] truncate ${
                  chatHeader.online ? 'text-[#4ADE80]' : 'text-white/70'
                }`}
              >
                {chatHeader.statusText}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {!chatHeader ? (
        <h1 className="font-heading text-[14px] tracking-[1px] font-bold text-white uppercase pointer-events-none">
          {title}
        </h1>
      ) : null}

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => navigate({ kind: 'notifications' })}
          className="relative p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-white" />
          {unreadNotifs > 0 ? (
            <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-[#E5484D] text-white text-[10px] font-extrabold flex items-center justify-center px-1">
              {unreadNotifs > 99 ? '99+' : unreadNotifs}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => navigate({ kind: 'profile' })}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="My account"
        >
          <User className="w-5 h-5 text-white" />
        </button>
        <button
          type="button"
          onClick={onOpenDrawer}
          className="w-7 h-7 rounded-full bg-black border border-white text-white text-xs font-extrabold flex items-center justify-center cursor-pointer hover:border-[#3EE6C4] transition-colors"
          title={activeCommunity?.name ?? 'Community'}
        >
          {(activeCommunity?.name ?? 'O').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  );
}
