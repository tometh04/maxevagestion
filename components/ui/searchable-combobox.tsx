"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useDebounce } from "@/hooks/use-debounce"

export interface ComboboxOption {
  value: string
  label: string
  subtitle?: string
}

interface SearchableComboboxProps {
  value?: string
  onChange: (value: string) => void
  searchFn: (query: string) => Promise<ComboboxOption[]>
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  initialLabel?: string
}

export function SearchableCombobox({
  value,
  onChange,
  searchFn,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Sin resultados",
  disabled = false,
  initialLabel,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [options, setOptions] = React.useState<ComboboxOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selectedLabel, setSelectedLabel] = React.useState(initialLabel || "")
  const [initialLoaded, setInitialLoaded] = React.useState(false)
  const debouncedQuery = useDebounce(query, 300)

  // Cargar opciones iniciales cuando se abre el popover
  React.useEffect(() => {
    if (!open || initialLoaded) return
    let cancelled = false
    setLoading(true)
    searchFn("")
      .then((results) => {
        if (!cancelled) {
          setOptions(results)
          setLoading(false)
          setInitialLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([])
          setLoading(false)
          setInitialLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, initialLoaded, searchFn])

  // Buscar cuando cambia el query debounced
  React.useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      // Si no hay query, no resetear — las opciones iniciales se mantienen
      if (debouncedQuery.length === 0 && initialLoaded) return
      if (debouncedQuery.length > 0 && debouncedQuery.length < 2) return
      return
    }
    let cancelled = false
    setLoading(true)
    searchFn(debouncedQuery)
      .then((results) => {
        if (!cancelled) {
          setOptions(results)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, searchFn, initialLoaded])

  // Actualizar label inicial
  React.useEffect(() => {
    if (initialLabel) {
      setSelectedLabel(initialLabel)
    }
  }, [initialLabel])

  const handleSelect = (option: ComboboxOption) => {
    onChange(option.value)
    setSelectedLabel(option.label)
    handleOpenChange(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
    setSelectedLabel("")
    setQuery("")
    setInitialLoaded(false)
  }

  // Resetear cuando se cierra para recargar la próxima vez
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setQuery("")
      setInitialLoaded(false)
    }
  }

  const displayLabel = value ? selectedLabel || "Seleccionado" : ""

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {displayLabel || placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && (
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </div>
            ) : options.length === 0 && (debouncedQuery.length >= 2 || initialLoaded) ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : options.length === 0 && query.length > 0 && query.length < 2 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Seguí escribiendo para buscar...
              </div>
            ) : (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.subtitle && (
                        <span className="text-xs text-muted-foreground truncate">
                          {option.subtitle}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
