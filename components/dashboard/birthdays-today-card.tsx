"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Cake, ExternalLink, MessageSquare } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

interface BirthdayCustomer {
  id: string
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string
  agency_id: string
}

export function BirthdaysTodayCard() {
  const [customers, setCustomers] = useState<BirthdayCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBirthdays()
  }, [])

  async function fetchBirthdays() {
    try {
      const response = await fetch("/api/customers/birthdays-today")
      if (response.ok) {
        const data = await response.json()
        setCustomers(data.customers || [])
      }
    } catch (error) {
      console.error("Error fetching birthdays:", error)
    } finally {
      setLoading(false)
    }
  }

  function openWhatsApp(customer: BirthdayCustomer) {
    const message = `🎂 ¡Feliz Cumpleaños ${customer.first_name}!\n\nQue este nuevo año venga con muchos viajes y aventuras increíbles ✨\n\n¡Te esperamos pronto para planear tu próximo destino! 🌎`
    const cleanPhone = customer.phone.replace(/\D/g, "")
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank")
  }

  function getInitials(firstName: string, lastName: string) {
    return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (customers.length === 0) {
    return null // No mostrar card si no hay cumpleaños
  }

  return (
    <Card className="border-pink-200 bg-pink-50/50 dark:bg-pink-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-500" />
          🎂 Cumpleaños Hoy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-card"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-pink-100 text-pink-600 text-xs">
                    {getInitials(customer.first_name, customer.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {customer.first_name} {customer.last_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{customer.phone}</p>
                </div>
              </div>
              {customer.phone && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openWhatsApp(customer)}
                  className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                >
                  <MessageSquare className="h-3 w-3" />
                  Saludar
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

