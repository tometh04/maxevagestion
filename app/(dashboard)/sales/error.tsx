"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold">Algo salió mal</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        Ocurrió un error inesperado. Intentá de nuevo o contactá soporte si el problema persiste.
      </p>
      {process.env.NODE_ENV === "development" && (
        <pre className="text-xs text-destructive bg-destructive/10 p-3 rounded-md max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}
      <Button onClick={reset} variant="outline">
        Reintentar
      </Button>
    </div>
  )
}
