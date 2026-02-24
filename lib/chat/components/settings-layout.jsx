'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';

const TITLE_MAP = {
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

export function SettingsLayout({ session, title, children }) {
  const [pageTitle, setPageTitle] = useState(title || 'Settings');

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
