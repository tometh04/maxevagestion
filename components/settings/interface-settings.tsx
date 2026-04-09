"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Palette, Image, Building2, Upload, X, Pencil, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Color options
// ---------------------------------------------------------------------------
const COLOR_OPTIONS = [
  { name: "Indigo", hex: "#6366f1", hsl: "239 84% 67%" },
  { name: "Blue", hex: "#3b82f6", hsl: "217 91% 60%" },
  { name: "Emerald", hex: "#10b981", hsl: "160 84% 39%" },
  { name: "Violet", hex: "#8b5cf6", hsl: "258 90% 66%" },
  { name: "Rose", hex: "#f43f5e", hsl: "347 77% 50%" },
  { name: "Amber", hex: "#f59e0b", hsl: "38 92% 50%" },
  { name: "Teal", hex: "#14b8a6", hsl: "168 76% 42%" },
  { name: "Slate", hex: "#64748b", hsl: "215 16% 47%" },
] as const

// ---------------------------------------------------------------------------
// Helper: save setting (API with localStorage fallback)
// ---------------------------------------------------------------------------
async function saveSetting(key: string, value: string) {
  // Always save to localStorage for immediate access
  localStorage.setItem(key, value)
  if (key === "address" || key === "company_address") {
    localStorage.setItem("address", value)
    localStorage.setItem("company_address", value)
  }

  try {
    const res = await fetch("/api/settings/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) throw new Error("API error")
  } catch {
    // API failed — localStorage fallback is already saved
    console.warn(`Failed to save ${key} to API, using localStorage fallback`)
  }
}

async function loadSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/settings/organization?key=${key}`)
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        const value = json.data[0].value
        localStorage.setItem(key, value)
        return value
      }
    }
  } catch {
    // API failed — fall back to localStorage
  }
  return localStorage.getItem(key)
}

async function loadAllSettings(): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    const res = await fetch("/api/settings/organization")
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        for (const row of json.data) {
          result[row.key] = row.value
          localStorage.setItem(row.key, row.value)
        }
      }
      return result
    }
  } catch {
    // fall back to localStorage
  }

  // Fallback: read known keys from localStorage
  const keys = [
    "brand_color",
    "brand_logo",
    "company_name",
    "address",
    "company_address",
    "phone",
    "email",
    "website",
    "tax_id",
    "legajo",
    "instagram",
  ]
  for (const k of keys) {
    const v = localStorage.getItem(k)
    if (v) result[k] = v
  }
  return result
}

// ---------------------------------------------------------------------------
// Helper: hex to HSL
// ---------------------------------------------------------------------------
function hexToHsl(hex: string): string | null {
  hex = hex.replace("#", "")
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
  if (hex.length !== 6) return null
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function hslToHex(hsl: string): string {
  const parts = hsl.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return "#6366f1"
  const h = parseFloat(parts[0]) / 360
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  let r, g, b
  if (s === 0) { r = g = b = l } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InterfaceSettings() {
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [customHex, setCustomHex] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [companyData, setCompanyData] = useState({
    company_name: "",
    tax_id: "",
    legajo: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    instagram: "",
  })
  const [savingCompany, setSavingCompany] = useState(false)
  const [logoHover, setLogoHover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load all settings on mount
  useEffect(() => {
    loadAllSettings().then((settings) => {
      if (settings.brand_color) {
        setSelectedColor(settings.brand_color)
        setCustomHex(hslToHex(settings.brand_color))
      }
      if (settings.brand_logo) setLogoUrl(settings.brand_logo)
      setCompanyData((prev) => ({
        ...prev,
        company_name: settings.company_name || "",
        tax_id: settings.tax_id || settings.company_tax_id || "",
        legajo: settings.legajo || settings.company_legajo || "",
        address: settings.address || settings.company_address || "",
        phone: settings.phone || settings.company_phone || "",
        email: settings.email || settings.company_email || "",
        website: settings.website || settings.company_website || "",
        instagram: settings.instagram || settings.company_instagram || "",
      }))
    })
  }, [])

  // --- Color picker handler ---
  const handleColorSelect = useCallback(async (hsl: string, hex: string) => {
    setSelectedColor(hsl)
    setCustomHex(hex)
    document.documentElement.style.setProperty("--primary", hsl)
    await saveSetting("brand_color", hsl)
    toast.success("Color principal actualizado")
  }, [])

  const handleCustomHexChange = useCallback((value: string) => {
    setCustomHex(value)
    // Auto-apply when it's a valid hex
    const clean = value.startsWith("#") ? value : `#${value}`
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      const hsl = hexToHsl(clean)
      if (hsl) {
        setSelectedColor(hsl)
        document.documentElement.style.setProperty("--primary", hsl)
        saveSetting("brand_color", hsl)
        toast.success("Color personalizado aplicado")
      }
    }
  }, [])

  // --- Logo upload handler ---
  const handleLogoUpload = useCallback(async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no puede superar 2MB")
      return
    }
    const validTypes = ["image/png", "image/svg+xml", "image/webp"]
    if (!validTypes.includes(file.type)) {
      toast.error("Solo se permiten archivos PNG, SVG o WEBP")
      return
    }

    setUploading(true)
    try {
      // Upload to Supabase Storage via a simple approach:
      // Create a FormData and use the existing upload pattern
      try {
        const ext = file.name.split(".").pop() || "png"
        const fileName = `brand-logo-${Date.now()}.${ext}`

        // Use supabase client-side upload
        const { supabase } = await import("@/lib/supabase/client")

        const { data, error } = await supabase.storage
          .from("documents")
          .upload(`logos/${fileName}`, file, {
            cacheControl: "3600",
            upsert: true,
          })

        if (error) throw error

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(`logos/${fileName}`)

        const publicUrl = urlData.publicUrl
        setLogoUrl(publicUrl)
        await saveSetting("brand_logo", publicUrl)
        toast.success("Logo actualizado correctamente")
      } catch (storageError) {
        // Fallback: convert to data URL and store in localStorage
        console.warn("Storage upload failed, using data URL fallback:", storageError)
        const reader = new FileReader()
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          setLogoUrl(dataUrl)
          await saveSetting("brand_logo", dataUrl)
          toast.success("Logo guardado localmente")
        }
        reader.readAsDataURL(file)
      }
    } catch (err) {
      toast.error("Error al subir el logo")
      console.error(err)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleLogoUpload(file)
    },
    [handleLogoUpload]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleLogoUpload(file)
    },
    [handleLogoUpload]
  )

  const handleDeleteLogo = useCallback(async () => {
    setLogoUrl(null)
    await saveSetting("brand_logo", "")
    toast.success("Logo eliminado")
  }, [])

  // --- Company data handler ---
  const handleSaveCompanyData = useCallback(async () => {
    setSavingCompany(true)
    try {
      const entries = Object.entries(companyData)
      await Promise.all(entries.map(([key, value]) => saveSetting(key, value)))
      toast.success("Datos de la empresa guardados")
    } catch {
      toast.error("Error al guardar los datos")
    } finally {
      setSavingCompany(false)
    }
  }, [companyData])

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Datos de la Empresa */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
            <Building2 className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
            Datos de la Empresa
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="company_name" className="text-xs">
              Nombre de la Empresa
            </Label>
            <Input
              id="company_name"
              value={companyData.company_name}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, company_name: e.target.value }))
              }
              placeholder="Mi Empresa S.A."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax_id" className="text-xs">
              CUIT
            </Label>
            <Input
              id="tax_id"
              value={companyData.tax_id}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, tax_id: e.target.value }))
              }
              placeholder="30-12345678-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legajo" className="text-xs">
              Legajo (N° de Licencia)
            </Label>
            <Input
              id="legajo"
              value={companyData.legajo}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, legajo: e.target.value }))
              }
              placeholder="Ej: 12345"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs">
              Direccion
            </Label>
            <Input
              id="address"
              value={companyData.address}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, address: e.target.value }))
              }
              placeholder="Calle 123, Ciudad"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">
              Telefono
            </Label>
            <Input
              id="phone"
              value={companyData.phone}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, phone: e.target.value }))
              }
              placeholder="+54 341 1234567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp_email" className="text-xs">
              Email
            </Label>
            <Input
              id="comp_email"
              type="email"
              value={companyData.email}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, email: e.target.value }))
              }
              placeholder="info@miempresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website" className="text-xs">
              Sitio Web
            </Label>
            <Input
              id="website"
              value={companyData.website}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, website: e.target.value }))
              }
              placeholder="https://miempresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instagram" className="text-xs">
              Instagram
            </Label>
            <Input
              id="instagram"
              value={companyData.instagram}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, instagram: e.target.value }))
              }
              placeholder="@miempresa"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveCompanyData} disabled={savingCompany}>
            {savingCompany ? "Guardando..." : "Guardar Datos"}
          </Button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Color Principal + Logo (side by side) */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Color Principal */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <Palette className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
              Color Principal
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.name}
                type="button"
                title={color.name}
                onClick={() => handleColorSelect(color.hsl, color.hex)}
                className={`h-10 w-10 rounded-full transition-all ${
                  selectedColor === color.hsl
                    ? "ring-2 ring-offset-2 ring-offset-background ring-primary"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>

          {/* Custom color input */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-muted-foreground">o color personalizado:</span>
            <div className="flex items-center gap-1.5">
              {customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex) && (
                <div
                  className={`h-8 w-8 rounded-full border-2 ${
                    selectedColor && selectedColor === hexToHsl(customHex)
                      ? "ring-2 ring-offset-2 ring-offset-background ring-primary border-border/40"
                      : "border-border/40"
                  }`}
                  style={{ backgroundColor: customHex }}
                />
              )}
              <Input
                value={customHex}
                onChange={(e) => {
                  let val = e.target.value
                  if (!val.startsWith('#')) val = '#' + val
                  setCustomHex(val)
                  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    const hsl = hexToHsl(val)
                    if (hsl) {
                      handleColorSelect(hsl, val)
                    }
                  }
                }}
                placeholder="#4F46E5"
                className="w-28 h-8 text-xs font-mono"
                maxLength={7}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs text-muted-foreground">Vista previa:</span>
            <button
              type="button"
              className="rounded-md px-4 py-1.5 text-xs font-medium text-primary-foreground"
              style={{
                backgroundColor: selectedColor
                  ? `hsl(${selectedColor})`
                  : "hsl(var(--primary))",
              }}
            >
              Boton de ejemplo
            </button>
          </div>
        </div>

        {/* Logo de la Empresa */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
              <Image className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
              Logo de la Empresa
            </span>
          </div>

          {/* Logo area: upload placeholder OR logo preview */}
          {logoUrl ? (
            <div
              className="relative flex items-center justify-center rounded-lg bg-zinc-900/80 p-6 min-h-[160px]"
              onMouseEnter={() => setLogoHover(true)}
              onMouseLeave={() => setLogoHover(false)}
            >
              <img
                src={logoUrl}
                alt="Logo de la empresa"
                className="max-h-24 w-auto object-contain"
              />
              {/* Hover overlay with edit/delete buttons */}
              {logoHover && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-lg bg-black/60 transition-opacity">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteLogo}
                    className="flex items-center gap-1.5 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-background/50 p-8 min-h-[160px] transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <Upload className="h-8 w-8 text-muted-foreground/60" />
              <span className="text-sm text-muted-foreground text-center">
                {uploading
                  ? "Subiendo..."
                  : "Arrastra o hace click para subir tu logo"}
              </span>
              <span className="text-[11px] text-muted-foreground/60">
                PNG, SVG o WEBP — Max 2MB
              </span>
            </div>
          )}

          {/* Hidden file input (shared by both states) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.svg,.webp,image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-xs text-muted-foreground/70">
            Recomendamos un logo con fondo transparente en formato PNG o SVG
          </p>
        </div>
      </div>
    </div>
  )
}
