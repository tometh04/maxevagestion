"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Mic, MicOff, Loader2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface VoiceTaskRecorderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (data: any) => void
  currentUserId: string
}

type RecorderState = "idle" | "listening" | "processing"

export function VoiceTaskRecorder({
  open,
  onOpenChange,
  onResult,
  currentUserId,
}: VoiceTaskRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle")
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const processTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        toast.error("No se detectó ningún texto")
        setState("idle")
        return
      }

      setState("processing")

      try {
        const res = await fetch("/api/tasks/parse-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, userId: currentUserId }),
        })

        if (!res.ok) throw new Error("Error al procesar")

        const data = await res.json()
        onResult(data.task || { title: text })
      } catch {
        // Fallback: use transcript as title directly
        onResult({ title: text })
      }
    },
    [currentUserId, onResult]
  )

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      toast.error("Tu navegador no soporta reconocimiento de voz. Usá Chrome.")
      onOpenChange(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "es-AR"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    let finalText = ""

    recognition.onresult = (event: any) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript + " "
          setTranscript(finalText.trim())
        } else {
          interim += result[0].transcript
        }
      }
      setInterimTranscript(interim)

      // Reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        stopListening()
        processTranscript(finalText.trim() || interim.trim())
      }, 2500)
    }

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error)
      if (event.error === "not-allowed") {
        toast.error("Permiso de micrófono denegado. Habilitalo en la configuración del navegador.")
      }
      stopListening()
      setState("idle")
    }

    recognition.onend = () => {
      // If we have text and we're still in listening state, process it
      if (finalText.trim() && state === "listening") {
        processTranscript(finalText.trim())
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setState("listening")
    setTranscript("")
    setInterimTranscript("")
  }, [onOpenChange, processTranscript, state, stopListening])

  // Start listening when dialog opens
  useEffect(() => {
    if (open) {
      setState("idle")
      setTranscript("")
      setInterimTranscript("")
      // Small delay to let the dialog animate in
      const timer = setTimeout(startListening, 300)
      return () => clearTimeout(timer)
    } else {
      stopListening()
      setState("idle")
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListening()
  }, [stopListening])

  function handleCancel() {
    stopListening()
    setState("idle")
    onOpenChange(false)
  }

  function handleConfirm() {
    stopListening()
    const text = transcript || interimTranscript
    if (text.trim()) {
      processTranscript(text.trim())
    } else {
      toast.error("No se detectó ningún texto")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-md text-center">
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="absolute top-4 right-4"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Mic icon with pulse animation */}
          <div className="relative">
            <div
              className={cn(
                "h-24 w-24 rounded-full flex items-center justify-center transition-colors",
                state === "listening" && "bg-red-100 dark:bg-red-900/30",
                state === "processing" && "bg-blue-100 dark:bg-blue-900/30",
                state === "idle" && "bg-muted"
              )}
            >
              {state === "processing" ? (
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
              ) : state === "listening" ? (
                <Mic className="h-10 w-10 text-red-600" />
              ) : (
                <MicOff className="h-10 w-10 text-muted-foreground" />
              )}
            </div>

            {/* Pulse rings when listening */}
            {state === "listening" && (
              <>
                <div className="absolute inset-0 rounded-full bg-red-400/20 animate-ping" />
                <div
                  className="absolute -inset-3 rounded-full bg-red-400/10 animate-pulse"
                  style={{ animationDelay: "0.5s" }}
                />
              </>
            )}
          </div>

          {/* Status text */}
          <div>
            <h3 className="font-semibold text-lg">
              {state === "listening" && "Escuchando..."}
              {state === "processing" && "Procesando con IA..."}
              {state === "idle" && "Grabador de voz"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {state === "listening" && "Hablá para crear una tarea. Se detendrá al dejar de hablar."}
              {state === "processing" && "Analizando tu mensaje para crear la tarea..."}
              {state === "idle" && "Presioná el micrófono para empezar"}
            </p>
          </div>

          {/* Transcript preview */}
          {(transcript || interimTranscript) && (
            <div className="w-full rounded-lg bg-muted/50 p-4 text-sm text-left">
              <p className="font-medium text-xs text-muted-foreground mb-1">
                Transcripción:
              </p>
              <p>
                {transcript}
                <span className="text-muted-foreground italic">{interimTranscript}</span>
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            {state === "listening" && (
              <Button onClick={handleConfirm}>Confirmar</Button>
            )}
            {state === "idle" && (
              <Button onClick={startListening}>
                <Mic className="mr-2 h-4 w-4" />
                Empezar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
