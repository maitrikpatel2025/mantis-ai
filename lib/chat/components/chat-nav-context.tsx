'use client';

import { createContext, useContext } from 'react';

interface ChatNavContextValue {
  activeChatId: string | null;
  navigateToChat: (id: string | null) => void;
}

const ChatNavContext = createContext<ChatNavContextValue | null>(null);

export const ChatNavProvider = ChatNavContext.Provider;

export function useChatNav(): ChatNavContextValue | null {
  return useContext(ChatNavContext);
}
