"use client"

import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EntityPanel } from "@/components/import/entity-panel"
import { StatusChips } from "@/components/import/status-chips"
import { agenciesSchema, agenciesCsvHeaders } from "@/lib/import/schemas/agencies"
import { financialAccountsSchema, financialAccountsCsvHeaders } from "@/lib/import/schemas/financial-accounts"
import { customersSchema, customersCsvHeaders } from "@/lib/import/schemas/customers"
import { operatorsSchema, operatorsCsvHeaders } from "@/lib/import/schemas/operators"
import { usersSchema, usersCsvHeaders } from "@/lib/import/schemas/users"
import { operationsSchema, operationsCsvHeaders } from "@/lib/import/schemas/operations"
import { paymentsSchema, paymentsCsvHeaders } from "@/lib/import/schemas/payments"
import { cashMovementsSchema, cashMovementsCsvHeaders } from "@/lib/import/schemas/cash-movements"

export default function ImportPage() {
  const [confirmUsersOpen, setConfirmUsersOpen] = useState(false)
  const [resolveUsers, setResolveUsers] = useState<((v: boolean) => void) | null>(null)
  const [confirmAccountsOpen, setConfirmAccountsOpen] = useState(false)
  const [resolveAccounts, setResolveAccounts] = useState<((v: boolean) => void) | null>(null)

  function askUsersConfirm(): Promise<boolean> {
    return new Promise((res) => {
      setResolveUsers(() => res)
      setConfirmUsersOpen(true)
    })
  }
  function askAccountsConfirm(): Promise<boolean> {
    return new Promise((res) => {
      setResolveAccounts(() => res)
      setConfirmAccountsOpen(true)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importación de datos</h1>
        <p className="text-sm text-slate-500">
          Cargá tus datos preexistentes desde CSV. Cada entidad tiene su plantilla estricta — descargala, completala, y subila.
        </p>
      </div>

      <StatusChips items={[]} />

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="agencies">
          <AccordionTrigger>Agencias</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="agencies"
              title="Agencias"
              description="Sub-agencias del tenant."
              schema={agenciesSchema}
              headers={agenciesCsvHeaders}
              templatePath="/templates/agencies.csv"
              endpoint="/api/import/agencies"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="financial-accounts">
          <AccordionTrigger>Cuentas financieras (caja, bancos)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="financial-accounts"
              title="Cuentas financieras"
              description="Caja, bancos, tarjetas, billeteras virtuales."
              schema={financialAccountsSchema}
              headers={financialAccountsCsvHeaders}
              templatePath="/templates/financial-accounts.csv"
              endpoint="/api/import/financial-accounts"
              deps={["agencies"]}
              onConfirm={askAccountsConfirm}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="customers">
          <AccordionTrigger>Clientes</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="customers"
              title="Clientes"
              description="Base de clientes/pasajeros."
              schema={customersSchema}
              headers={customersCsvHeaders}
              templatePath="/templates/customers.csv"
              endpoint="/api/import/customers"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operators">
          <AccordionTrigger>Operadores</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="operators"
              title="Operadores"
              description="Proveedores mayoristas."
              schema={operatorsSchema}
              headers={operatorsCsvHeaders}
              templatePath="/templates/operators.csv"
              endpoint="/api/import/operators"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="users">
          <AccordionTrigger>Vendedores</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="users"
              title="Vendedores"
              description="Equipo comercial. Se les manda email de invitación."
              schema={usersSchema}
              headers={usersCsvHeaders}
              templatePath="/templates/users.csv"
              endpoint="/api/import/users"
              deps={["agencies"]}
              onConfirm={askUsersConfirm}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operations">
          <AccordionTrigger>Operaciones (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="operations"
              title="Operaciones"
              description="Histórico de operaciones. Opcional."
              schema={operationsSchema}
              headers={operationsCsvHeaders}
              templatePath="/templates/operations.csv"
              endpoint="/api/import/operations"
              deps={["customers", "operators", "users", "agencies"]}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="payments">
          <AccordionTrigger>Pagos (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="payments"
              title="Pagos"
              description="Pagos de clientes o a operadores. Opcional."
              schema={paymentsSchema}
              headers={paymentsCsvHeaders}
              templatePath="/templates/payments.csv"
              endpoint="/api/import/payments"
              deps={["operations"]}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cash-movements">
          <AccordionTrigger>Movimientos de caja (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="cash-movements"
              title="Movimientos de caja"
              description="Histórico de movimientos de caja. Opcional."
              schema={cashMovementsSchema}
              headers={cashMovementsCsvHeaders}
              templatePath="/templates/cash-movements.csv"
              endpoint="/api/import/cash-movements"
              deps={["financial-accounts"]}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={confirmUsersOpen} onOpenChange={setConfirmUsersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar invitación de vendedores</DialogTitle>
            <DialogDescription>
              A cada email listado se le va a mandar un link de invitación con reset de contraseña.
              No hay vuelta atrás — los emails se envían inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmUsersOpen(false); resolveUsers?.(false) }}>
              Cancelar
            </Button>
            <Button onClick={() => { setConfirmUsersOpen(false); resolveUsers?.(true) }}>
              Enviar invitaciones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAccountsOpen} onOpenChange={setConfirmAccountsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldos iniciales</DialogTitle>
            <DialogDescription>
              Los saldos iniciales de las cuentas van a ser registrados como saldos de apertura.
              Asegurate que los montos sean correctos — después de importar no se pueden editar fácilmente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAccountsOpen(false); resolveAccounts?.(false) }}>
              Cancelar
            </Button>
            <Button onClick={() => { setConfirmAccountsOpen(false); resolveAccounts?.(true) }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
