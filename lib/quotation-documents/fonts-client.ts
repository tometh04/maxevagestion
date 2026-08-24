type FontReadyDocument = {
  fonts?: {
    ready?: Promise<unknown>
  }
}

type LayoutRoot = {
  getBoundingClientRect: () => unknown
}

/**
 * Fuerza el layout para que el navegador descubra las fuentes usadas y espera
 * a que terminen de cargar antes de capturar o abrir el diálogo de impresión.
 */
export async function waitForQuotationDocumentFonts(
  documentObject: FontReadyDocument,
  renderRoot?: LayoutRoot | null
): Promise<void> {
  renderRoot?.getBoundingClientRect()

  const ready = documentObject.fonts?.ready
  if (ready) await ready
}
