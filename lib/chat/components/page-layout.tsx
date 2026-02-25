'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { AppSidebar } from './app-sidebar.js';
import { SidebarProvider, SidebarInset, useSidebar } from './ui/sidebar.js';
import { ChatNavProvider } from './chat-nav-context.js';
import { UpdateBanner } from './update-banner.js';
import { ToastContainer } from './toast-container.js';
import { BellIcon, SettingsIcon, SunIcon, MoonIcon, BugIcon, LogOutIcon } from './icons.js';
import { useEventStream } from '../../events/use-event-stream.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { getUnreadNotificationCount, getHealthStatusAction } from '../actions.js';

function defaultNavigateToChat(id: string | null) {
  if (id) {
    window.location.href = `/chat/${id}`;
  } else {
    window.location.href = '/';
  }
}

interface HealthColors {
  [key: string]: { dot: string; text: string; label: string };
}

const HEALTH_COLORS: HealthColors = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Degraded' },
  down: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'Down' },
  unknown: { dot: 'bg-stone-400', text: 'text-muted-foreground', label: 'Checking...' },
};

const COMPONENT_LABELS: Record<string, string> = { database: 'Database', llm: 'LLM', channels: 'Channels' };

interface HealthComponent {
  status: string;
  latencyMs?: number;
  total?: number;
  enabled?: number;
}

interface HealthStatus {
  overall: string;
  components: Record<string, HealthComponent>;
}

export function HealthIndicator() {
  const [health, setHealth] = useState<HealthStatus>({ overall: 'unknown', components: {} });
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHealthStatusAction().then((data) => setHealth(data as HealthStatus)).catch(() => {});
  }, []);

  useEventStream('health:changed', useCallback((data: any) => {
    if (data) setHealth(data);
  }, []));

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const style = HEALTH_COLORS[health.overall] || HEALTH_COLORS.unknown;

  return (
    <div className="hidden sm:block relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot} ${health.overall === 'unknown' ? 'animate-pulse' : ''}`} />
        <span className={`${style.text} font-medium`}>{style.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-popover p-3 shadow-lg z-50 animate-fade-in">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">System Health</p>
          <div className="space-y-2">
            {Object.entries(health.components).map(([key, comp]) => {
              const compStyle = HEALTH_COLORS[comp.status] || HEALTH_COLORS.unknown;
              return (
                <div key={key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${compStyle.dot}`} />
                    <span className="font-medium">{COMPONENT_LABELS[key] || key}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {comp.latencyMs != null && <span>{comp.latencyMs}ms</span>}
                    {key === 'channels' && comp.total != null && (
                      <span>{comp.enabled}/{comp.total}</span>
                    )}
                    <span className={compStyle.text}>{comp.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TopBarProps {
  title: string;
  user: any;
}

export function TopBar({ title, user }: TopBarProps) {
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

  // SSE: increment badge on new notification
  useEventStream('notification', useCallback(() => {
    setUnreadCount((prev) => prev + 1);
  }, []));

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
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
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

interface PageLayoutProps {
  session: any;
  title?: string;
  children: ReactNode;
}

export function PageLayout({ session, title, children }: PageLayoutProps) {
  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat: defaultNavigateToChat }}>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset>
          <TopBar title={title || ''} user={session.user} />
          <UpdateBanner />
          <div className="flex flex-col flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 py-6 md:px-6 animate-fade-in">
            {children}
          </div>
        </SidebarInset>
        <ToastContainer />
      </SidebarProvider>
    </ChatNavProvider>
  );
}
