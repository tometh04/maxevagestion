"use client"

import { useEffect, useState, useCallback } from "react"
import { TaskDialog } from "./task-dialog"
import { TaskFAB } from "./task-fab"
import { VoiceTaskRecorder } from "./voice-task-recorder"
import { SupportPanel } from "@/components/support/support-panel"

interface TaskShortcutProviderProps {
  currentUserId: string
  agencyId: string
  hasTawk?: boolean
}

export function TaskShortcutProvider({ currentUserId, agencyId, hasTawk }: TaskShortcutProviderProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [prefill, setPrefill] = useState<any>(null)

  const openDialog = useCallback(() => {
    setPrefill(null)
    setDialogOpen(true)
  }, [])

  const openVoice = useCallback(() => {
    setVoiceOpen(true)
  }, [])

  const toggleHelp = useCallback(() => {
    setHelpOpen((prev) => !prev)
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
      // Ctrl+Shift+H → Toggle help panel
      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault()
        toggleHelp()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [openDialog, openVoice, toggleHelp])

  function handleVoiceResult(data: any) {
    setVoiceOpen(false)
    setPrefill(data)
    setDialogOpen(true)
  }

  return (
    <>
      <TaskFAB onClick={openDialog} onHelpClick={toggleHelp} hasTawk={hasTawk} />

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

      <SupportPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}
