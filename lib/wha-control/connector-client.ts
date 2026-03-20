/**
 * Helper to call the WHA Connector Service (Railway)
 */
export async function callConnector(path: string, method: string = "GET", body?: any) {
  const url = process.env.WHA_CONNECTOR_URL
  const secret = process.env.WHA_CONNECTOR_SECRET

  if (!url) {
    console.warn("WHA_CONNECTOR_URL not set — connector calls will be skipped")
    return null
  }

  try {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret || ""}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`Connector error ${res.status}: ${text}`)
      return null
    }

    return await res.json()
  } catch (err) {
    console.error("Connector call failed:", err)
    return null
  }
}
