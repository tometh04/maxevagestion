import { getCurrentUser } from "@/lib/auth"

export default async function ResourcesTemplatesPage() {
  const { user } = await getCurrentUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Templates</h1>
        <p className="text-muted-foreground">
          Plantillas PDF para cotizaciones y confirmaciones
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Crear y editar templates PDF</li>
          <li>Templates para cotizaciones</li>
          <li>Templates para confirmaciones</li>
          <li>Personalizar diseño y contenido</li>
          <li>Vista previa de templates</li>
        </ul>
      </div>
    </div>
  )
}

