"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowLeft, Loader2, MessageSquare, Search, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface Device {
  id: string
  display_name: string
  phone_number: string | null
  status: string
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
}

interface Message {
  id: string
  direction: "inbound" | "outbound" | "system"
  message_type: string
  body_text: string | null
  sent_at: string
  from_me: boolean
  participant_jid: string | null
}

export function InboxView() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("")
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [search, setSearch] = useState("")
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isFirstMessageLoad = useRef(true)

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

  // Load messages when chat selected
  const fetchMessages = useCallback(async () => {
    if (!selectedChat) return
    if (isFirstMessageLoad.current) {
      setLoadingMessages(true)
    }
    try {
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/messages?limit=100`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        // Auto-scroll to bottom after messages load
        scrollToBottom()
      }
    } catch (err) {
      console.error("Error fetching messages:", err)
    } finally {
      if (isFirstMessageLoad.current) {
        setLoadingMessages(false)
        isFirstMessageLoad.current = false
      }
    }
  }, [selectedChat, scrollToBottom])

  useEffect(() => {
    isFirstMessageLoad.current = true
    fetchMessages()
    if (!selectedChat) return
    const interval = setInterval(fetchMessages, 30000)
    return () => clearInterval(interval)
  }, [fetchMessages, selectedChat])

  const getChatName = (chat: Chat) =>
    chat.contact_name || chat.push_name || chat.contact_phone || chat.remote_jid.split("@")[0]

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
        {/* Device selector */}
        <Select value={selectedDeviceId} onValueChange={(v) => { setSelectedDeviceId(v); setSelectedChat(null); setShowThread(false) }}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar dispositivo" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
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
            className="pl-9"
          />
        </div>

        {/* Chat list */}
        <ScrollArea className="flex-1 rounded-lg border">
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted flex-shrink-0">
                      <User className="h-5 w-5 text-muted-foreground" />
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
                          <Badge variant="default" className="h-5 min-w-[20px] text-xs px-1.5 flex-shrink-0">
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
      <Card className={`flex-1 flex flex-col ${showThread ? "flex" : "hidden md:flex"}`}>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{getChatName(selectedChat)}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedChat.contact_phone || selectedChat.remote_jid.split("@")[0]}
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
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Sin mensajes
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound"
                    const typeIcon = getTypeIcon(msg.message_type)

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            isOutbound
                              ? "bg-orange-500 text-white rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
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
