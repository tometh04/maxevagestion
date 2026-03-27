"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Database, FlaskConical } from "lucide-react"

export function SeedMockData() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  const handleSeed = async () => {
    if (!confirm("¿Estás seguro de ejecutar el seed? Esto agregará datos de ejemplo a la base de datos.")) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/admin/seed-mock-data", {
        method: "POST",
      })

      const data = await response.json()

      if (data.success) {
        setResult({
          success: true,
          message: "Datos de ejemplo creados exitosamente. Recarga la página para ver los cambios.",
        })
      } else {
        setResult({
          success: false,
          error: data.error || "Error al ejecutar el seed",
        })
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || "Error al ejecutar el seed",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
          <FlaskConical className="h-3.5 w-3.5 text-primary" />
        </div>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos de Ejemplo (Mock Data)</h4>
      </div>
      <p className="text-sm text-muted-foreground">
        Genera datos de ejemplo para probar la aplicación. Esto incluye leads, operaciones, pagos, movimientos de caja,
        alertas, etc.
      </p>

      {result && (
        <Alert variant={result.success ? "default" : "destructive"}>
          <AlertDescription>
            {result.success ? result.message : result.error}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border/40 p-4">
        <h3 className="text-sm font-semibold mb-2">Datos que se crearán:</h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>3 Agencias (Rosario, Madero, Córdoba)</li>
          <li>3 Vendedores</li>
          <li>4 Operadores</li>
          <li>5 Clientes</li>
          <li>25 Leads (varios estados)</li>
          <li>30 Operaciones (varios estados y tipos)</li>
          <li>120 Pagos (algunos pagados, otros pendientes)</li>
          <li>50 Movimientos de caja</li>
          <li>20 Alertas (pagos vencidos, viajes próximos)</li>
          <li>Registros de comisiones</li>
        </ul>
      </div>

      <Button size="sm" onClick={handleSeed} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Ejecutando seed...
          </>
        ) : (
          <>
            <Database className="mr-2 h-3.5 w-3.5" />
            Generar Datos de Ejemplo
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        Nota: Este proceso puede tardar unos segundos. Los datos se agregarán a los existentes (no se eliminarán
        datos previos).
      </p>
    </div>
  )
}
