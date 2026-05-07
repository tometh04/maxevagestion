import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Props = { orgId: string }

export async function OrgMembersCard({ orgId }: Props) {
  const admin = createAdminClient() as any

  const [{ data: members }, { data: authData }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, email, role, is_active, auth_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  const lastSignInMap = new Map<string, string | null>()
  for (const u of authData?.users ?? []) {
    lastSignInMap.set(u.id, u.last_sign_in_at ?? null)
  }

  const rows = (members ?? []) as Array<{
    id: string
    name: string | null
    email: string
    role: string
    is_active: boolean
    auth_id: string
    created_at: string
  }>

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-base">
          Miembros ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin miembros.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th>Email</Th>
                  <Th>Nombre</Th>
                  <Th>Rol</Th>
                  <Th>Activo</Th>
                  <Th>Último login</Th>
                  <Th>Creado</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const lastSignIn = lastSignInMap.get(m.auth_id) ?? null
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        "border-t border-border",
                        !m.is_active && "bg-muted/20",
                      )}
                    >
                      <Td className="font-medium text-muted-foreground">{m.email}</Td>
                      <Td>{m.name ?? "—"}</Td>
                      <Td>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">
                          {m.role}
                        </span>
                      </Td>
                      <Td>
                        {m.is_active ? (
                          <span className="text-success">✓</span>
                        ) : (
                          <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                            Inactivo
                          </span>
                        )}
                      </Td>
                      <Td className="text-muted-foreground">{relativeTime(lastSignIn)}</Td>
                      <Td className="text-muted-foreground">{relativeTime(m.created_at)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left">{children}</th>
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months}mes`
  return `hace ${Math.floor(months / 12)}a`
}
