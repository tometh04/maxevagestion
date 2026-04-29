export interface ChunkedUploadResult {
  totalInserted: number
  totalConflicts: number
  conflicts: unknown[]
  aborted: boolean
  errorMessage?: string
}

/**
 * Uploadea rows a un endpoint en chunks de 500 secuencialmente.
 * Llama onProgress con { current, total } después de cada chunk.
 * Si un chunk falla, aborta siguientes y devuelve aborted=true.
 */
export async function uploadInChunks(
  rows: unknown[],
  endpoint: string,
  onProgress: (p: { current: number; total: number }) => void,
  chunkSize = 500
): Promise<ChunkedUploadResult> {
  const chunks: unknown[][] = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize))
  }

  const sessionId = crypto.randomUUID()
  let totalInserted = 0
  const allConflicts: unknown[] = []

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: chunks[i],
          chunk_index: i,
          total_chunks: chunks.length,
          session_id: sessionId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return {
          totalInserted,
          totalConflicts: allConflicts.length,
          conflicts: allConflicts,
          aborted: true,
          errorMessage: err.error || `HTTP ${res.status}`,
        }
      }
      const body = await res.json()
      totalInserted += body.inserted ?? 0
      if (body.conflicts) allConflicts.push(...body.conflicts)
      onProgress({ current: i + 1, total: chunks.length })
    } catch (e: any) {
      return {
        totalInserted,
        totalConflicts: allConflicts.length,
        conflicts: allConflicts,
        aborted: true,
        errorMessage: e.message || "Network error",
      }
    }
  }

  return {
    totalInserted,
    totalConflicts: allConflicts.length,
    conflicts: allConflicts,
    aborted: false,
  }
}
