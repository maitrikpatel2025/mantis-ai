'use client';

import { useEffect, useState, useRef } from 'react';
import { useChatNav } from './chat-nav-context.js';
import { getChats, deleteChat, renameChat, starChat } from '../actions.js';
import {
  MessageIcon, SearchIcon, PlusIcon, XIcon,
  MoreHorizontalIcon, TrashIcon, StarIcon, StarFilledIcon, PencilIcon,
} from './icons.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';
import { RenameDialog } from './ui/rename-dialog.js';

function groupChatsByDate(chats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7Days = new Date(today.getTime() - 7 * 86400000);
  const last30Days = new Date(today.getTime() - 30 * 86400000);

  const groups = {
    Starred: [],
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
    Older: [],
  };

  for (const chat of chats) {
    if (chat.starred) {
      groups.Starred.push(chat);
      continue;
    }
    const date = new Date(chat.updatedAt);
    if (date >= today) {
      groups.Today.push(chat);
    } else if (date >= yesterday) {
      groups.Yesterday.push(chat);
    } else if (date >= last7Days) {
      groups['Last 7 Days'].push(chat);
    } else if (date >= last30Days) {
      groups['Last 30 Days'].push(chat);
    } else {
      groups.Older.push(chat);
    }
  }

  return groups;
}

function ChatItem({ chat, isActive, onSelect, onDelete, onStar, onRename }) {
  const [hovered, setHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const showMenu = hovered || dropdownOpen;

  return (
    <>
      <div
        className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
          isActive
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
            : 'text-foreground hover:bg-accent'
        }`}
        onClick={() => onSelect(chat.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <MessageIcon size={14} />
        <span className="truncate flex-1">{chat.title || 'Untitled'}</span>

        <div className={`shrink-0 ${showMenu ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
                onClick={(e) => e.stopPropagation()}
                aria-label="Chat options"
              >
                <MoreHorizontalIcon size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStar(chat.id); }}>
                {chat.starred ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                {chat.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameDialogOpen(true); }}>
                <PencilIcon size={14} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              >
                <TrashIcon size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete chat?"
        description="This will permanently delete this chat and all its messages."
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDelete(false); onDelete(chat.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <RenameDialog
        open={renameDialogOpen}
        currentValue={chat.title || ''}
        onSave={(newTitle) => onRename(chat.id, newTitle)}
        onCancel={() => setRenameDialogOpen(false)}
      />
    </>
  );
}

export function ConversationsPanel({ open, onClose }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { activeChatId, navigateToChat } = useChatNav();
  const searchRef = useRef(null);

  const loadChats = async () => {
    try {
      const result = await getChats();
      setChats(result);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadChats();
      // Focus search when panel opens
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, activeChatId]);

  useEffect(() => {
    const handler = () => loadChats();
    window.addEventListener('chatsupdated', handler);
    return () => window.removeEventListener('chatsupdated', handler);
  }, []);

  const handleDelete = async (chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    const { success } = await deleteChat(chatId);
    if (success) {
      if (chatId === activeChatId) {
        navigateToChat(null);
      }
    } else {
      loadChats();
    }
  };

  const handleStar = async (chatId) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, starred: c.starred ? 0 : 1 } : c))
    );
    const { success } = await starChat(chatId);
    if (!success) loadChats();
  };

  const handleRename = async (chatId, title) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title } : c))
    );
    const { success } = await renameChat(chatId, title);
    if (!success) loadChats();
  };

  const filteredChats = search
    ? chats.filter((c) => (c.title || '').toLowerCase().includes(search.toLowerCase()))
    : chats;

  const grouped = groupChatsByDate(filteredChats);

  if (!open) return null;

  return (
    <div className="flex flex-col h-full w-72 border-r border-border bg-background shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateToChat(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="New chat"
          >
            <PlusIcon size={16} />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Close panel"
          >
            <XIcon size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <SearchIcon size={14} />
          </div>
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex flex-col gap-2 px-2 py-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-border/50" />
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? 'No matching conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, groupChats]) =>
            groupChats.length > 0 ? (
              <div key={label} className="mb-2">
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">
                  {label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {groupChats.map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === activeChatId}
                      onSelect={(id) => navigateToChat(id)}
                      onDelete={handleDelete}
                      onStar={handleStar}
                      onRename={handleRename}
                    />
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
      </div>
    </div>
  );
}
