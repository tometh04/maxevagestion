/**
 * Hook para manejo de conversaciones optimistas
 * Encapsula la lógica de creación optimista + reconciliación
 */

import { useState } from "react"
import { toast } from "sonner"
import { conversationTelemetry } from "../telemetry"

export interface ConversationItem {
  id: string
  title: string
  state: "active" | "closed"
  channel: "web" | "whatsapp" | "api"
  lastMessageAt: string
  lastMessagePreview: string
  createdAt: string
}

interface UseOptimisticConversationOptions {
  userId: string
  onConversationCreated?: (conversation: ConversationItem) => void
  onConversationReconciled?: (tempId: string, realId: string) => void
  onError?: (error: Error) => void
}

export function useOptimisticConversation({
  userId,
  onConversationCreated,
  onConversationReconciled,
  onError,
}: UseOptimisticConversationOptions) {
  const [isCreating, setIsCreating] = useState(false)

  const createOptimistic = async (): Promise<{ tempId: string; conversation: ConversationItem } | null> => {
    // LOCK: Evitar clicks múltiples
    if (isCreating) return null
    setIsCreating(true)

    // Telemetría
    conversationTelemetry.reset()
    conversationTelemetry.mark("t0_click")

    try {
      // PASO 1: Generar ID temporal único
      const tempId = generateTempId()
      const now = new Date().toISOString()
      const dateStr = new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })

      // PASO 2: Crear conversación optimista
      const optimisticConversation: ConversationItem = {
        id: tempId,
        title: `Chat ${dateStr}`,
        state: "active",
        channel: "web",
        lastMessageAt: now,
        lastMessagePreview: "",
        createdAt: now,
      }

      // PASO 3: Notificar creación (UI se actualiza sincronamente)
      onConversationCreated?.(optimisticConversation)

      // Telemetría
      conversationTelemetry.mark("t3_state_updated")

      // PASO 4: Persistir en background
      persistInBackground(tempId)

      // Telemetría
      requestAnimationFrame(() => {
        conversationTelemetry.mark("t6_chat_rendered")
        conversationTelemetry.report(tempId)
      })

      return { tempId, conversation: optimisticConversation }
    } finally {
      // UNLOCK después de 500ms
      setTimeout(() => setIsCreating(false), 500)
    }
  }

  const persistInBackground = async (tempId: string) => {
    try {
      // Telemetría
      conversationTelemetry.mark("t1_post_start")

      const response = await fetch("/api/emilia/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      conversationTelemetry.mark("t2_post_end")

      if (!response.ok) {
        throw new Error("Failed to create conversation")
      }

      const realConversation = await response.json()

      // Notificar reconciliación
      onConversationReconciled?.(tempId, realConversation.id)
    } catch (error) {
      console.error("[Emilia] Error creating conversation:", error)

      const err = error instanceof Error ? error : new Error("Unknown error")
      onError?.(err)

      toast.error("Error al crear conversación. Intentá de nuevo.")
    }
  }

  return {
    createOptimistic,
    isCreating,
  }
}

function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
