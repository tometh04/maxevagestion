"use client"

import { useState } from "react"
import { LedgerTable } from "@/components/accounting/ledger-table"
import { LedgerFilters } from "@/components/accounting/ledger-filters"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface LedgerPageClientProps {
  agencies: Array<{ id: string; name: string }>
}

export function LedgerPageClient({ agencies }: LedgerPageClientProps) {
  const [filters, setFilters] = useState<{
    dateFrom?: string
    dateTo?: string
    type?: string
    currency?: string
    agencyId?: string
  }>({})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Libro Mayor (Ledger)</h1>
        <p className="text-muted-foreground">
          Vista completa de todos los movimientos contables del sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtrar movimientos por fecha, tipo y moneda</CardDescription>
        </CardHeader>
        <CardContent>
          <LedgerFilters agencies={agencies} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <CardDescription>Lista completa de movimientos del ledger</CardDescription>
        </CardHeader>
        <CardContent>
          <LedgerTable filters={filters} />
        </CardContent>
      </Card>
    </div>
  )
}

