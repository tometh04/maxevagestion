"use client"

import { useEffect } from "react"

/**
 * Global error boundary — único que puede capturar errores del root layout.
 * Por convención de Next.js, este componente debe renderizar sus propios
 * <html> y <body> porque reemplaza el root layout cuando este falla.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "hsl(230 38% 10%)",
            color: "hsl(0 0% 100%)",
          }}
        >
          <div style={{ fontSize: "3rem" }}>⚠️</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Error crítico
          </h1>
          <p style={{ maxWidth: "30rem", textAlign: "center", color: "hsl(226 12% 48%)" }}>
            La aplicación no pudo cargar correctamente. Por favor recargá la página.
            Si el problema persiste, contactá soporte.
          </p>
          {process.env.NODE_ENV === "development" && error?.message && (
            <pre
              style={{
                maxWidth: "40rem",
                overflow: "auto",
                backgroundColor: "hsl(0 84% 60% / 0.15)",
                color: "hsl(0 84% 60%)",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
              }}
            >
              {error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                color: "hsl(0 0% 100%)",
                border: "1px solid hsl(224 18% 92% / 0.25)",
                borderRadius: "0.375rem",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "0.5rem 1rem",
                background: "hsl(0 0% 100%)",
                color: "hsl(230 38% 10%)",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
