"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, MapPin, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useDebounce } from "@/hooks/use-debounce"
import { searchDestinations, type DestinationSearchResult } from "@/lib/destinations"

interface DestinationComboboxProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function DestinationCombobox({
  value,
  onChange,
  placeholder = "Ciudad de destino...",
  disabled = false,
}: DestinationComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<DestinationSearchResult[]>([])
  const debouncedQuery = useDebounce(query, 200)

  // Search destinations when query changes
  React.useEffect(() => {
    // searchDestinations is synchronous and fast (local data)
    const searchResults = searchDestinations(debouncedQuery)
    setResults(searchResults)
  }, [debouncedQuery])

  // Load popular destinations when opened
  React.useEffect(() => {
    if (open && !query) {
      setResults(searchDestinations(""))
    }
  }, [open, query])

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setOpen(false)
    setQuery("")
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
    setQuery("")
  }

  // Check if the typed query matches any result exactly
  const queryMatchesResult = results.some(
    r => r.value.toLowerCase() === debouncedQuery.toLowerCase()
  )

  // Show "use custom" option when query is long enough and doesn't match existing
  const showCustomOption = debouncedQuery.length >= 2 && !queryMatchesResult

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            {value || placeholder}
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
        className="min-w-[var(--radix-popover-trigger-width)] w-[400px] max-w-[90vw] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar ciudad, destino o código IATA..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[280px]">
            {results.length === 0 && !showCustomOption && debouncedQuery.length >= 2 ? (
              <CommandEmpty>No se encontraron destinos</CommandEmpty>
            ) : results.length === 0 && debouncedQuery.length > 0 && debouncedQuery.length < 2 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Seguí escribiendo para buscar...
              </div>
            ) : null}

            {/* Custom destination option */}
            {showCustomOption && (
              <CommandGroup>
                <CommandItem
                  value={`custom-${debouncedQuery}`}
                  onSelect={() => handleSelect(debouncedQuery)}
                  className="flex items-center gap-2"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">
                      Usar &quot;{debouncedQuery}&quot; como destino
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Destino personalizado
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}

            {showCustomOption && results.length > 0 && <CommandSeparator />}

            {/* Search results */}
            {results.length > 0 && (
              <CommandGroup heading={debouncedQuery.length >= 2 ? "Resultados" : "Destinos populares"}>
                {results.map((result) => (
                  <CommandItem
                    key={result.value}
                    value={result.value}
                    onSelect={() => handleSelect(result.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === result.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{result.label}</span>
                      {result.subtitle && (
                        <span className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
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
