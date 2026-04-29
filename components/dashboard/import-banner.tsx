"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"

const STORAGE_KEY = "import_banner_dismissed"

export function ImportBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === "true"
    setShow(!dismissed)
  }, [])

  if (!show) return null

  return (
    <Alert className="bg-blue-500/10 border-blue-500/30 mb-4">
      <Upload className="h-4 w-4 text-blue-500" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          ¿Traés datos de otro sistema? Importá tu histórico desde CSV en{" "}
          <Link href="/settings?tab=import" className="underline font-medium">Settings → Importación</Link>.
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "true")
            setShow(false)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
