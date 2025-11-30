"use client"

import { useState } from "react"
import { CustomersFilters } from "./customers-filters"
import { CustomersTable } from "./customers-table"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function CustomersPageClient() {
  const [filters, setFilters] = useState({ search: "" })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Gestiona tu base de clientes</p>
        </div>
        <Link href="/customers/new">
          <Button>Nuevo Cliente</Button>
        </Link>
      </div>

      <CustomersFilters onFilterChange={setFilters} />

      <CustomersTable initialFilters={filters} />
    </div>
  )
}

