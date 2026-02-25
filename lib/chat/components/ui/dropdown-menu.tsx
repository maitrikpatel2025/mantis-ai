'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { cn } from '../../utils.js';

interface DropdownContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DropdownContext = createContext<DropdownContextValue>({ open: false, onOpenChange: () => {} });

interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({ children, open: controlledOpen, onOpenChange: controlledOnOpenChange }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || setInternalOpen;

  return (
    <DropdownContext.Provider value={{ open, onOpenChange }}>
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

interface DropdownMenuTriggerProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  asChild?: boolean;
}

export function DropdownMenuTrigger({ children, asChild, ...props }: DropdownMenuTriggerProps) {
  const { open, onOpenChange } = useContext(DropdownContext);
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenChange(!open);
  };
  if (asChild && children) {
    return (
      <span onClick={handleClick} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button onClick={handleClick} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  sideOffset?: number;
}

export function DropdownMenuContent({ children, className, align = 'start', side = 'bottom', sideOffset = 4, ...props }: DropdownMenuContentProps) {
  const { open, onOpenChange } = useContext(DropdownContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-sm p-1 text-foreground shadow-lg animate-fade-in',
        side === 'bottom' && `top-full mt-1`,
        side === 'top' && `bottom-full mb-1`,
        align === 'end' && 'right-0',
        align === 'start' && 'left-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

export function DropdownMenuItem({ children, className, onClick, ...props }: DropdownMenuItemProps) {
  const { onOpenChange } = useContext(DropdownContext);
  return (
    <div
      role="menuitem"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus:bg-accent',
        className
      )}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface DropdownMenuSeparatorProps {
  className?: string;
}

export function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
  return <div className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}

interface DropdownMenuLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <div className={cn('px-2 py-1.5 text-sm font-semibold', className)}>
      {children}
    </div>
  );
}

interface DropdownMenuGroupProps {
  children: React.ReactNode;
}

export function DropdownMenuGroup({ children }: DropdownMenuGroupProps) {
  return <div>{children}</div>;
}
