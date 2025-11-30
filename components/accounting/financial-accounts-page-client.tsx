"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

const accountTypeLabels: Record<string, string> = {
  CASH: "Caja",
  BANK: "Banco",
  MP: "Mercado Pago",
  USD: "Cuenta USD",
}

export function FinancialAccountsPageClient() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    async function fetchAccounts() {
      setLoading(true)
      try {
        const response = await fetch("/api/accounting/financial-accounts")
        if (!response.ok) throw new Error("Error al obtener cuentas financieras")

        const data = await response.json()
        setAccounts(data.accounts || [])
      } catch (error) {
        console.error("Error fetching financial accounts:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAccounts()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No se encontraron cuentas financieras
      </div>
    )
  }

  // Group accounts by type
  const accountsByType = accounts.reduce((acc, account) => {
    const type = account.type
    if (!acc[type]) {
      acc[type] = []
    }
    acc[type].push(account)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(accountsByType).map(([type, typeAccounts]) => {
          const accounts = typeAccounts as any[]
          const totalBalance = accounts.reduce(
            (sum, acc) => sum + (acc.current_balance || 0),
            0
          )
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {accountTypeLabels[type] || type}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalBalance, accounts[0]?.currency || "ARS")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cuentas Financieras</CardTitle>
          <CardDescription>Balance actual de todas las cuentas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Balance Inicial</TableHead>
                <TableHead>Balance Actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{accountTypeLabels[account.type] || account.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{account.currency}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatCurrency(account.initial_balance || 0, account.currency)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-bold ${
                        account.current_balance >= 0 ? "text-amber-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(account.current_balance || 0, account.currency)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

