"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, Loader2, Info } from "lucide-react"

const MAX_LENGTH = 20_000

interface PromptEditorProps {
  connected: boolean
  canWrite: boolean
  initialPrompt: string | null
}

export function PromptEditor({ connected, canWrite, initialPrompt }: PromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "")
  const [loading, setLoading] = useState(false)

  const charCount = prompt.length
  const overLimit = charCount > MAX_LENGTH
  const isDirty = prompt !== (initialPrompt ?? "")

  async function handleSave() {
    if (overLimit) return
    setLoading(true)
    try {
      const res = await fetch("/api/eve/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_custom: prompt }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Error al guardar el prompt")
        return
      }
      toast.success("Prompt guardado correctamente")
    } catch {
      toast.error("Error de red al guardar el prompt")
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Debés conectar Eve primero. Andá a la pestaña{" "}
              <a href="/eve" className="underline underline-offset-2">Estado</a>{" "}
              para configurar la integración.
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">Prompt del agente</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-sm text-muted-foreground">
          Personalizá el comportamiento y tono del agente Eve para tu agencia. Este texto
          se usa como instrucción base en cada conversación.
        </p>

        {canWrite ? (
          <>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Sos un agente de viajes especializado en destinos de playa. Respondé siempre en español, con un tono cercano y profesional..."
              className="min-h-[260px] font-mono text-sm resize-y"
              disabled={loading}
            />

            {/* Contador y aviso de límite */}
            <div className="flex items-center justify-between text-xs">
              <span className={overLimit ? "text-destructive font-medium" : "text-muted-foreground"}>
                {charCount.toLocaleString("es-AR")} / {MAX_LENGTH.toLocaleString("es-AR")} caracteres
                {overLimit && " — superaste el límite"}
              </span>
              {overLimit && (
                <span className="text-destructive">Reducí el texto antes de guardar</span>
              )}
            </div>

            {/* Aviso de propagación */}
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Los cambios impactan en conversaciones nuevas. La propagación puede demorar hasta ~60 segundos
                si el agente no invalida caché inmediatamente.
              </span>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={loading || overLimit || !isDirty}
                size="sm"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar prompt
              </Button>
            </div>
          </>
        ) : (
          /* Modo read-only para roles sin write */
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm whitespace-pre-wrap min-h-[120px]">
            {prompt || (
              <span className="text-muted-foreground italic">Sin prompt personalizado configurado.</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
