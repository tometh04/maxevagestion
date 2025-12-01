"use client"

import { useEffect, useState, useCallback } from "react"
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
} from "lucide-react"

interface SearchResult {
  id: string
  type: "customer" | "operation" | "operator" | "lead"
  title: string
  subtitle?: string
}

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Toggle con ⌘K o Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Búsqueda con debounce
  const searchData = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      setResults(data.results || [])
    } catch (error) {
      console.error("Search error:", error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchData(search)
    }, 300)

    return () => clearTimeout(timer)
  }, [search, searchData])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput 
        placeholder="Buscar clientes, operaciones, leads..." 
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
                    : `/sales?lead=${result.id}`

              return (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => navigateTo(path)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{result.title}</span>
                    {result.subtitle && (
                      <span className="text-xs text-muted-foreground">{result.subtitle}</span>
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
          <CommandItem onSelect={() => navigateTo("/cash")}>
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
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

