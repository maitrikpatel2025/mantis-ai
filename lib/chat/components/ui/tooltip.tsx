'use client';

import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { cn } from '../../utils.js';

interface TooltipContextValue {
  open: boolean;
  handleOpen?: () => void;
  handleClose?: () => void;
}

const TooltipContext = createContext<TooltipContextValue>({ open: false });

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

export function TooltipProvider({ children, delayDuration = 200 }: TooltipProviderProps) {
  return children as React.JSX.Element;
}

interface TooltipProps {
  children: React.ReactNode;
}

export function Tooltip({ children }: TooltipProps) {
  const [open, setOpen] = useState<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = () => {
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  };

  const handleClose = () => {
    clearTimeout(timeoutRef.current!);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current!), []);

  return (
    <TooltipContext.Provider value={{ open, handleOpen, handleClose }}>
      <div className="relative w-full" onMouseEnter={handleOpen} onMouseLeave={handleClose}>
        {children}
      </div>
    </TooltipContext.Provider>
  );
}

interface TooltipTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export function TooltipTrigger({ children, asChild }: TooltipTriggerProps) {
  if (asChild && children) {
    return children as React.JSX.Element;
  }
  return children as React.JSX.Element;
}

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  align?: 'center' | 'start' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipContent({ children, className, align = 'center', side = 'bottom', ...props }: TooltipContentProps) {
  const { open } = useContext(TooltipContext);
  if (!open) return null;

  return (
    <div
      className={cn(
        'absolute z-50 overflow-hidden rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-md',
        'animate-in fade-in-0 zoom-in-95',
        side === 'bottom' && 'top-full mt-1',
        side === 'top' && 'bottom-full mb-1',
        side === 'right' && 'left-full ml-1 top-1/2 -translate-y-1/2',
        side === 'left' && 'right-full mr-1 top-1/2 -translate-y-1/2',
        side !== 'right' && side !== 'left' && align === 'center' && 'left-1/2 -translate-x-1/2',
        side !== 'right' && side !== 'left' && align === 'end' && 'right-0',
        side !== 'right' && side !== 'left' && align === 'start' && 'left-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
