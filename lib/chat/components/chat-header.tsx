'use client';

import { SidebarTrigger } from './ui/sidebar.js';

interface ChatHeaderProps {
  chatId?: string;
}

export function ChatHeader({ chatId }: ChatHeaderProps) {
  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background/95 backdrop-blur-sm border-b border-border/50 px-2 py-1.5 md:px-2 z-10">
      {/* Mobile-only: open sidebar sheet */}
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
    </header>
  );
}
