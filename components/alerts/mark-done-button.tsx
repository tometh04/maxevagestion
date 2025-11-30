"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react"

export function MarkDoneButton({ alertId }: { alertId: string }) {
  const [loading, setLoading] = useState(false)

  const handleMarkDone = async () => {
    setLoading(true)
    try {
      await fetch("/api/alerts/mark-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      })
      window.location.reload()
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleMarkDone} disabled={loading}>
      Marcar como resuelto
    </Button>
  )
}

