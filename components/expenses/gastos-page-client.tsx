"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Receipt, Repeat } from "lucide-react"
import { VariableExpensesTab } from "./variable-expenses-tab"
import { RecurringPaymentsPageClient } from "@/components/accounting/recurring-payments-page-client"

interface Agency {
  id: string
  name: string
}

interface GastosPageClientProps {
  agencies: Agency[]
}

export function GastosPageClient({ agencies }: GastosPageClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
        <p className="text-muted-foreground">
          Gestión de gastos fijos (recurrentes) y variables de la agencia
        </p>
      </div>

      <Tabs defaultValue="variables" className="space-y-4">
        <TabsList>
          <TabsTrigger value="variables" className="gap-2">
            <Receipt className="h-4 w-4" />
            Variables
          </TabsTrigger>
          <TabsTrigger value="recurrentes" className="gap-2">
            <Repeat className="h-4 w-4" />
            Fijos / Recurrentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="variables">
          <VariableExpensesTab />
        </TabsContent>

        <TabsContent value="recurrentes">
          <RecurringPaymentsPageClient agencies={agencies} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
