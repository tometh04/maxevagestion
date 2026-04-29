"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

/**
 * Error boundary a nivel root app (fuera del dashboard).
 * Captura errores en páginas de auth, cotización pública, etc.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[RootError]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Algo salió mal</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Ocurrió un error inesperado. Intentá de nuevo o volvé al inicio.
      </p>
      {process.env.NODE_ENV === "development" && (
        <pre className="max-w-lg overflow-auto rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          {error.message}
        </pre>
      )}
      <div className="flex gap-2">
        <Button onClick={reset} variant="outline">
          Reintentar
        </Button>
        <Button onClick={() => (window.location.href = "/")}>
          Volver al inicio
        </Button>
      </div>
    </div>
  )
}
