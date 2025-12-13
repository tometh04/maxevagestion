"use client"

import { useState, useEffect } from "react"
import { EmiliaChat } from "./emilia-chat"
import { EmiliaSidebar, ConversationListItem } from "./emilia-sidebar"
import { toast } from "sonner"
import { conversationTelemetry } from "@/lib/emilia/telemetry"
import { supabase } from "@/lib/supabase/client"
import { realtimeDedupe } from "@/lib/emilia/realtime-dedupe"

interface EmiliaPageClientProps {
  userId: string
  userName: string
}

export function EmiliaPageClient({ userId, userName }: EmiliaPageClientProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)

  // Cargar conversaciones al montar
  useEffect(() => {
    loadConversations()
  }, [userId])

  // Realtime subscription para multi-tab sync
  useEffect(() => {
    // Suscribirse a cambios en conversaciones
    const channel = supabase
      .channel('conversations_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Generar ID único del evento para dedupe
          const eventId = `insert_${payload.new.id}_${payload.commit_timestamp}`

          if (!realtimeDedupe.shouldProcess(eventId)) {
            return // Skip duplicado
          }

          // Agregar nueva conversación si no existe
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === payload.new.id)
            if (exists) return prev

            const newConv: ConversationListItem = {
              id: payload.new.id,
              title: payload.new.title,
              state: payload.new.state,
              channel: payload.new.channel,
              lastMessageAt: payload.new.last_message_at,
              lastMessagePreview: "",
              createdAt: payload.new.created_at,
            }

            return [newConv, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const eventId = `update_${payload.new.id}_${payload.commit_timestamp}`

          if (!realtimeDedupe.shouldProcess(eventId)) {
            return
          }

          // Actualizar conversación existente
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === payload.new.id
                ? {
                    ...conv,
                    title: payload.new.title,
                    state: payload.new.state,
                    lastMessageAt: payload.new.last_message_at,
                  }
                : conv
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Si no hay conversación seleccionada y hay conversaciones, seleccionar la primera
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id)
    }
  }, [conversations, selectedConversationId])

  const loadConversations = async () => {
    setIsLoadingConversations(true)
    try {
      const response = await fetch(`/api/emilia/conversations?state=active&limit=50`)
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      } else {
        console.error("Error loading conversations")
        toast.error("Error al cargar conversaciones")
      }
    } catch (error) {
      console.error("Error loading conversations:", error)
      toast.error("Error al cargar conversaciones")
    } finally {
      setIsLoadingConversations(false)
    }
  }

  const handleNewConversation = async () => {
    // Telemetría: Marcar inicio
    conversationTelemetry.reset()
    conversationTelemetry.mark('t0_click')

    // LOCK: Evitar clicks múltiples
    if (isCreatingConversation) return
    setIsCreatingConversation(true)

    try {
      // PASO 1: Generar ID temporal único
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const now = new Date().toISOString()
      const dateStr = new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })

      // PASO 2: Crear conversación optimista
      const optimisticConversation: ConversationListItem = {
        id: tempId,
        title: `Chat ${dateStr}`,
        state: "active",
        channel: "web",
        lastMessageAt: now,
        lastMessagePreview: "",
        createdAt: now,
      }

      // PASO 3: Actualizar UI SINCRONAMENTE → Chat abierto en <50ms ✅
      setConversations(prev => [optimisticConversation, ...prev])
      setSelectedConversationId(tempId)

      // Telemetría: UI actualizada
      conversationTelemetry.mark('t3_state_updated')

      // PASO 4: Persistir en background (async)
      persistConversationInBackground(tempId)

      // Telemetría: Chat renderizado (después de 1 frame)
      requestAnimationFrame(() => {
        conversationTelemetry.mark('t6_chat_rendered')
        conversationTelemetry.report(tempId)
      })
    } finally {
      // UNLOCK después de 500ms (evita double-click)
      setTimeout(() => setIsCreatingConversation(false), 500)
    }
  }

  const persistConversationInBackground = async (tempId: string) => {
    try {
      // Telemetría: Inicio POST
      conversationTelemetry.mark('t1_post_start')

      const response = await fetch("/api/emilia/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      // Telemetría: Fin POST
      conversationTelemetry.mark('t2_post_end')

      if (!response.ok) {
        throw new Error("Failed to create conversation")
      }

      const realConversation = await response.json()

      // Reconciliar: temp_id → real_id
      setConversations(prev =>
        prev.map(conv =>
          conv.id === tempId
            ? {
                id: realConversation.id,
                title: realConversation.title,
                state: realConversation.state,
                channel: "web",
                lastMessageAt: realConversation.createdAt,
                lastMessagePreview: "",
                createdAt: realConversation.createdAt,
              }
            : conv
        )
      )

      // Actualizar selectedId si sigue seleccionada
      setSelectedConversationId(curr => (curr === tempId ? realConversation.id : curr))

      // NO mostrar toast - ya es obvio que funcionó
    } catch (error) {
      console.error("[Emilia] Error creating conversation:", error)

      // ROLLBACK: Eliminar conversación optimista
      setConversations(prev => prev.filter(c => c.id !== tempId))

      // Deseleccionar si estaba seleccionada
      setSelectedConversationId(curr => (curr === tempId ? null : curr))

      // Notificar al usuario
      toast.error("Error al crear conversación. Intentá de nuevo.")
    }
  }

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id)
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/emilia/conversations/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        // Remover de la lista
        setConversations(prev => prev.filter(c => c.id !== id))
        
        // Si era la seleccionada, seleccionar otra o crear nueva
        if (selectedConversationId === id) {
          const remaining = conversations.filter(c => c.id !== id)
          if (remaining.length > 0) {
            setSelectedConversationId(remaining[0].id)
          } else {
            setSelectedConversationId(null)
            // Auto-crear nueva conversación si no quedan
            handleNewConversation()
          }
        }
        
        toast.success("Conversación eliminada")
      } else {
        toast.error("Error al eliminar conversación")
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
      toast.error("Error al eliminar conversación")
    }
  }

  const handleConversationUpdated = (newTitle: string) => {
    // Actualizar título en la lista
    setConversations(prev => 
      prev.map(conv => 
        conv.id === selectedConversationId 
          ? { ...conv, title: newTitle, lastMessageAt: new Date().toISOString() }
          : conv
      )
    )
    
    // Reordenar: mover la conversación actualizada al inicio
    setConversations(prev => {
      const updated = prev.find(c => c.id === selectedConversationId)
      const others = prev.filter(c => c.id !== selectedConversationId)
      return updated ? [updated, ...others] : prev
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Sidebar izquierdo: Conversaciones */}
      <div className="hidden lg:block">
        <EmiliaSidebar
          conversations={conversations}
          selectedId={selectedConversationId}
          isLoading={isCreatingConversation}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Centro: Chat */}
      <div className="min-w-0">
        <EmiliaChat
          conversationId={selectedConversationId}
          userId={userId}
          userName={userName}
          onConversationUpdated={handleConversationUpdated}
        />
      </div>
    </div>
  )
}

