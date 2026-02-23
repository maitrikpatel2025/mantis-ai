'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClockIcon, ZapIcon, KeyIcon, WrenchIcon, MessageIcon, SwarmIcon, BarChartIcon, FileTextIcon, UsersIcon, ShieldIcon, BugIcon } from './icons.js';

const TABS = [
  { id: 'crons', label: 'Crons', href: '/settings/crons', icon: ClockIcon },
  { id: 'triggers', label: 'Triggers', href: '/settings/triggers', icon: ZapIcon },
  { id: 'channels', label: 'Channels', href: '/settings/channels', icon: MessageIcon },
  { id: 'skills', label: 'Skills', href: '/settings/skills', icon: WrenchIcon },
  { id: 'agents', label: 'Agents', href: '/settings/agents', icon: SwarmIcon },
  { id: 'usage', label: 'Usage', href: '/settings/usage', icon: BarChartIcon },
  { id: 'logs', label: 'Logs', href: '/settings/logs', icon: FileTextIcon },
  { id: 'sessions', label: 'Sessions', href: '/settings/sessions', icon: UsersIcon },
  { id: 'security', label: 'Security', href: '/settings/security', icon: ShieldIcon },
  { id: 'secrets', label: 'Secrets', href: '/settings/secrets', icon: KeyIcon },
  { id: 'debug', label: 'Debug', href: '/settings/debug', icon: BugIcon },
];

export function SettingsLayout({ session, children }) {
  const [activePath, setActivePath] = useState('');

  useEffect(() => {
    setActivePath(window.location.pathname);
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const isActive = activePath === tab.href || activePath.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </a>
          );
        })}
      </div>

      {/* Tab content */}
      {children}
    </PageLayout>
  );
}
