export interface SearchContextMessage {
  role?: string
  cards?: {
    flights?: { items?: unknown[] }
    hotels?: { items?: unknown[] }
  }
  meta?: Record<string, any>
}

export function getMessageSearchContextId(message: SearchContextMessage): string | null {
  const meta = message.meta || {}
  const value = meta.searchContextId
    || meta.turnSemantics?.searchContextId
    || meta.search_context_id
    || meta.turn_semantics?.searchContextId
    || meta.turn_semantics?.search_context_id
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function getActiveSearchContextId(messages: SearchContextMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "assistant") continue
    const id = getMessageSearchContextId(message)
    if (id) return id
  }
  return null
}

export function hasSearchCards(message: SearchContextMessage): boolean {
  return Boolean(
    message.cards?.flights?.items?.length
    || message.cards?.hotels?.items?.length
  )
}
