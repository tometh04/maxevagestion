import { BulkImportTab } from "@/components/settings/bulk-import-tab"

/**
 * URL standalone para importación masiva. Usa el mismo componente que el tab
 * dentro de /settings. Se conserva esta ruta porque el banner del dashboard
 * ya linkea acá — un redirect a /settings?tab=import agregaría un hop innecesario.
 */
export default function ImportPage() {
  return <BulkImportTab />
}
