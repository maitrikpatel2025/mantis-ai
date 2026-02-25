'use client';

import React from 'react';
import { cn } from '../../utils.js';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function ScrollArea({ children, className, ...props }: ScrollAreaProps) {
  return (
    <div className={cn('relative overflow-hidden', className)} {...props}>
      <div className="h-full w-full overflow-y-auto scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

export function ScrollBar() {
  return null;
}
