import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { createServerClient } from "@/lib/supabase/server"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

const DEFAULT_TITLE = "MAXEVA Gestión - Agencia de Viajes"
const DEFAULT_DESCRIPTION = "Sistema de gestión integral para agencias de viajes"

// Título dinámico por tenant. Antes estaba hardcodeado a "Lozada Rosario",
// lo que en el SaaS multi-tenant hacía que todas las agencias vieran el
// nombre de Lozada en la pestaña del browser. Ahora leemos
// organization_settings.company_name (scoped por RLS al org del user).
// En rutas públicas (login/register) no hay user → query devuelve vacío
// → fallback neutro.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase: any = await createServerClient()
    const { data } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("key", "company_name")
      .maybeSingle()
    const companyName = typeof data?.value === "string" ? data.value.trim() : ""
    return {
      title: companyName ? `${companyName} - Gestión de Agencia` : DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    }
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
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

