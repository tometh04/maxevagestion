"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

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
    <Card>
      <CardHeader>
        <CardTitle>Datos de Ejemplo (Mock Data)</CardTitle>
        <CardDescription>
          Genera datos de ejemplo para probar la aplicación. Esto incluye leads, operaciones, pagos, movimientos de caja,
          alertas, etc.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <AlertDescription>
              {result.success ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="font-semibold mb-2">Datos que se crearán:</h3>
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

        <Button onClick={handleSeed} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ejecutando seed...
            </>
          ) : (
            "Generar Datos de Ejemplo"
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          ⚠️ Nota: Este proceso puede tardar unos segundos. Los datos se agregarán a los existentes (no se eliminarán
          datos previos).
        </p>
      </CardContent>
    </Card>
  )
}

