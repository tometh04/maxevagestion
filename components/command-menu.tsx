"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Users,
  Plane,
  Building2,
  MessageSquare,
  BarChart3,
  Settings,
  DollarSign,
  FileText,
  Calendar,
  Home,
  Search,
  Plus,
  Bell,
  CheckSquare,
} from "lucide-react"

interface SearchResult {
  id: string
  type: "customer" | "operation" | "operator" | "lead"
  title: string
  subtitle?: string
}

interface CommandMenuProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandMenu({ open: controlledOpen, onOpenChange }: CommandMenuProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Función para toggle que funciona con ambos modos (controlado y no controlado)
  const toggleOpen = useCallback(() => {
    if (controlledOpen !== undefined && onOpenChange) {
      // Modo controlado: usar onOpenChange
      onOpenChange(!open)
    } else {
      // Modo no controlado: usar setInternalOpen
      setInternalOpen((prev) => !prev)
    }
  }, [open, controlledOpen, onOpenChange])

  // Función para cerrar que funciona con ambos modos
  const closeOpen = useCallback(() => {
    if (controlledOpen !== undefined && onOpenChange) {
      onOpenChange(false)
    } else {
      setInternalOpen(false)
    }
  }, [controlledOpen, onOpenChange])

  // Toggle con ⌘K o Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleOpen()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [toggleOpen])

  // Búsqueda con debounce
  const searchData = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    console.log("[CommandMenu] Searching for:", query)
    setLoading(true)
    try {
      const url = `/api/search?q=${encodeURIComponent(query)}`
      console.log("[CommandMenu] Fetching:", url)
      const response = await fetch(url)
      console.log("[CommandMenu] Response status:", response.status, response.ok)
      if (!response.ok) {
        const errorText = await response.text()
        console.error("[CommandMenu] Search request failed:", response.status, errorText)
        throw new Error("Search request failed")
      }
      const data = await response.json()
      console.log("[CommandMenu] Search results:", data.results?.length || 0, "results")
      setResults(data.results || [])
    } catch (error) {
      console.error("[CommandMenu] Search error:", error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Resetear estado cuando el dialog se cierra (para tener un estado limpio la próxima vez que se abra)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    // Si el dialog se cierra (pasó de true a false), resetear estado
    if (prevOpenRef.current && !open) {
      setSearch("")
      setResults([])
      setLoading(false)
    }
    prevOpenRef.current = open
  }, [open])

  useEffect(() => {
    // Solo buscar si el dialog está abierto
    if (!open) {
      console.log("[CommandMenu] Dialog closed, skipping search")
      return
    }

    // Si el search está vacío o muy corto, no buscar
    if (!search || search.trim().length < 2) {
      console.log("[CommandMenu] Search too short:", search)
      setResults([])
      setLoading(false)
      return
    }

    console.log("[CommandMenu] Scheduling search for:", search)
    const timer = setTimeout(() => {
      searchData(search)
    }, 300)

    return () => {
      console.log("[CommandMenu] Clearing search timer")
      clearTimeout(timer)
    }
  }, [search, searchData, open])

  const runCommand = useCallback((command: () => void) => {
    closeOpen()
    command()
  }, [closeOpen])

  const getIcon = (type: string) => {
    switch (type) {
      case "customer":
        return Users
      case "operation":
        return Plane
      case "operator":
        return Building2
      case "lead":
        return MessageSquare
      default:
        return Search
    }
  }

  const navigateTo = (path: string) => {
    runCommand(() => router.push(path))
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (controlledOpen !== undefined && onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
      <CommandInput 
        placeholder="Buscar clientes, operaciones, leads, operadores..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? "Buscando..." : "No se encontraron resultados."}
        </CommandEmpty>

        {/* Resultados de búsqueda */}
        {results.length > 0 && (
          <CommandGroup heading="Resultados">
            {results.map((result) => {
              const Icon = getIcon(result.type)
              const path = result.type === "customer" 
                ? `/customers/${result.id}`
                : result.type === "operation"
                  ? `/operations/${result.id}`
                  : result.type === "operator"
                    ? `/operators/${result.id}`
                    : `/sales/leads?leadId=${result.id}`

              // Labels para el tipo
              const typeLabels: Record<string, string> = {
                customer: "Cliente",
                operation: "Operación",
                operator: "Operador",
                lead: "Lead",
              }

              return (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => navigateTo(path)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{result.title}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {typeLabels[result.type]}
                      </span>
                    </div>
                    {result.subtitle && (
                      <span className="text-xs text-muted-foreground mt-0.5">{result.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Navegación rápida */}
        <CommandGroup heading="Navegación">
          <CommandItem onSelect={() => navigateTo("/")}>
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/operations")}>
            <Plane className="mr-2 h-4 w-4" />
            Operaciones
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/customers")}>
            <Users className="mr-2 h-4 w-4" />
            Clientes
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/sales")}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Leads
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/operators")}>
            <Building2 className="mr-2 h-4 w-4" />
            Operadores
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/cash/summary")}>
            <DollarSign className="mr-2 h-4 w-4" />
            Caja
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/reports")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Reportes
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/calendar")}>
            <Calendar className="mr-2 h-4 w-4" />
            Calendario
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/alerts")}>
            <Bell className="mr-2 h-4 w-4" />
            Alertas
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/tools/tasks")}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Tareas
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Configuración
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Acciones rápidas */}
        <CommandGroup heading="Acciones Rápidas">
          <CommandItem onSelect={() => navigateTo("/operations?new=true")}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Operación
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/customers?new=true")}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cliente
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/sales?new=true")}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Lead
          </CommandItem>
          <CommandItem onSelect={() => navigateTo("/tools/tasks?new=true")}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Nueva Tarea
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

