"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { OperatorsTable, Operator } from "./operators-table"
import { NewOperatorDialog } from "./new-operator-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

interface OperatorsPageClientProps {
  initialOperators: Operator[]
}

export function OperatorsPageClient({ initialOperators }: OperatorsPageClientProps) {
  const [operators, setOperators] = useState<Operator[]>(initialOperators)
  const [loading, setLoading] = useState(false)
  const [newOperatorDialogOpen, setNewOperatorDialogOpen] = useState(false)

  const fetchOperators = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/operators")
      const data = await response.json()
      setOperators(data.operators || [])
    } catch (error) {
      console.error("Error fetching operators:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOperators()
  }, [fetchOperators])

  const handleOperatorCreated = useCallback(() => {
    fetchOperators()
  }, [fetchOperators])

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Operadores</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Operadores</h1>
          <p className="text-muted-foreground">Gestiona tus operadores y mayoristas</p>
        </div>
        <Button onClick={() => setNewOperatorDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Operador
        </Button>
      </div>

      <OperatorsTable 
        operators={operators} 
        isLoading={loading} 
        emptyMessage="No hay operadores registrados"
      />

      <NewOperatorDialog
        open={newOperatorDialogOpen}
        onOpenChange={setNewOperatorDialogOpen}
        onSuccess={handleOperatorCreated}
      />
    </div>
  )
}

