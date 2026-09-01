"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { usePermissions } from "@/components/permissions/permissions-provider"

export interface CustomersFilterValues {
  search: string
  /** "ALL" o el id del vendedor de la última operación del cliente. */
  sellerId: string
}

interface CustomersFiltersProps {
  onFilterChange: (filters: CustomersFilterValues) => void
}

interface SellerOption {
  id: string
  name: string | null
  email: string | null
}

/**
 * El selector de vendedor no se le muestra al vendedor: `applyCustomersFilters`
 * ya lo acota a su propia cartera, así que elegir a otro solo devolvería una
 * lista vacía. Los roles que ven la cartera de la agencia sí lo necesitan.
 */
const ROLES_SIN_SELECTOR = ["SELLER", "POST_VENTA"]

export function CustomersFilters({ onFilterChange }: CustomersFiltersProps) {
  const { role } = usePermissions()
  const [search, setSearch] = useState("")
  const [sellerId, setSellerId] = useState("ALL")
  const [sellers, setSellers] = useState<SellerOption[]>([])

  const showSellerFilter = !ROLES_SIN_SELECTOR.includes(role as string)

  useEffect(() => {
    if (!showSellerFilter) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/users?role=SELLER,ADMIN,SUPER_ADMIN")
        const data = await res.json()
        if (!cancelled) setSellers(data.users || [])
      } catch (error) {
        console.error("Error fetching sellers for customers filter:", error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showSellerFilter])

  const handleApplyFilters = () => {
    onFilterChange({ search, sellerId })
  }

  const handleClearFilters = () => {
    setSearch("")
    setSellerId("ALL")
    onFilterChange({ search: "", sellerId: "ALL" })
  }

  const hasActiveFilters = search !== "" || sellerId !== "ALL"

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="search">Buscar</Label>
            <Input
              id="search"
              placeholder="Nombre, teléfono, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleApplyFilters()
                }
              }}
            />
          </div>

          {showSellerFilter && (
            <div className="space-y-2 md:w-64">
              <Label htmlFor="seller">Vendedor</Label>
              <Select
                value={sellerId}
                onValueChange={(value) => {
                  setSellerId(value)
                  // A diferencia del texto, el selector aplica solo: esperar el
                  // botón "Buscar" para un desplegable se siente roto.
                  onFilterChange({ search, sellerId: value })
                }}
              >
                <SelectTrigger id="seller">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los vendedores</SelectItem>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name || seller.email || "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleApplyFilters}>Buscar</Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
