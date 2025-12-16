"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { GripVertical, Loader2 } from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { toast } from "sonner"

interface EditListOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agencyId: string
  currentListNames: string[]
  onSuccess?: () => void
}

function SortableItem({ id, name }: { id: string; name: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-background border rounded-lg cursor-move hover:bg-muted/50"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <span className="flex-1 font-medium">{name}</span>
    </div>
  )
}

export function EditListOrderDialog({
  open,
  onOpenChange,
  agencyId,
  currentListNames,
  onSuccess,
}: EditListOrderDialogProps) {
  const [listNames, setListNames] = useState<string[]>(currentListNames)
  const [saving, setSaving] = useState(false)

  // Actualizar cuando cambian las listas actuales
  useEffect(() => {
    setListNames(currentListNames)
  }, [currentListNames])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setListNames((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/manychat/list-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          listNames,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al guardar orden")
      }

      toast.success("Orden de listas guardado correctamente")
      onSuccess?.()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Error saving list order:", error)
      toast.error(error.message || "Error al guardar orden de listas")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Orden de Listas</DialogTitle>
          <DialogDescription>
            Arrastra las listas para reordenarlas. El orden se aplicará al kanban de CRM Manychat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {listNames.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No hay listas para ordenar
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={listNames}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {listNames.map((name) => (
                    <SortableItem key={name} id={name} name={name} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || listNames.length === 0}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar Orden"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

