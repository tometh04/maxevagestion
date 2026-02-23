"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Plus,
  MessageSquare,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react"
import { formatRelativeTime, truncateText } from "@/lib/emilia/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface ConversationListItem {
  id: string
  title: string
  state: "active" | "closed"
  channel: "web" | "whatsapp" | "api"
  lastMessageAt: string
  lastMessagePreview: string
  createdAt: string
}

interface EmiliaSidebarProps {
  conversations: ConversationListItem[]
  selectedId: string | null
  isLoading?: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function EmiliaSidebar({
  conversations,
  selectedId,
  isLoading = false,
  onSelect,
  onNew,
  onDelete,
}: EmiliaSidebarProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[800px] border rounded-xl bg-card">
      {/* Header con botón Nueva Conversación */}
      <div className="p-4 border-b">
        <Button
          onClick={onNew}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Nueva conversación
        </Button>
      </div>

      {/* Lista de conversaciones */}
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No hay conversaciones todavía.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Comenzá una nueva para empezar.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={conv.id === selectedId}
                onClick={() => onSelect(conv.id)}
                onDelete={(e) => handleDeleteClick(e, conv.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer con info */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>
            {conversations.length} conversación{conversations.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conversación se moverá a archivadas. Podés recuperarla más tarde si es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ConversationItemProps {
  conversation: ConversationListItem
  isSelected: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-all cursor-pointer",
        "hover:bg-accent group relative",
        isSelected && "bg-accent border border-primary/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Título */}
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p
              className={cn(
                "text-sm font-medium truncate",
                isSelected ? "text-foreground" : "text-foreground/90"
              )}
            >
              {conversation.title}
            </p>
          </div>

          {/* Preview del último mensaje */}
          <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
            {truncateText(conversation.lastMessagePreview, 80)}
          </p>

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground/70 mt-1 pl-5">
            {formatRelativeTime(conversation.lastMessageAt)}
          </p>
        </div>

        {/* Botón de eliminar (visible on hover) */}
        {isHovered && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        )}
      </div>
    </div>
  )
}

