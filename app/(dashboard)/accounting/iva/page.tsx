import { IVAPageClient } from "@/components/accounting/iva-page-client"

export default function IVAPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">IVA</h1>
        <p className="text-muted-foreground">
          Cálculo y seguimiento de IVA en ventas y compras
        </p>
      </div>

      <IVAPageClient />
    </div>
  )
}

