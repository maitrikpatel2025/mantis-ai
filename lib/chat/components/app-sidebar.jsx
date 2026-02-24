'use client';

import { useState, useEffect } from 'react';
import {
  MessageIcon, LayoutDashboardIcon, SwarmIcon, BroadcastIcon,
  UsersIcon, BarChartIcon, ClockIcon, ZapIcon, CubeIcon,
  WrenchIcon, ShieldIcon, SettingsIcon, SparklesIcon, FileTextIcon,
  ChevronLeftIcon, BellIcon, ArrowUpCircleIcon, LifeBuoyIcon, BrainIcon,
} from './icons.js';
import { getUnreadNotificationCount, getAppVersion } from '../actions.js';
import { UpgradeDialog } from './upgrade-dialog.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from './ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import { useChatNav } from './chat-nav-context.js';

const NAV_GROUPS = [
  {
    label: 'CHAT',
    items: [
      { id: 'chat', label: 'Chat', icon: MessageIcon, href: '/' },
    ],
  },
  {
    label: 'CONTROL',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon, href: '/dashboard' },
      { id: 'swarm', label: 'Swarm', icon: SwarmIcon, href: '/swarm' },
      { id: 'jobs', label: 'Jobs', icon: SwarmIcon, href: '/settings/jobs' },
      { id: 'channels', label: 'Channels', icon: BroadcastIcon, href: '/settings/channels' },
      { id: 'sessions', label: 'Sessions', icon: UsersIcon, href: '/settings/sessions' },
      { id: 'usage', label: 'Usage', icon: BarChartIcon, href: '/settings/usage' },
    ],
  },
  {
    label: 'AUTOMATION',
    items: [
      { id: 'crons', label: 'Cron Jobs', icon: ClockIcon, href: '/settings/crons' },
      { id: 'triggers', label: 'Triggers', icon: ZapIcon, href: '/settings/triggers' },
    ],
  },
  {
    label: 'AGENT',
    items: [
      { id: 'agents', label: 'Agents', icon: CubeIcon, href: '/settings/agents' },
      { id: 'skills', label: 'Skills', icon: WrenchIcon, href: '/settings/skills' },
      { id: 'security', label: 'Security', icon: ShieldIcon, href: '/settings/security' },
      { id: 'memory', label: 'Memory', icon: BrainIcon, href: '/settings/memory' },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      { id: 'config', label: 'Config', icon: SettingsIcon, href: '/settings/secrets' },
      { id: 'debug', label: 'Debug', icon: SparklesIcon, href: '/settings/debug' },
      { id: 'logs', label: 'Logs', icon: FileTextIcon, href: '/settings/logs' },
    ],
  },
];

function isActive(href, pathname) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/chat/');
  return pathname === href || pathname.startsWith(href + '/');
}

/* Chevron-right icon for expand */
function ChevronRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function AppSidebar({ user }) {
  const { navigateToChat } = useChatNav();
  const { state, open, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const [unreadCount, setUnreadCount] = useState(0);
  const [version, setVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [activePath, setActivePath] = useState('');

  useEffect(() => {
    setActivePath(window.location.pathname);
    getUnreadNotificationCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
    getAppVersion()
      .then(({ version, updateAvailable }) => {
        setVersion(version);
        setUpdateAvailable(updateAvailable);
      })
      .catch(() => {});
  }, []);

  const handleNav = (href) => {
    if (href === '/') {
      navigateToChat(null);
    } else {
      window.location.href = href;
    }
    setOpenMobile(false);
  };

  return (
    <>
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        {/* Brand */}
        <div className={collapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5Z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm tracking-tight leading-tight truncate">
                  Mantis AI
                  {version && <span className="text-[10px] font-normal text-muted-foreground ml-1">v{version}</span>}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Agent Dashboard</div>
              </div>
            </div>
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5Z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-0">
        {/* Navigation groups */}
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="p-0 mb-1">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 h-7 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
            )}
            {collapsed && <div className="h-px bg-border/50 mx-2 my-1.5" />}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href, activePath);
                  return (
                    <SidebarMenuItem key={item.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            className={`relative ${collapsed ? 'justify-center' : ''} ${
                              active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-emerald-500'
                                : ''
                            }`}
                            isActive={active}
                            onClick={() => handleNav(item.href)}
                          >
                            <Icon size={16} />
                            {!collapsed && <span>{item.label}</span>}
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        )}
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Bottom items: Notifications, Upgrade, Support */}
        <SidebarGroup className="p-0 mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={`relative ${collapsed ? 'justify-center' : ''} ${
                      isActive('/notifications', activePath)
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-emerald-500'
                        : ''
                    }`}
                    onClick={() => handleNav('/notifications')}
                  >
                    <BellIcon size={16} />
                    {!collapsed && (
                      <span className="flex items-center gap-2">
                        Notifications
                        {unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                            {unreadCount}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-semibold leading-none text-white">
                        {unreadCount}
                      </span>
                    )}
                  </SidebarMenuButton>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}</TooltipContent>
                )}
              </Tooltip>
            </SidebarMenuItem>

            {updateAvailable && (
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton className={collapsed ? 'justify-center' : ''} onClick={() => setUpgradeOpen(true)}>
                      <ArrowUpCircleIcon size={16} />
                      {!collapsed && (
                        <span className="flex items-center gap-2">
                          Upgrade
                          <span className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                            v{updateAvailable}
                          </span>
                        </span>
                      )}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">Upgrade to v{updateAvailable}</TooltipContent>
                  )}
                </Tooltip>
              </SidebarMenuItem>
            )}

            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton className={collapsed ? 'justify-center' : ''} onClick={() => window.open('https://www.skool.com/ai-architects', '_blank')}>
                    <LifeBuoyIcon size={16} />
                    {!collapsed && <span>Support</span>}
                  </SidebarMenuButton>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">Support</TooltipContent>
                )}
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Collapse/Expand toggle only — no user nav */}
      <SidebarFooter className="border-t border-border/50 p-2">
        {!collapsed ? (
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center justify-center gap-2 rounded-lg p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeftIcon size={14} />
            <span>Collapse</span>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                className="flex w-full items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ChevronRightIcon size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
    <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} version={version} updateAvailable={updateAvailable} />
    </>
  );
}
