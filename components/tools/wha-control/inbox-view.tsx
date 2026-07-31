"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowLeft, History, Loader2, MessageSquare, Search, Send, User, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface Agency {
  id: string
  name: string
}

interface Device {
  id: string
  display_name: string
  phone_number: string | null
  status: string
  agency_id: string | null
  agencies: { id: string; name: string } | null
}

interface Chat {
  id: string
  remote_jid: string
  contact_name: string | null
  contact_phone: string | null
  push_name: string | null
  is_group: boolean
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  _chatIds?: string[] // merged conversation IDs
}

interface Message {
  id: string
  direction: "inbound" | "outbound" | "system"
  message_type: string
  body_text: string | null
  sent_at: string
  from_me: boolean
  participant_jid: string | null
  sender_name: string | null
}

interface InboxViewProps {
  agencies: Agency[]
}

// Une la ventana nueva del polling con lo ya cargado (incluidas páginas viejas),
// deduplicando por id y ordenando cronológicamente (sent_at ISO → localeCompare).
function mergeById(a: Message[], b: Message[]): Message[] {
  if (b.length === 0) return a
  if (a.length === 0) return b
  const map = new Map<string, Message>()
  for (const m of a) map.set(m.id, m)
  for (const m of b) map.set(m.id, m)
  return Array.from(map.values()).sort((x, y) => x.sent_at.localeCompare(y.sent_at))
}

export function InboxView({ agencies }: InboxViewProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("all")
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("")
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [search, setSearch] = useState("")
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [backfillNote, setBackfillNote] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isFirstMessageLoad = useRef(true)

  const getViewport = useCallback(
    () =>
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]"
      ) ?? null,
    []
  )

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" })
    }, 50)
  }, [])

  // Load devices
  useEffect(() => {
    fetch("/api/wha-control/devices")
      .then((r) => r.json())
      .then((d) => {
        const devs = d.devices || []
        setDevices(devs)
        if (devs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(devs[0].id)
        }
      })
      .catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter devices by agency
  const filteredDevices = selectedAgencyId === "all"
    ? devices
    : devices.filter((d) => d.agency_id === selectedAgencyId)

  // Auto-select first device when agency changes
  useEffect(() => {
    if (filteredDevices.length > 0 && !filteredDevices.find((d) => d.id === selectedDeviceId)) {
      setSelectedDeviceId(filteredDevices[0].id)
      setSelectedChat(null)
      setShowThread(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, filteredDevices.length])

  // Load chats when device changes
  const fetchChats = useCallback(async () => {
    if (!selectedDeviceId) return
    setLoadingChats(true)
    try {
      const params = new URLSearchParams({ deviceId: selectedDeviceId, limit: "100" })
      if (search) params.set("search", search)
      const res = await fetch(`/api/wha-control/chats?${params}`)
      if (res.ok) {
        const data = await res.json()
        setChats(data.chats || [])
      }
    } catch (err) {
      console.error("Error fetching chats:", err)
    } finally {
      setLoadingChats(false)
    }
  }, [selectedDeviceId, search])

  useEffect(() => {
    fetchChats()
    const interval = setInterval(fetchChats, 30000)
    return () => clearInterval(interval)
  }, [fetchChats])

  // Load messages when chat selected. First load replaces with the newest window
  // and scrolls to bottom; polling merges the fresh tail without clobbering older
  // pages the user may have loaded.
  const fetchMessages = useCallback(async () => {
    if (!selectedChat) return
    const first = isFirstMessageLoad.current
    if (first) {
      setLoadingMessages(true)
    }
    try {
      const chatIds = selectedChat._chatIds || [selectedChat.id]
      const params = new URLSearchParams({ limit: "100" })
      if (chatIds.length > 1) {
        params.set("chatIds", chatIds.join(","))
      }
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/messages?${params}`)
      if (res.ok) {
        const data = await res.json()
        const fresh: Message[] = data.messages || []
        if (first) {
          setMessages(fresh)
          setHasMore(!!data.hasMore)
          scrollToBottom()
        } else {
          // Polling: merge fresh tail with what's already loaded (dedupe by id).
          setMessages((prev) => mergeById(prev, fresh))
        }
      }
    } catch (err) {
      console.error("Error fetching messages:", err)
    } finally {
      if (first) {
        setLoadingMessages(false)
        isFirstMessageLoad.current = false
      }
    }
  }, [selectedChat, scrollToBottom])

  useEffect(() => {
    isFirstMessageLoad.current = true
    setHasMore(false)
    setMessageInput("")
    setSendError(null)
    setBackfillNote(null)
    fetchMessages()
    if (!selectedChat) return
    const interval = setInterval(fetchMessages, 30000)
    return () => clearInterval(interval)
  }, [fetchMessages, selectedChat])

  // Load older messages (paginate backwards with the `before` cursor), prepending
  // them while preserving scroll position so the view doesn't jump.
  const loadOlder = useCallback(async (): Promise<number> => {
    if (!selectedChat || loadingOlder || messages.length === 0) return 0
    setLoadingOlder(true)
    const viewport = getViewport()
    const prevHeight = viewport?.scrollHeight ?? 0
    try {
      const chatIds = selectedChat._chatIds || [selectedChat.id]
      const params = new URLSearchParams({ limit: "100", before: messages[0].sent_at })
      if (chatIds.length > 1) {
        params.set("chatIds", chatIds.join(","))
      }
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/messages?${params}`)
      if (res.ok) {
        const data = await res.json()
        const older: Message[] = data.messages || []
        if (older.length > 0) {
          setMessages((prev) => mergeById(older, prev))
          setHasMore(!!data.hasMore)
          requestAnimationFrame(() => {
            const vp = getViewport()
            if (vp) vp.scrollTop = vp.scrollHeight - prevHeight
          })
        } else {
          setHasMore(false)
        }
        return older.length
      }
    } catch (err) {
      console.error("Error loading older messages:", err)
    } finally {
      setLoadingOlder(false)
    }
    return 0
  }, [selectedChat, loadingOlder, messages, getViewport])

  // Send a reply. The connector persists the outbound row (Baileys echo), so we
  // just re-fetch shortly after to pull it in.
  const handleSend = useCallback(async () => {
    if (!selectedChat || sending) return
    const text = messageInput.trim()
    if (!text) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setMessageInput("")
        setTimeout(() => {
          fetchMessages().then(scrollToBottom)
        }, 1200)
      } else {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error || "No se pudo enviar el mensaje")
      }
    } catch {
      setSendError("Error de conexión al enviar")
    } finally {
      setSending(false)
      // Mantener el foco en el input para poder seguir escribiendo/enviando.
      inputRef.current?.focus()
    }
  }, [selectedChat, sending, messageInput, fetchMessages, scrollToBottom])

  // Ask the connector to backfill older WhatsApp history for this chat, then pull
  // the newly-stored messages in. The sync is async and best-effort in Baileys
  // (WhatsApp may return nothing for a chat), so we poll a few times and, if still
  // empty, say so instead of spinning forever.
  const handleBackfill = useCallback(async () => {
    if (!selectedChat || syncing) return
    setSyncing(true)
    setBackfillNote(null)
    try {
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/sync-history`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setBackfillNote(data.error || "No se pudo pedir el historial")
        setSyncing(false)
        return
      }
      // El sync es asíncrono: reintentamos cada 3s hasta ~18s.
      let attempts = 0
      const poll = async () => {
        attempts++
        const got = await loadOlder()
        if (got > 0) {
          setSyncing(false)
          return
        }
        if (attempts >= 6) {
          setSyncing(false)
          setBackfillNote(
            "WhatsApp no devolvió historial anterior para este chat. El backfill es best-effort: para traer todo el historial hay que reconectar el dispositivo con sincronización completa."
          )
          return
        }
        setTimeout(poll, 3000)
      }
      setTimeout(poll, 3000)
    } catch {
      setSyncing(false)
      setBackfillNote("Error al pedir el historial")
    }
  }, [selectedChat, syncing, loadOlder])

  const getChatName = (chat: Chat) => {
    if (chat.is_group) {
      // For groups: use group name (contact_name) or show "Grupo" + JID
      return chat.contact_name || `Grupo ${chat.remote_jid.split("@")[0]}`
    }
    // For individuals: use contact_name, push_name, phone, or JID
    return chat.contact_name || chat.push_name || chat.contact_phone || chat.remote_jid.split("@")[0]
  }

  const formatTime = (date: string | null) => {
    if (!date) return ""
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
    } catch {
      return ""
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "image": return "📷"
      case "video": return "🎥"
      case "audio": case "voice": return "🎵"
      case "document": return "📄"
      case "sticker": return "🏷️"
      case "location": return "📍"
      case "contact": return "👤"
      default: return null
    }
  }

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat)
    setShowThread(true)
  }

  return (
    <div className="flex h-[calc(100vh-240px)] min-h-[500px] gap-4">
      {/* Chat List Panel */}
      <div className={`w-full md:w-80 flex-shrink-0 flex flex-col gap-3 ${showThread ? "hidden md:flex" : "flex"}`}>
        {/* Agency filter */}
        <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background">
            <SelectValue placeholder="Agencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las agencias</SelectItem>
            {agencies.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Device selector */}
        <Select value={selectedDeviceId} onValueChange={(v) => { setSelectedDeviceId(v); setSelectedChat(null); setShowThread(false) }}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Seleccionar dispositivo" />
          </SelectTrigger>
          <SelectContent>
            {filteredDevices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.display_name} {d.phone_number ? `(${d.phone_number})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs rounded-full border-border/60"
          />
        </div>

        {/* Chat list */}
        <ScrollArea className="flex-1 rounded-xl border border-border/40">
          {loadingChats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Sin conversaciones</p>
            </div>
          ) : (
            <div className="divide-y">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat)}
                  className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${selectedChat?.id === chat.id ? "bg-accent" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${chat.is_group ? "bg-accent-coral/10" : "bg-muted"}`}>
                      {chat.is_group ? <Users className="h-5 w-5 text-accent-coral" /> : <User className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{getChatName(chat)}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(chat.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {chat.last_message_preview || "Sin mensajes"}
                        </p>
                        {chat.unread_count > 0 && (
                          <Badge variant="default" className="h-5 min-w-[20px] text-xs px-1.5 flex-shrink-0 bg-success/10 text-success">
                            {chat.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Message Thread Panel */}
      <Card className={`flex-1 flex flex-col rounded-xl border border-border/40 ${showThread ? "flex" : "hidden md:flex"}`}>
        {selectedChat ? (
          <>
            <div className="flex items-center gap-3 p-4 border-b">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setShowThread(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${selectedChat.is_group ? "bg-accent-coral/10" : "bg-muted"}`}>
                {selectedChat.is_group ? <Users className="h-5 w-5 text-accent-coral" /> : <User className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{getChatName(selectedChat)}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedChat.is_group ? "Grupo" : (selectedChat.contact_phone || selectedChat.remote_jid.split("@")[0])}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={scrollToBottom}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Ir al final</span>
              </Button>
            </div>
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Cargando mensajes…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Sin mensajes
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Cargar historial: paginado hacia atrás o backfill de WhatsApp */}
                  <div className="flex justify-center pb-1">
                    {hasMore ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={loadOlder}
                        disabled={loadingOlder}
                      >
                        {loadingOlder ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Cargar mensajes anteriores"
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={handleBackfill}
                        disabled={syncing}
                      >
                        {syncing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Sincronizando…
                          </>
                        ) : (
                          <>
                            <History className="h-3.5 w-3.5" />
                            Traer historial anterior de WhatsApp
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {backfillNote && (
                    <p className="px-2 pb-2 text-center text-[11px] leading-snug text-muted-foreground">
                      {backfillNote}
                    </p>
                  )}
                  {messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound"
                    const typeIcon = getTypeIcon(msg.message_type)
                    const isGroupChat = selectedChat?.is_group
                    const participantPhone = msg.participant_jid
                      ? msg.participant_jid.split("@")[0]
                      : null
                    const participantName = msg.sender_name || participantPhone

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            isOutbound
                              ? "bg-accent-coral text-white rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {isGroupChat && !isOutbound && participantName && (
                            <p className="text-xs font-semibold text-accent-coral mb-0.5">
                              {participantName}
                            </p>
                          )}
                          {typeIcon && !msg.body_text && (
                            <span className="text-lg">{typeIcon} <span className="text-xs opacity-70">{msg.message_type}</span></span>
                          )}
                          {msg.body_text && (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {typeIcon && <span className="mr-1">{typeIcon}</span>}
                              {msg.body_text}
                            </p>
                          )}
                          <p className={`text-[10px] mt-1 ${isOutbound ? "text-white/70" : "text-muted-foreground"}`}>
                            {new Date(msg.sent_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
            {/* Composer */}
            <div className="border-t">
              {sendError && (
                <p className="px-4 pt-2 text-xs text-destructive">{sendError}</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-2 p-3"
              >
                <Input
                  ref={inputRef}
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value)
                    if (sendError) setSendError(null)
                  }}
                  placeholder="Escribí un mensaje…"
                  className="h-9 rounded-full border-border/60"
                  autoComplete="off"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 rounded-full flex-shrink-0"
                  disabled={sending || !messageInput.trim()}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <CardContent className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleccioná una conversación</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
