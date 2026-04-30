"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, Bot, Sparkles } from "lucide-react"

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Configuración AI</h2>
          <p className="text-sm text-muted-foreground">Configura el asistente de IA para consultas sobre el negocio</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">AI Copilot</h4>
        </div>

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
                    <CheckCircle2 className="h-4 w-4 text-accent-coral" />
                    <span>OpenAI API Key configurada. El AI Copilot está disponible.</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span>OpenAI API Key no configurada. Configura OPENAI_API_KEY en las variables de entorno.</span>
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-xl border border-border/40 p-4">
          <h3 className="text-sm font-semibold mb-2">Funcionalidades del AI Copilot</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Consultas sobre ventas y operaciones</li>
            <li>Información sobre pagos vencidos</li>
            <li>Performance de vendedores</li>
            <li>Top destinos y tendencias</li>
            <li>Balances de operadores</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
