'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { PageLayout } from './page-layout.js';

const TITLE_MAP: Record<string, string> = {
  '/settings/crons': 'Cron Jobs',
  '/settings/triggers': 'Triggers',
  '/settings/channels': 'Channels',
  '/settings/skills': 'Skills',
  '/settings/agents': 'Agents',
  '/settings/usage': 'Usage',
  '/settings/logs': 'Logs',
  '/settings/sessions': 'Sessions',
  '/settings/security': 'Security',
  '/settings/secrets': 'Config',
  '/settings/debug': 'Debug',
  '/settings/jobs': 'Jobs',
  '/settings/memory': 'Memory',
};

interface SettingsLayoutProps {
  session: any;
  title?: string;
  children: ReactNode;
}

export function SettingsLayout({ session, title, children }: SettingsLayoutProps) {
  const [pageTitle, setPageTitle] = useState<string>(title || 'Settings');

  useEffect(() => {
    if (!title) {
      const path = window.location.pathname;
      setPageTitle(TITLE_MAP[path] || 'Settings');
    }
  }, [title]);

  return (
    <PageLayout session={session} title={pageTitle}>
      {children}
    </PageLayout>
  );
}
