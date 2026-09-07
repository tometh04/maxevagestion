"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowDown, ArrowLeft, FileCheck2, History, Loader2, MessageSquare, MessageSquarePlus, Paperclip, Search, Send, Smile, Timer, User, Users, X } from "lucide-react"
import { phoneSearchFragment } from "@/lib/wha-control/phone"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"

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

interface ChatFollowup {
  id: string
  status: "PENDING" | "PROCESSING" | "SENT" | "CANCELLED" | "FAILED"
  scheduled_for: string | null
  sent_at: string | null
  cancelled_reason?: string | null
}

// Por qué no salió el seguimiento, en palabras del vendedor.
const FOLLOWUP_CANCEL_LABELS: Record<string, string> = {
  client_replied: "El cliente respondió",
  seller_followed_up: "Le escribiste vos",
  manual: "Lo cancelaste",
  device_unavailable: "Dispositivo desconectado",
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
  followup?: ChatFollowup | null
  /** Entrantes posteriores a la última apertura en vibook. */
  unread?: number
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
  quoteFollowupEnabled?: boolean
  /** Teléfono para abrir directo el chat (link desde un lead). */
  initialPhone?: string
}

const MEDIA_TYPES = new Set(["image", "sticker", "video", "audio", "voice", "document"])

// Refresco del inbox. El hilo abierto se consulta seguido porque es lo único
// que el usuario está mirando y su query está indexada por (chat_id, sent_at);
// el listado es más caro, así que va más espaciado.
const MESSAGES_POLL_MS = 7000
const CHATS_POLL_MS = 15000

// El connector persiste el mensaje saliente recién cuando Baileys emite su eco,
// así que después de enviar se reintenta unas cuantas veces en vez de una sola.
const ECHO_RETRY_DELAYS_MS = [600, 1500, 3000]

// Set curado de emojis comunes para el picker del composer (sin dependencias).
const EMOJIS = [
  "😀","😁","😂","🤣","😅","😊","😇","🙂","😉","😍","😘","😋","😎","🤩","🥳","😜",
  "🤔","🤗","🙄","😴","😮","😢","😭","😤","😡","🥺","😱","😳","🤯","😬","🙃","😌",
  "👍","👎","👌","🙏","👏","🙌","💪","🤝","✌️","🤞","👋","🤙","👇","👆","☝️","✅",
  "❤️","🧡","💛","💚","💙","💜","🖤","💔","💕","🔥","⭐","✨","🎉","🎊","💯","👀",
  "😩","😔","😐","😏","🤨","😒","🥰","🤓","🫠","🫡","🫣","🤭","😆","😝","🤪","😷",
  "🙈","💩","👑","💰","📸","📍","⚽","🍺","☕","🎂","🌹","🌟","⚡","💨","❗","❓",
]

// Renderiza la media de un mensaje bajándola on-demand del endpoint proxy. Si
// falla (media expirada en WhatsApp, device apagado), muestra un fallback.
function MediaContent({ url, type }: { url: string; type: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return <span className="text-xs italic opacity-70">Media no disponible</span>
  }
  if (type === "image" || type === "sticker") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        loading="lazy"
        alt=""
        onError={() => setError(true)}
        onClick={() => window.open(url, "_blank")}
        className="rounded-lg max-h-64 max-w-full object-contain cursor-pointer"
      />
    )
  }
  if (type === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setError(true)}
        className="rounded-lg max-h-64 max-w-full"
      />
    )
  }
  if (type === "audio" || type === "voice") {
    return (
      <audio
        src={url}
        controls
        preload="none"
        onError={() => setError(true)}
        className="w-[300px] max-w-full"
      />
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
      📄 Descargar documento
    </a>
  )
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

export function InboxView({ agencies, quoteFollowupEnabled = false, initialPhone }: InboxViewProps) {
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
  const [attachedImage, setAttachedImage] = useState<{
    base64: string
    mimeType: string
    preview: string
  } | null>(null)
  const [attachedDoc, setAttachedDoc] = useState<{
    base64: string
    mimeType: string
    fileName: string
    size: number
  } | null>(null)
  const [followupBusy, setFollowupBusy] = useState(false)
  // "Nuevo chat": enviar a un número sin conversación previa.
  const [composeOpen, setComposeOpen] = useState(false)
  const [composePhone, setComposePhone] = useState("")
  const [composeText, setComposeText] = useState("")
  const [composeSending, setComposeSending] = useState(false)
  const initialPhoneApplied = useRef(false)
  const initialPhoneAutoSelected = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    const interval = setInterval(fetchChats, CHATS_POLL_MS)
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
    setAttachedImage(null)
    setAttachedDoc(null)
    fetchMessages()
    if (!selectedChat) return
    const interval = setInterval(fetchMessages, MESSAGES_POLL_MS)
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

  // Send a reply (text and/or image). The connector persists the outbound row
  // (Baileys echo), so we just re-fetch shortly after to pull it in.
  const handleSend = useCallback(async () => {
    if (!selectedChat || sending) return
    const text = messageInput.trim()
    if (!text && !attachedImage && !attachedDoc) return
    setSending(true)
    setSendError(null)
    try {
      const body = attachedImage
        ? { imageBase64: attachedImage.base64, mimeType: attachedImage.mimeType, caption: text || undefined }
        : attachedDoc
          ? { documentBase64: attachedDoc.base64, fileName: attachedDoc.fileName, mimeType: attachedDoc.mimeType, caption: text || undefined }
          : { text }
      const res = await fetch(`/api/wha-control/chats/${selectedChat.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setMessageInput("")
        setAttachedImage(null)
        setAttachedDoc(null)
        for (const delay of ECHO_RETRY_DELAYS_MS) {
          setTimeout(() => {
            fetchMessages().then(scrollToBottom)
          }, delay)
        }
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
  }, [selectedChat, sending, messageInput, attachedImage, attachedDoc, fetchMessages, scrollToBottom])

  // Adjuntar archivo desde el disco (se lee como base64 para mandarlo al
  // connector). Imágenes van como imagen de WhatsApp; el resto, como documento.
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // permitir re-seleccionar el mismo archivo
    if (!file) return
    if (file.size > 16 * 1024 * 1024) {
      setSendError("El archivo supera los 16 MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1] || ""
      if (file.type.startsWith("image/")) {
        setAttachedDoc(null)
        setAttachedImage({ base64, mimeType: file.type, preview: dataUrl })
      } else {
        setAttachedImage(null)
        setAttachedDoc({
          base64,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
          size: file.size,
        })
      }
    }
    reader.readAsDataURL(file)
  }, [])

  // Insertar emoji en la posición del cursor del input.
  const insertEmoji = useCallback((emoji: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? messageInput.length
    const end = input?.selectionEnd ?? messageInput.length
    const next = messageInput.slice(0, start) + emoji + messageInput.slice(end)
    setMessageInput(next)
    requestAnimationFrame(() => {
      if (!input) return
      input.focus()
      const pos = start + emoji.length
      input.setSelectionRange(pos, pos)
    })
  }, [messageInput])

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

  // Seguimiento post-cotización: marcar el chat / cancelar el mensaje agendado.
  const handleMarkQuoted = useCallback(async () => {
    if (!selectedChat || followupBusy) return
    setFollowupBusy(true)
    try {
      const res = await fetch(
        `/api/wha-control/chats/${selectedChat.id}/quote-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatIds: selectedChat._chatIds || [selectedChat.id] }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "No se pudo agendar el seguimiento")
        return
      }
      toast.success("Seguimiento agendado")
      fetchChats()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setFollowupBusy(false)
    }
  }, [selectedChat, followupBusy, fetchChats])

  const handleCancelFollowup = useCallback(
    async (followupId: string) => {
      if (!selectedChat || followupBusy) return
      setFollowupBusy(true)
      try {
        const res = await fetch(
          `/api/wha-control/chats/${selectedChat.id}/quote-followup`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ followupId }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || "No se pudo cancelar el seguimiento")
          return
        }
        toast.success("Seguimiento cancelado")
        fetchChats()
      } catch {
        toast.error("Error de conexión")
      } finally {
        setFollowupBusy(false)
      }
    },
    [selectedChat, followupBusy, fetchChats]
  )

  // Countdown corto para el badge ("en 22h" / "en 45m").
  const formatFollowupEta = (scheduledFor: string | null) => {
    if (!scheduledFor) return ""
    const diffMs = new Date(scheduledFor).getTime() - Date.now()
    if (diffMs <= 0) return "en breve"
    const mins = Math.round(diffMs / 60_000)
    if (mins < 60) return `en ${mins}m`
    return `en ${Math.round(mins / 60)}h`
  }

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

  // Iniciales del contacto. Si el "nombre" es el número (no hay agenda), el
  // ícono genérico comunica mejor que dos dígitos sueltos.
  const getInitials = (chat: Chat) => {
    const name = getChatName(chat)
    if (/^[\d\s+()-]+$/.test(name)) return null
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
  }

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  // Separador de día del hilo, como cualquier cliente de mensajería.
  const dayLabel = (iso: string) => {
    const date = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (isSameDay(date, today)) return "Hoy"
    if (isSameDay(date, yesterday)) return "Ayer"
    return date.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    })
  }

  // Color estable por participante: en un grupo hay que poder seguir quién
  // habla sin leer el nombre cada vez.
  const SENDER_COLORS = [
    "text-accent-coral",
    "text-accent-teal",
    "text-accent-violet",
    "text-primary",
    "text-success",
  ]
  const senderColor = (key: string) => {
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
    return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]
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
    if (!chat.unread) return
    // Optimista: el badge se apaga al instante y el backend queda al día.
    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c))
    )
    fetch(`/api/wha-control/chats/${chat.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatIds: chat._chatIds || [chat.id] }),
    }).catch(() => {
      /* si falla, el próximo refresco vuelve a mostrar el badge */
    })
  }

  // Link desde un lead (?phone=...): buscar por los últimos dígitos y, si hay
  // un único match, abrir el hilo directo.
  useEffect(() => {
    if (!initialPhone || initialPhoneApplied.current) return
    initialPhoneApplied.current = true
    const fragment = phoneSearchFragment(initialPhone)
    if (fragment) setSearch(fragment)
  }, [initialPhone])

  useEffect(() => {
    if (!initialPhone || !initialPhoneApplied.current || initialPhoneAutoSelected.current) return
    if (loadingChats || !search) return
    if (chats.length === 1) {
      initialPhoneAutoSelected.current = true
      setSelectedChat(chats[0])
      setShowThread(true)
    } else if (chats.length === 0) {
      // No hay chat con ese número: dejar listo el compose para escribirle.
      initialPhoneAutoSelected.current = true
      setComposePhone(initialPhone)
      setComposeOpen(true)
    }
  }, [initialPhone, chats, loadingChats, search])

  // Enviar a un número sin chat previo. El connector persiste el chat con el
  // echo de Baileys; refetcheamos y lo seleccionamos por el número.
  const handleComposeSend = useCallback(async () => {
    if (composeSending || !selectedDeviceId) return
    if (!composePhone.trim() || !composeText.trim()) return
    setComposeSending(true)
    try {
      const res = await fetch("/api/wha-control/send-to-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          phone: composePhone,
          text: composeText,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "No se pudo enviar el mensaje")
        return
      }
      toast.success("Mensaje enviado")
      setComposeOpen(false)
      setComposeText("")
      const fragment = phoneSearchFragment(composePhone)
      setComposePhone("")
      if (fragment) setSearch(fragment)
      // Darle tiempo al echo del connector a persistir el chat.
      setTimeout(fetchChats, 1500)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setComposeSending(false)
    }
  }, [composeSending, selectedDeviceId, composePhone, composeText, fetchChats])

  // El followup del header se lee de la lista fresca (el polling de 30s la
  // actualiza); selectedChat es un snapshot al momento del click.
  const selectedFollowup = selectedChat
    ? (chats.find((c) => c.id === selectedChat.id) ?? selectedChat).followup ?? null
    : null

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

        {/* Search + nuevo chat */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversación o número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs rounded-full border-border/60"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 rounded-full border-border/60"
            title="Nuevo chat: enviar a un número"
            onClick={() => setComposeOpen(true)}
            disabled={!selectedDeviceId}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
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
              {chats.map((chat) => {
                const unread = chat.unread ?? 0
                const initials = getInitials(chat)
                return (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat)}
                  aria-current={selectedChat?.id === chat.id ? "true" : undefined}
                  className={`w-full text-left p-3 transition-colors ${selectedChat?.id === chat.id ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 text-sm font-semibold ${chat.is_group ? "bg-accent-coral/10 text-accent-coral" : "bg-muted text-muted-foreground"}`}>
                      {chat.is_group ? (
                        <Users className="h-5 w-5 text-accent-coral" />
                      ) : initials ? (
                        initials
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${unread > 0 ? "font-semibold text-foreground" : "font-medium"}`}>
                          {getChatName(chat)}
                        </span>
                        <span className={`text-xs flex-shrink-0 ${unread > 0 ? "font-medium text-success" : "text-muted-foreground"}`}>
                          {formatTime(chat.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${unread > 0 ? "text-foreground/80" : "text-muted-foreground"}`}>
                          {chat.last_message_preview || "Sin mensajes"}
                        </p>
                        {unread > 0 && (
                          <Badge className="h-5 min-w-[20px] justify-center rounded-full px-1.5 text-xs flex-shrink-0 bg-success text-white hover:bg-success">
                            {unread > 99 ? "99+" : unread}
                          </Badge>
                        )}
                      </div>
                      {quoteFollowupEnabled && chat.followup && (
                        <div className="mt-1">
                          {chat.followup.status === "SENT" ? (
                            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-success border-success/40">
                              <FileCheck2 className="h-3 w-3" />
                              Seguimiento enviado
                            </Badge>
                          ) : chat.followup.status === "CANCELLED" ? (
                            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground border-border">
                              <X className="h-3 w-3" />
                              Sin seguimiento ·{" "}
                              {FOLLOWUP_CANCEL_LABELS[chat.followup.cancelled_reason ?? ""] ?? "Cancelado"}
                            </Badge>
                          ) : chat.followup.status === "FAILED" ? (
                            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-destructive border-destructive/40">
                              <X className="h-3 w-3" />
                              Seguimiento no enviado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-accent-coral border-accent-coral/40">
                              <Timer className="h-3 w-3" />
                              Cotizada · seg. {formatFollowupEta(chat.followup.scheduled_for)}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                )
              })}
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
              {quoteFollowupEnabled && !selectedChat.is_group && (
                selectedFollowup?.status === "PENDING" || selectedFollowup?.status === "PROCESSING" ? (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="gap-1 text-xs text-accent-coral border-accent-coral/40">
                      <Timer className="h-3 w-3" />
                      Seguimiento {formatFollowupEta(selectedFollowup.scheduled_for)}
                    </Badge>
                    {selectedFollowup.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        title="Cancelar seguimiento"
                        onClick={() => handleCancelFollowup(selectedFollowup.id)}
                        disabled={followupBusy}
                      >
                        {followupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                ) : selectedFollowup?.status === "SENT" ? (
                  <Badge variant="outline" className="gap-1 text-xs text-success border-success/40">
                    <FileCheck2 className="h-3 w-3" />
                    Seguimiento enviado
                  </Badge>
                ) : selectedFollowup?.status === "CANCELLED" || selectedFollowup?.status === "FAILED" ? (
                  // El seguimiento terminó sin enviarse: se explica por qué y se
                  // deja volver a marcar, en vez de que la marca desaparezca sola.
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {selectedFollowup.status === "FAILED"
                        ? "No se pudo enviar el seguimiento"
                        : `Sin seguimiento: ${(FOLLOWUP_CANCEL_LABELS[selectedFollowup.cancelled_reason ?? ""] ?? "cancelado").toLowerCase()}`}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleMarkQuoted}
                      disabled={followupBusy}
                    >
                      {followupBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileCheck2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline text-xs">Marcar de nuevo</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleMarkQuoted}
                    disabled={followupBusy}
                  >
                    {followupBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileCheck2 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline text-xs">Cotización enviada</span>
                  </Button>
                )
              )}
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
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay mensajes en esta conversación
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground/80">
                    Escribí abajo para iniciarla, o traé el historial anterior de
                    WhatsApp si la conversación ya existía en el teléfono.
                  </p>
                </div>
              ) : (
                <div>
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
                  {messages.map((msg, index) => {
                    const isOutbound = msg.direction === "outbound"
                    const typeIcon = getTypeIcon(msg.message_type)
                    const isGroupChat = selectedChat?.is_group
                    const isMedia = MEDIA_TYPES.has(msg.message_type)
                    const mediaUrl = `/api/wha-control/chats/${selectedChat?.id}/media/${msg.id}`
                    const participantPhone = msg.participant_jid
                      ? msg.participant_jid.split("@")[0]
                      : null
                    const participantName = msg.sender_name || participantPhone

                    // Encabezado de día cuando cambia la fecha.
                    const prev = index > 0 ? messages[index - 1] : null
                    const nuevoDia =
                      !prev || !isSameDay(new Date(prev.sent_at), new Date(msg.sent_at))

                    // Mensajes seguidos del mismo remitente se agrupan: no se
                    // repite el nombre y quedan más juntos, como en cualquier
                    // cliente de mensajería.
                    const mismoRemitente =
                      !!prev &&
                      !nuevoDia &&
                      prev.direction === msg.direction &&
                      (prev.participant_jid ?? null) === (msg.participant_jid ?? null)
                    const dentroDeLaRafaga =
                      mismoRemitente &&
                      new Date(msg.sent_at).getTime() -
                        new Date(prev!.sent_at).getTime() <
                        5 * 60 * 1000
                    const mostrarNombre =
                      isGroupChat && !isOutbound && participantName && !dentroDeLaRafaga

                    return (
                      <div key={msg.id}>
                        {nuevoDia && (
                          <div className="flex items-center justify-center py-3">
                            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                              {dayLabel(msg.sent_at)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex ${isOutbound ? "justify-end" : "justify-start"} ${dentroDeLaRafaga ? "mt-0.5" : "mt-2"}`}
                        >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            isOutbound
                              ? `bg-accent-coral text-white ${dentroDeLaRafaga ? "rounded-br-2xl" : "rounded-br-md"}`
                              : `bg-muted ${dentroDeLaRafaga ? "rounded-bl-2xl" : "rounded-bl-md"}`
                          }`}
                        >
                          {mostrarNombre && (
                            <p className={`text-xs font-semibold mb-0.5 ${senderColor(msg.participant_jid || participantName || "")}`}>
                              {participantName}
                            </p>
                          )}
                          {isMedia && (
                            <div className={msg.body_text ? "mb-1" : ""}>
                              <MediaContent url={mediaUrl} type={msg.message_type} />
                            </div>
                          )}
                          {!isMedia && typeIcon && !msg.body_text && (
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
              {attachedImage && (
                <div className="flex items-center gap-2 px-3 pt-2">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachedImage.preview}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover border border-border/60"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachedImage(null)}
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">Imagen lista para enviar</span>
                </div>
              )}
              {attachedDoc && (
                <div className="flex items-center gap-2 px-3 pt-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5">
                    <span className="text-base">📄</span>
                    <span className="max-w-[240px] truncate text-xs">{attachedDoc.fileName}</span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {(attachedDoc.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachedDoc(null)}
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">Documento listo para enviar</span>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-1.5 p-3"
              >
                {/* Emoji picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0 rounded-full text-muted-foreground"
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2">
                    <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => insertEmoji(e)}
                          className="rounded p-0.5 text-xl leading-none hover:bg-accent"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {/* Adjuntar imagen */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0 rounded-full text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  className="hidden"
                  onChange={handleFileSelect}
                />
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
                  disabled={sending || (!messageInput.trim() && !attachedImage && !attachedDoc)}
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

      {/* Nuevo chat: enviar a un número sin conversación previa */}
      <Dialog open={composeOpen} onOpenChange={(open) => { if (!composeSending) setComposeOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="compose-phone">Número de teléfono</Label>
              <Input
                id="compose-phone"
                placeholder="Ej: 341 555 1234 o +54 9 341 555 1234"
                value={composePhone}
                onChange={(e) => setComposePhone(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Si no tiene código de país se asume Argentina (+54 9).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-text">Mensaje</Label>
              <Textarea
                id="compose-text"
                rows={3}
                maxLength={4096}
                placeholder="Escribí el mensaje…"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleComposeSend}
              disabled={composeSending || !composePhone.trim() || !composeText.trim() || !selectedDeviceId}
              className="gap-1.5"
            >
              {composeSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
