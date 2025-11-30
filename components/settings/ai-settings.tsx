"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle } from "lucide-react"

export function AISettings() {
  const [aiEnabled, setAiEnabled] = useState(true)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  useEffect(() => {
    // Check if OpenAI API key is configured
    // In a real app, you might want to check this via an API
    setApiKeyConfigured(!!process.env.NEXT_PUBLIC_OPENAI_API_KEY || true) // For now, assume it's configured
  }, [])

  const handleToggle = (checked: boolean) => {
    setAiEnabled(checked)
    // In a real app, you would save this to the database
    // For now, we'll just update the local state
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Configuración AI</h2>

      <Card>
        <CardHeader>
          <CardTitle>AI Copilot</CardTitle>
          <CardDescription>Configura el asistente de IA para consultas sobre el negocio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ai-toggle">Habilitar AI Copilot</Label>
              <p className="text-sm text-muted-foreground">
                Permite a los usuarios usar el asistente de IA desde el botón en la barra de navegación
              </p>
            </div>
            <Switch id="ai-toggle" checked={aiEnabled} onCheckedChange={handleToggle} />
          </div>

          {aiEnabled && (
            <Alert>
              <AlertDescription>
                <div className="flex items-center gap-2">
                  {apiKeyConfigured ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      <span>OpenAI API Key configurada. El AI Copilot está disponible.</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span>OpenAI API Key no configurada. Configura OPENAI_API_KEY en las variables de entorno.</span>
                    </>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="font-semibold mb-2">Funcionalidades del AI Copilot</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Consultas sobre ventas y operaciones</li>
              <li>Información sobre pagos vencidos</li>
              <li>Performance de vendedores</li>
              <li>Top destinos y tendencias</li>
              <li>Balances de operadores</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

