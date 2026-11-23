import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { BottomTabs } from './components/BottomTabs';
import { CallProvider } from './components/CallSystem';
import { DrawerMenu } from './components/DrawerMenu';
import { AppProvider, useApp } from './context/AppContext';
import { COMMUNITY_MODULES } from './data/store';
import { ChatListView, ChatThreadView, TeamsView } from './views/ChatViews';
import { EventsView } from './views/EventsView';
import { FeedView } from './views/FeedView';
import {
  ModuleRouterView,
  NotificationsView,
  ProfileView,
  WelcomeView,
} from './views/ModulesViews';
import { UpdateView } from './views/UpdateView';

function AppShell() {
  const { state, route, toast } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (route.kind === 'welcome' || !state.signedIn) {
    return (
      <CallProvider>
        <WelcomeView />
      </CallProvider>
    );
  }

  let headerTitle = 'OPHIXE';
  let showBack = false;
  let chatHeader:
    | { name: string; statusText: string; online?: boolean }
    | undefined;
  let activeTab: 'update' | 'chat' | 'feed' | 'teams' | 'events' | null = null;

  if (route.kind === 'tab') {
    activeTab = route.tab;
    const titles = {
      update: 'UPDATES',
      chat: 'CHAT',
      feed: 'HOME',
      teams: 'TEAMS',
      events: 'EVENTS',
    };
    headerTitle = titles[route.tab];
  } else if (route.kind === 'chat-thread') {
    showBack = true;
    const thread = state.threads.find((t) => t.id === route.threadId);
    if (thread) {
      chatHeader = {
        name: thread.name,
        statusText: thread.isGroup
          ? thread.description || 'Team channel'
          : thread.online
            ? 'Online • End-to-end encrypted'
            : 'End-to-end encrypted',
        online: !thread.isGroup && Boolean(thread.online),
      };
    }
  } else if (route.kind === 'module') {
    showBack = true;
    const mod = COMMUNITY_MODULES.find((m) => m.id === route.module);
    headerTitle = mod?.label ?? 'MODULE';
  } else if (route.kind === 'notifications') {
    showBack = true;
    headerTitle = 'NOTIFICATIONS';
  } else if (route.kind === 'profile') {
    showBack = true;
    headerTitle = 'MY ACCOUNT';
  }

  return (
    <CallProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex justify-center">
        <div className="w-full max-w-[520px] min-h-screen bg-[var(--bg)] border-x border-[var(--border)] flex flex-col relative shadow-sm">
          <AppHeader
            title={headerTitle}
            showBack={showBack}
            onOpenDrawer={() => setDrawerOpen(true)}
            chatHeader={chatHeader}
          />

          <main className="flex-1 overflow-y-auto">
            {route.kind === 'tab' && route.tab === 'feed' ? <FeedView /> : null}
            {route.kind === 'tab' && route.tab === 'update' ? (
              <UpdateView />
            ) : null}
            {route.kind === 'tab' && route.tab === 'chat' ? (
              <ChatListView />
            ) : null}
            {route.kind === 'tab' && route.tab === 'teams' ? (
              <TeamsView />
            ) : null}
            {route.kind === 'tab' && route.tab === 'events' ? (
              <EventsView />
            ) : null}
            {route.kind === 'chat-thread' ? (
              <ChatThreadView threadId={route.threadId} />
            ) : null}
            {route.kind === 'module' ? (
              <ModuleRouterView module={route.module} />
            ) : null}
            {route.kind === 'notifications' ? <NotificationsView /> : null}
            {route.kind === 'profile' ? <ProfileView /> : null}
          </main>

          {route.kind !== 'chat-thread' ? (
            <BottomTabs activeTab={activeTab} />
          ) : null}

          <DrawerMenu
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />

          {toast ? (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-[#000000] text-white text-xs font-bold shadow-xl border border-white/15">
              {toast}
            </div>
          ) : null}
        </div>
      </div>
    </CallProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
