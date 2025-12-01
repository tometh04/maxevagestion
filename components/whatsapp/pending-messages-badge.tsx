"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"

export function PendingMessagesBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    fetchCount()
    // Actualizar cada 60 segundos
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [])

  async function fetchCount() {
    try {
      const response = await fetch("/api/whatsapp/messages?status=PENDING&limit=1")
      if (!response.ok) {
        setCount(0)
        return
      }
      const data = await response.json()
      setCount(data.counts?.PENDING || 0)
    } catch (error) {
      // Silently fail - table might not exist yet
      setCount(0)
    }
  }

  if (count === 0) return null

  return (
    <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0.5 min-w-[20px] justify-center">
      {count > 99 ? "99+" : count}
    </Badge>
  )
}

