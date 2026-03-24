"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TaskFABProps {
  onClick: () => void
  showCerebro?: boolean
}

export function TaskFAB({ onClick, showCerebro = true }: TaskFABProps) {
  const router = useRouter()

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 items-end">
        {showCerebro && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => router.push("/tools/cerebro")}
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xl"
              >
                🧠
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Cerebro (⌘K)</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onClick}
              size="icon"
              className="h-11 w-11 rounded-full shadow-lg bg-primary hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Nueva tarea (Ctrl+Shift+T)</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
