'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '../../utils.js';
import { Sheet, SheetContent } from './sheet.js';

const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_COOKIE_NAME = 'sidebar:state';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

interface SidebarContextValue {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
}: SidebarProviderProps) {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [openMobile, setOpenMobile] = useState<boolean>(false);
  const [_open, _setOpen] = useState<boolean>(defaultOpen);
  const open = openProp !== undefined ? openProp : _open;
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const newOpen = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(newOpen);
      } else {
        _setOpen(newOpen);
      }
      try {
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${newOpen}; path=/; max-age=${60 * 60 * 24 * 7}`;
      } catch (e) {
        // SSR safety
      }
    },
    [setOpenProp, open]
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev);
    } else {
      setOpen((prev) => !prev);
    }
  }, [isMobile, setOpen]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keyboard shortcut (Cmd/Ctrl + B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const state: 'expanded' | 'collapsed' = open ? 'expanded' : 'collapsed';

  const contextValue = useMemo(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className="group/sidebar-wrapper flex min-h-svh w-full"
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
          '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
        } as React.CSSProperties}
        data-sidebar-state={state}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  side?: 'left' | 'right';
}

export function Sidebar({ children, className, side = 'left' }: SidebarProps) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side={side}
          className={cn('w-[var(--sidebar-width-mobile)] p-0 [&>button]:hidden', className)}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        'flex h-svh flex-col border-r border-border bg-muted transition-[width] duration-200',
        open ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-icon)]',
        className
      )}
    >
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden',
          open ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-icon)]'
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface SidebarSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarHeader({ children, className }: SidebarSectionProps) {
  return <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
}

export function SidebarContent({ children, className }: SidebarSectionProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', className)}>
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className }: SidebarSectionProps) {
  return <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
}

export function SidebarMenu({ children, className }: SidebarSectionProps) {
  return <ul className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}>{children}</ul>;
}

export function SidebarMenuItem({ children, className }: SidebarSectionProps) {
  return <li className={cn('group/menu-item relative', className)}>{children}</li>;
}

interface SidebarMenuButtonProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  isActive?: boolean;
  asChild?: boolean;
  tooltip?: string;
}

export function SidebarMenuButton({ children, className, isActive, asChild, tooltip, ...props }: SidebarMenuButtonProps) {
  const Tag = asChild ? 'span' : 'button';
  return (
    <Tag
      className={cn(
        'flex w-full items-center gap-2 overflow-hidden py-1.5 text-left text-[13px] outline-none transition-colors',
        isActive
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-3'
          : 'mx-2 px-3 rounded-md hover:bg-accent/50 hover:text-foreground',
        className
      )}
      {...(props as any)}
    >
      {children}
    </Tag>
  );
}

export function SidebarGroup({ children, className }: SidebarSectionProps) {
  return <div className={cn('relative flex w-full min-w-0 flex-col p-2', className)}>{children}</div>;
}

export function SidebarGroupLabel({ children, className }: SidebarSectionProps) {
  return (
    <div
      className={cn(
        'flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarGroupContent({ children, className }: SidebarSectionProps) {
  return <div className={cn('w-full', className)}>{children}</div>;
}

export function SidebarInset({ children, className }: SidebarSectionProps) {
  return (
    <main className={cn('relative flex min-h-svh flex-1 flex-col bg-background', className)}>
      {children}
    </main>
  );
}

interface SidebarTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}

export function SidebarTrigger({ className, ...props }: SidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted',
        className
      )}
      onClick={toggleSidebar}
      {...props}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </svg>
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarRail() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-border"
      onClick={toggleSidebar}
      aria-label="Toggle Sidebar"
    />
  );
}
