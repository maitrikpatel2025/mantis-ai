'use client';

import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { AppSidebar } from './app-sidebar.js';
import { Chat } from './chat.js';
import { ConversationsPanel } from './conversations-panel.js';
import { SidebarProvider, SidebarInset, useSidebar } from './ui/sidebar.js';
import { ChatNavProvider } from './chat-nav-context.js';
import { UpdateBanner } from './update-banner.js';
import { HealthIndicator } from './page-layout.js';
import { getChatMessages, getModelsCatalog, getUnreadNotificationCount } from '../actions.js';
import {
  MessageIcon, BellIcon, SettingsIcon, SunIcon, MoonIcon, BugIcon, LogOutIcon,
} from './icons.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';

interface SessionUser {
  email?: string;
}

interface Session {
  user?: SessionUser;
}

interface UIMessageData {
  id: string;
  role: string;
  content: string;
  parts: Array<{ type: string; text: string }>;
  createdAt: Date;
}

interface ChatPageProps {
  session: Session;
  needsSetup?: boolean;
  chatId?: string;
}

/**
 * Main chat page component.
 */
export function ChatPage({ session, needsSetup, chatId }: ChatPageProps) {
  const [activeChatId, setActiveChatId] = useState<string | null>(chatId || null);
  const [resolvedChatId, setResolvedChatId] = useState<string | null>(() => chatId ? null : crypto.randomUUID());
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [showConversations, setShowConversations] = useState<boolean>(false);

  const navigateToChat = useCallback((id: string | null) => {
    if (id) {
      window.history.pushState({}, '', `/chat/${id}`);
      setResolvedChatId(null);
      setInitialMessages([]);
      setActiveChatId(id);
    } else {
      window.history.pushState({}, '', '/');
      setInitialMessages([]);
      setActiveChatId(null);
      setResolvedChatId(crypto.randomUUID());
    }
  }, []);

  // Browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/chat\/(.+)/);
      if (match) {
        setResolvedChatId(null);
        setInitialMessages([]);
        setActiveChatId(match[1]);
      } else {
        setInitialMessages([]);
        setActiveChatId(null);
        setResolvedChatId(crypto.randomUUID());
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Load messages when activeChatId changes
  useEffect(() => {
    if (activeChatId) {
      getChatMessages(activeChatId).then((dbMessages: any[]) => {
        if (dbMessages.length === 0) {
          setInitialMessages([]);
          setResolvedChatId(crypto.randomUUID());
          window.history.replaceState({}, '', '/');
          return;
        }
        const uiMessages = dbMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          parts: [{ type: 'text', text: msg.content }],
          createdAt: new Date(msg.createdAt),
        }));
        setInitialMessages(uiMessages);
        setResolvedChatId(activeChatId);
      });
    }
  }, [activeChatId]);

  if (needsSetup || !session) {
    return null;
  }

  return (
    <ChatNavProvider value={{ activeChatId: resolvedChatId, navigateToChat }}>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset>
          <ChatTopBar
            user={session.user}
            showConversations={showConversations}
            onToggleConversations={() => setShowConversations((v) => !v)}
          />
          <UpdateBanner />
          {/* Main area: conversations panel + chat */}
          <div className="flex flex-1 overflow-hidden">
            <ConversationsPanel
              open={showConversations}
              onClose={() => setShowConversations(false)}
            />
            <div className="flex flex-col flex-1 min-w-0">
              {resolvedChatId && (
                <Chat
                  key={resolvedChatId}
                  chatId={resolvedChatId}
                  initialMessages={initialMessages}
                  getModelsCatalog={getModelsCatalog}
                />
              )}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}

interface ChatTopBarProps {
  user?: SessionUser;
  showConversations: boolean;
  onToggleConversations: () => void;
}

function ChatTopBar({ user, showConversations, onToggleConversations }: ChatTopBarProps) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState<boolean>(false);
  const { isMobile, toggleSidebar } = useSidebar();

  useEffect(() => {
    setMounted(true);
    getUnreadNotificationCount()
      .then((count: number) => setUnreadCount(count))
      .catch(() => {});
  }, []);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
        )}
        {/* Conversations toggle */}
        <button
          onClick={onToggleConversations}
          className={`hidden md:inline-flex items-center justify-center rounded-md p-1.5 transition-colors ${
            showConversations
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title={showConversations ? 'Close conversations' : 'Open conversations'}
        >
          <MessageIcon size={18} />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
      </div>
      <div className="flex items-center gap-3">
        {/* Health indicator */}
        <HealthIndicator />

        {/* Notification bell */}
        <a
          href="/notifications"
          className="relative inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <BellIcon size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount}
            </span>
          )}
        </a>

        {/* User avatar with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-8 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-700 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:ring-2 hover:ring-emerald-500/30 transition-all cursor-pointer">
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="w-56">
            <div className="px-3 py-2 text-sm">
              <p className="font-medium truncate">{user?.email || 'User'}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { window.location.href = '/settings/secrets'; }}>
              <SettingsIcon size={14} />
              <span className="ml-2">Settings</span>
            </DropdownMenuItem>
            {mounted && (
              <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
                <span className="ml-2">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => window.open('https://github.com/maitrikpatel2025/mantis-ai/issues', '_blank')}>
              <BugIcon size={14} />
              <span className="ml-2">Report Issues</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-destructive"
            >
              <LogOutIcon size={14} />
              <span className="ml-2">Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
