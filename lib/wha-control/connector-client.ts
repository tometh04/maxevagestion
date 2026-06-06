/**
 * Helper to call the WHA Connector Service (Railway)
 */

export interface ConnectorResult {
  ok: boolean
  data: any
  error?: string
}

export async function callConnector(
  path: string,
  method: string = "GET",
  body?: any,
  timeoutMs: number = 10000
): Promise<ConnectorResult> {
  const url = process.env.WHA_CONNECTOR_URL
  const secret = process.env.WHA_CONNECTOR_SECRET

  if (!url) {
    console.error("WHA_CONNECTOR_URL not set")
    return { ok: false, data: null, error: "Connector no configurado (WHA_CONNECTOR_URL)" }
  }

  if (!secret) {
    console.error("WHA_CONNECTOR_SECRET not set")
    return { ok: false, data: null, error: "Connector no configurado (WHA_CONNECTOR_SECRET)" }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const text = await res.text()
      console.error(`Connector error ${res.status}: ${text}`)
      return { ok: false, data: null, error: `Connector respondió ${res.status}: ${text}` }
    }

    const text = await res.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      console.error("Connector response is not JSON:", text)
      return { ok: false, data: null, error: "Respuesta inválida del connector" }
    }
    return { ok: true, data }
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("Connector call timed out:", path)
      return { ok: false, data: null, error: "Connector no responde (timeout)" }
    }
    console.error("Connector call failed:", err)
    return { ok: false, data: null, error: `Error de conexión: ${err.message}` }
  }
}
