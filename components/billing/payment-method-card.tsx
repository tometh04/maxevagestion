"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  hasActivePreapproval: boolean
  cardSummary: string | null // e.g. "Visa ••••4242" si lo tenemos
}

export function PaymentMethodCard({ hasActivePreapproval, cardSummary }: Props) {
  async function openUpdateCard() {
    const res = await fetch("/api/billing/update-card-link")
    if (!res.ok) {
      alert("No se pudo generar el link de MercadoPago")
      return
    }
    const { url } = await res.json()
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (!hasActivePreapproval) {
    return (
      <Card>
        <CardHeader><CardTitle>Método de pago</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Todavía no configuraste un método de pago.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>Método de pago</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💳</div>
          <div>
            <div className="font-medium">
              {cardSummary || "Tarjeta asociada en Mercado Pago"}
            </div>
            <div className="text-xs text-muted-foreground">
              Gestionada directamente en MP por seguridad.
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={openUpdateCard}>
          Cambiar tarjeta
        </Button>
        <p className="text-xs text-muted-foreground">
          🔒 Tu tarjeta se guarda en Mercado Pago con cifrado PCI. Nunca vemos los datos completos.
        </p>
      </CardContent>
    </Card>
  )
}
