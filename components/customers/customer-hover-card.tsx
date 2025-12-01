"use client"

import { useState, useEffect } from "react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarDays, Mail, Phone, MapPin, Plane } from "lucide-react"
import Link from "next/link"

interface CustomerHoverCardProps {
  customerId: string
  children: React.ReactNode
}

interface CustomerData {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  nationality: string | null
  created_at: string
  operationsCount: number
}

export function CustomerHoverCard({ customerId, children }: CustomerHoverCardProps) {
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open && !customer) {
      fetchCustomerData()
    }
  }, [open])

  const fetchCustomerData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      const data = await response.json()
      
      // Obtener conteo de operaciones
      const opsResponse = await fetch(`/api/customers/${customerId}/operations`)
      const opsData = await opsResponse.json()
      
      setCustomer({
        ...data.customer,
        operationsCount: opsData.operations?.length || 0,
      })
    } catch (error) {
      console.error("Error fetching customer:", error)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : customer ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(customer.first_name, customer.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <Link 
                  href={`/customers/${customer.id}`}
                  className="font-semibold hover:underline"
                >
                  {customer.first_name} {customer.last_name}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Plane className="h-3 w-3 mr-1" />
                    {customer.operationsCount} viajes
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {customer.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.nationality && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{customer.nationality}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                <span>Cliente desde {new Date(customer.created_at).toLocaleDateString("es-AR")}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-4">
            No se pudo cargar la información
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

