'use client';

import { useState } from 'react';
import { MessageIcon, TrashIcon, MoreHorizontalIcon, StarIcon, StarFilledIcon, PencilIcon } from './icons.js';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';
import { RenameDialog } from './ui/rename-dialog.js';
import { useChatNav } from './chat-nav-context.js';
import { cn } from '../utils.js';

interface Chat {
  id: string;
  title: string;
  starred: number;
  [key: string]: any;
}

interface SidebarHistoryItemProps {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onStar: (chatId: string) => void;
  onRename: (chatId: string, title: string) => void;
}

export function SidebarHistoryItem({ chat, isActive, onDelete, onStar, onRename }: SidebarHistoryItemProps) {
  const chatNav = useChatNav();
  const navigateToChat = chatNav?.navigateToChat;
  const { setOpenMobile } = useSidebar();
  const [hovered, setHovered] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState<boolean>(false);

  const showMenu = hovered || dropdownOpen;

  return (
    <SidebarMenuItem>
      <div
        className="relative group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <SidebarMenuButton
          className="pr-8"
          isActive={isActive}
          onClick={() => {
            navigateToChat?.(chat.id);
            setOpenMobile(false);
          }}
        >
          <MessageIcon size={14} />
          <span className="truncate flex-1">
            {chat.title}
          </span>
        </SidebarMenuButton>

        <div className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 z-10',
          showMenu ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'rounded-md p-1 transition-colors',
                  'text-muted-foreground hover:text-foreground',
                  'bg-accent hover:bg-accent/80'
                )}
                aria-label="Chat options"
              >
                <MoreHorizontalIcon size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onStar(chat.id);
                }}
              >
                {chat.starred ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                {chat.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setRenameDialogOpen(true);
                }}
              >
                <PencilIcon size={14} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive hover:text-destructive"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
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
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(chat.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <RenameDialog
        open={renameDialogOpen}
        currentValue={chat.title || ''}
        onSave={(newTitle: string) => onRename(chat.id, newTitle)}
        onCancel={() => setRenameDialogOpen(false)}
      />
    </SidebarMenuItem>
  );
}
