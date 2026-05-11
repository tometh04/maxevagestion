import { redirect } from "next/navigation"

/**
 * URL legacy → redirect permanente a la versión V2 del importador.
 * V1 (BulkImportTab + entity-panel/error-panel/preview-table) quedó deprecado
 * tras el rollout de import V2 con motor lib/import/ y endpoint chunked.
 */
export default function ImportPage() {
  redirect("/settings/import-v2")
}
