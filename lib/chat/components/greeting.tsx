'use client';

import React from 'react';

export function Greeting() {
  return (
    <div className="w-full text-center animate-fade-in">
      <div className="font-semibold text-2xl md:text-3xl text-foreground tracking-tight">
        Hello! How can I help?
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask me anything or create an agent job.
      </p>
    </div>
  );
}
