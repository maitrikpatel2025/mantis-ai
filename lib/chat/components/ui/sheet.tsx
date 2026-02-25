'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { cn } from '../../utils.js';

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextValue>({ open: false, onOpenChange: () => {} });

interface SheetProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Sheet({ children, open, onOpenChange }: SheetProps) {
  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

interface SheetTriggerProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  asChild?: boolean;
}

export function SheetTrigger({ children, asChild, ...props }: SheetTriggerProps) {
  const { onOpenChange } = useContext(SheetContext);
  if (asChild && children) {
    return (
      <span onClick={() => onOpenChange(true)} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button onClick={() => onOpenChange(true)} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  side?: 'left' | 'right';
}

export function SheetContent({ children, className, side = 'left', ...props }: SheetContentProps) {
  const { open, onOpenChange } = useContext(SheetContext);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {/* Content */}
      <div
        className={cn(
          'fixed z-50 bg-background shadow-lg transition-transform',
          side === 'left' && 'inset-y-0 left-0 w-3/4 max-w-sm border-r border-border',
          side === 'right' && 'inset-y-0 right-0 w-3/4 max-w-sm border-l border-border',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

interface SheetHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function SheetHeader({ children, className }: SheetHeaderProps) {
  return <div className={cn('flex flex-col space-y-2 p-4', className)}>{children}</div>;
}

interface SheetTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function SheetTitle({ children, className }: SheetTitleProps) {
  return <h2 className={cn('text-lg font-semibold tracking-tight text-foreground', className)}>{children}</h2>;
}

interface SheetDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function SheetDescription({ children, className }: SheetDescriptionProps) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}

interface SheetCloseProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  asChild?: boolean;
}

export function SheetClose({ children, asChild, ...props }: SheetCloseProps) {
  const { onOpenChange } = useContext(SheetContext);
  if (asChild && children) {
    return (
      <span onClick={() => onOpenChange(false)} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button onClick={() => onOpenChange(false)} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
