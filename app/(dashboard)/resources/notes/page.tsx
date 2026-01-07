import { getCurrentUser } from "@/lib/auth"

export default async function ResourcesNotesPage() {
  const { user } = await getCurrentUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notas</h1>
        <p className="text-muted-foreground">
          Notas colaborativas para operaciones y clientes
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Crear notas colaborativas</li>
          <li>Asociar notas a operaciones y clientes</li>
          <li>Compartir notas con el equipo</li>
          <li>Historial de notas</li>
        </ul>
      </div>
    </div>
  )
}

