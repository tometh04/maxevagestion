"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

interface ServerPaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  hasMore: boolean
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  limitOptions?: number[]
}

export function ServerPagination({
  page,
  totalPages,
  total,
  limit,
  hasMore,
  onPageChange,
  onLimitChange,
  limitOptions = [25, 50, 100, 200],
}: ServerPaginationProps) {
  const canGoPrevious = page > 1
  const canGoNext = hasMore && page < totalPages

  return (
    <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground text-sm">
        <span className="hidden sm:inline">
          Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} de {total} operaciones
        </span>
        <span className="sm:hidden">
          {total} operaciones
        </span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="hidden text-sm font-medium sm:block">Filas por página</p>
          <p className="text-sm font-medium sm:hidden">Por página</p>
          <Select
            value={`${limit}`}
            onValueChange={(value) => {
              onLimitChange(Number(value))
              onPageChange(1) // Resetear a página 1 cuando cambia el límite
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={limit} />
            </SelectTrigger>
            <SelectContent side="top">
              {limitOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center text-sm font-medium">
          <span className="hidden sm:inline">
            Página {page} de {totalPages || 1}
          </span>
          <span className="sm:hidden">
            {page} / {totalPages || 1}
          </span>
        </div>
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
          >
            <span className="sr-only">Ir a la primera página</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoPrevious}
          >
            <span className="sr-only">Ir a la página anterior</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoNext}
          >
            <span className="sr-only">Ir a la página siguiente</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
          >
            <span className="sr-only">Ir a la última página</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

