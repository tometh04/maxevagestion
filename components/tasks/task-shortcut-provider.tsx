"use client"

import { useEffect, useState, useCallback } from "react"
import { TaskDialog } from "./task-dialog"
import { TaskFAB } from "./task-fab"
import { VoiceTaskRecorder } from "./voice-task-recorder"

interface TaskShortcutProviderProps {
  currentUserId: string
  agencyId: string
}

export function TaskShortcutProvider({ currentUserId, agencyId }: TaskShortcutProviderProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [prefill, setPrefill] = useState<any>(null)

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
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [openDialog, openVoice])

  function handleVoiceResult(data: any) {
    setVoiceOpen(false)
    setPrefill(data)
    setDialogOpen(true)
  }

  return (
    <>
      <TaskFAB onClick={openDialog} />

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
