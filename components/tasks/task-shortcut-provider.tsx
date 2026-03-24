"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { TaskDialog } from "./task-dialog"
import { TaskFAB } from "./task-fab"
import { VoiceTaskRecorder } from "./voice-task-recorder"

interface TaskShortcutProviderProps {
  currentUserId: string
  agencyId: string
  userRole?: string
}

export function TaskShortcutProvider({ currentUserId, agencyId, userRole }: TaskShortcutProviderProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [prefill, setPrefill] = useState<any>(null)
  const router = useRouter()

  const openDialog = useCallback(() => {
    setPrefill(null)
    setDialogOpen(true)
  }, [])

  const openVoice = useCallback(() => {
    setVoiceOpen(true)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Shift+T → Open task dialog
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault()
        openDialog()
      }
      // Ctrl+Shift+J → Open voice recorder
      if (e.ctrlKey && e.shiftKey && e.key === "J") {
        e.preventDefault()
        openVoice()
      }
      // Cmd+K (Mac) or Ctrl+K (Win) → Open Cerebro
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        router.push("/tools/cerebro")
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [openDialog, openVoice, router])

  function handleVoiceResult(data: any) {
    setVoiceOpen(false)
    setPrefill(data)
    setDialogOpen(true)
  }

  return (
    <>
      <TaskFAB onClick={openDialog} showCerebro={userRole !== "SELLER"} />

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentUserId={currentUserId}
        agencyId={agencyId}
        prefill={prefill}
      />

      <VoiceTaskRecorder
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        onResult={handleVoiceResult}
        currentUserId={currentUserId}
      />
    </>
  )
}
