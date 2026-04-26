"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function OrgsSearchBar() {
  const router = useRouter()
  const search = useSearchParams()
  const initial = search?.get("q") ?? ""
  const [value, setValue] = React.useState(initial)

  // Debounce 300ms — al cambiar el input, esperamos antes de empujar a la URL.
  React.useEffect(() => {
    if (value === initial) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(search?.toString() ?? "")
      if (value.trim()) {
        params.set("q", value.trim())
      } else {
        params.delete("q")
      }
      params.delete("page")
      router.push(`/admin/orgs?${params.toString()}`)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function clear() {
    setValue("")
    const params = new URLSearchParams(search?.toString() ?? "")
    params.delete("q")
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Buscar por nombre, slug, CUIT, email, ID..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="max-w-md"
      />
      {value && (
        <Button variant="ghost" size="sm" onClick={clear}>
          Limpiar
        </Button>
      )}
    </div>
  )
}
