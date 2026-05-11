"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FileText, X, ArrowRight } from "lucide-react"

interface AfipNotConfiguredBannerProps {
  orgId: string
}

export function AfipNotConfiguredBanner({ orgId }: AfipNotConfiguredBannerProps) {
  // Dismiss per-org: si el user opera varios orgs (raro pero posible), cada
  // uno ve el banner una vez. La key se invalida si la org se reconfigura
  // (post-setup el server deja de renderizar el banner y la key queda obsoleta).
  const storageKey = `afip_banner_dismissed_${orgId}`
  const [show, setShow] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey) === "true"
    setShow(!dismissed)
  }, [storageKey])

  if (!show) return null

  return (
    <Alert className="bg-accent-coral/10 border-accent-coral/30 mb-4">
      <FileText className="h-4 w-4 text-accent-coral" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          <strong>AFIP no configurado</strong> — para emitir facturas con CAE
          necesitás conectar tu CUIT y autorizar el web service de facturación.
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button asChild variant="default" size="sm" className="h-8">
            <Link href="/settings?tab=afip">
              Configurar ahora
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              localStorage.setItem(storageKey, "true")
              setShow(false)
            }}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
