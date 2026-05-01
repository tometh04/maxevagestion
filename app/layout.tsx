import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { createServerClient } from "@/lib/supabase/server"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

const DEFAULT_TITLE = "Vibook - Sistema de Gestión"
const DEFAULT_DESCRIPTION = "Sistema de gestión integral para agencias de viajes"

// Título dinámico por tenant con cadena de fallbacks:
//   0) Si no hay user autenticado → DEFAULT_TITLE (rutas públicas como login/register)
//   1) organization_settings.company_name  (lo que el owner seteó en Mi Empresa)
//   2) primera agencies.name del org       (captura tenants que no completaron
//                                           Mi Empresa pero ya cargaron agencias)
//   3) DEFAULT_TITLE neutro                (tenant sin ninguno de los anteriores)
//
// El check de auth es explícito porque las RLS policies sobre agencies/
// organization_settings no necesariamente filtran requests anónimos
// (depende de la configuración del proyecto Supabase).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase: any = await createServerClient()

    // Fallback 0: rutas públicas sin user → marca neutra.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }
    }

    // Fallback 1: company_name custom.
    const { data: settingRow } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("key", "company_name")
      .maybeSingle()
    const companyName = typeof settingRow?.value === "string" ? settingRow.value.trim() : ""
    if (companyName) {
      return {
        title: `${companyName} - Gestión de Agencia`,
        description: DEFAULT_DESCRIPTION,
      }
    }

    // Fallback 2: primera agency del org.
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("name")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    const agencyName = typeof agencyRow?.name === "string" ? agencyRow.name.trim() : ""
    if (agencyName) {
      return {
        title: `${agencyName} - Gestión de Agencia`,
        description: DEFAULT_DESCRIPTION,
      }
    }

    return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }
  } catch {
    return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning style={{ margin: 0, padding: 0 }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            theme="system"
            toastOptions={{
              classNames: {
                toast: "rounded-lg border bg-background text-foreground shadow-card",
                description: "text-muted-foreground",
                actionButton: "bg-primary text-primary-foreground",
                cancelButton: "bg-muted text-muted-foreground",
                success: "border-success/30",
                error: "border-destructive/30",
                warning: "border-accent-coral/30",
                info: "border-accent-teal/30",
              },
            }}
          />
          <ShadcnToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

