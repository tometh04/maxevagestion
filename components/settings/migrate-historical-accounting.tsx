"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Database } from "lucide-react"

export function MigrateHistoricalAccounting() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    summary?: {
      ivaCreated: number
      ivaErrors: number
      paymentsCreated: number
      paymentsErrors: number
    }
  } | null>(null)

  const handleMigrate = async () => {
    if (!confirm("¿Estás seguro de ejecutar la migración de datos históricos contables? Esta acción generará registros de IVA y operator_payments para operaciones existentes.")) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/admin/migrate-historical-accounting", {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al ejecutar migración")
      }

      setResult({
        success: true,
        message: data.message,
        summary: data.summary,
      })
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "Error al ejecutar migración",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Migración de Datos Históricos Contables
        </CardTitle>
        <CardDescription>
          Genera registros de IVA y operator_payments para operaciones existentes que no los tienen.
          Esta acción es segura y solo crea registros faltantes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            <strong>¿Qué hace esta migración?</strong>
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Genera registros de IVA de venta para operaciones sin IVA</li>
            <li>Genera registros de IVA de compra para operaciones sin IVA</li>
            <li>Genera operator_payments para operaciones sin pagos a operadores</li>
            <li>No modifica ni elimina datos existentes</li>
          </ul>
        </div>

        <Button onClick={handleMigrate} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ejecutando migración...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Ejecutar Migración
            </>
          )}
        </Button>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <AlertDescription>
              <div className="space-y-2">
                <p>{result.message}</p>
                {result.summary && (
                  <div className="mt-2 text-sm">
                    <p>
                      <strong>IVA:</strong> {result.summary.ivaCreated} creados, {result.summary.ivaErrors} errores
                    </p>
                    <p>
                      <strong>Operator Payments:</strong> {result.summary.paymentsCreated} creados, {result.summary.paymentsErrors} errores
                    </p>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

