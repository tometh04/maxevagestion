"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Syringe, 
  FileText, 
  CreditCard, 
  Shield, 
  File,
  Info
} from "lucide-react"

interface Requirement {
  id: string
  destination_code: string
  destination_name: string
  requirement_type: "VACCINE" | "FORM" | "VISA" | "INSURANCE" | "DOCUMENT" | "OTHER"
  requirement_name: string
  is_required: boolean
  description: string | null
  url: string | null
  days_before_trip: number
}

interface OperationRequirementsSectionProps {
  destination: string
  departureDate?: string
}

const typeConfig: Record<string, { icon: any; label: string; color: string }> = {
  VACCINE: { icon: Syringe, label: "Vacuna", color: "bg-red-500" },
  FORM: { icon: FileText, label: "Formulario", color: "bg-blue-500" },
  VISA: { icon: CreditCard, label: "Visa", color: "bg-purple-500" },
  INSURANCE: { icon: Shield, label: "Seguro", color: "bg-green-500" },
  DOCUMENT: { icon: File, label: "Documento", color: "bg-orange-500" },
  OTHER: { icon: Info, label: "Otro", color: "bg-gray-500" },
}

export function OperationRequirementsSection({ destination, departureDate }: OperationRequirementsSectionProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [matchedDestinations, setMatchedDestinations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRequirements = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/destination-requirements/match?destination=${encodeURIComponent(destination)}`)
      
      // Si falla silenciosamente, no mostrar error - simplemente no hay requisitos
      if (!response.ok) {
        setRequirements([])
        setMatchedDestinations([])
        return
      }
      
      const data = await response.json()
      setRequirements(data.requirements || [])
      setMatchedDestinations(data.matchedDestinations || [])
    } catch (error) {
      // Silenciar errores - la sección simplemente no se muestra
      console.warn("Could not fetch requirements:", error)
      setRequirements([])
      setMatchedDestinations([])
    } finally {
      setLoading(false)
    }
  }, [destination])

  useEffect(() => {
    if (destination) {
      fetchRequirements()
    } else {
      setLoading(false)
    }
  }, [destination, fetchRequirements])

  // Calcular días hasta el viaje
  const getDaysUntilTrip = () => {
    if (!departureDate) return null
    const today = new Date()
    const departure = new Date(departureDate + "T12:00:00")
    const diffTime = departure.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const daysUntilTrip = getDaysUntilTrip()

  // Verificar si un requisito necesita atención
  const needsAttention = (req: Requirement) => {
    if (!daysUntilTrip) return false
    return req.is_required && daysUntilTrip <= req.days_before_trip
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requisitos del Destino</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (requirements.length === 0) {
    return null // No mostrar nada si no hay requisitos
  }

  const requiredItems = requirements.filter(r => r.is_required)
  const optionalItems = requirements.filter(r => !r.is_required)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Requisitos del Destino
          </CardTitle>
          {matchedDestinations.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {matchedDestinations.join(", ")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Requisitos obligatorios */}
        {requiredItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-600 uppercase">Obligatorios</p>
            {requiredItems.map((req) => {
              const config = typeConfig[req.requirement_type]
              const Icon = config.icon
              const urgent = needsAttention(req)
              
              return (
                <div 
                  key={req.id} 
                  className={`p-3 rounded-lg border ${urgent ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" : "bg-muted/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${config.color} text-white shrink-0`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{req.requirement_name}</span>
                        {urgent && (
                          <Badge variant="destructive" className="text-xs">
                            ¡Atención!
                          </Badge>
                        )}
                      </div>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                      )}
                    </div>
                    {req.url && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="shrink-0"
                        onClick={() => window.open(req.url!, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Requisitos opcionales/recomendados */}
        {optionalItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Recomendados</p>
            {optionalItems.map((req) => {
              const config = typeConfig[req.requirement_type]
              const Icon = config.icon
              
              return (
                <div 
                  key={req.id} 
                  className="p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${config.color} text-white shrink-0 opacity-70`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{req.requirement_name}</span>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                      )}
                    </div>
                    {req.url && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="shrink-0"
                        onClick={() => window.open(req.url!, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

