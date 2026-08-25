import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/health — sonda de deploy, sin auth y sin tocar la base.
 *
 * Sirve para verificar que Railway levantó el commit que se pusheó: devuelve el
 * SHA que Railway inyecta en el contenedor. Si el SHA no coincide con el head de
 * main, el deploy no corrió o quedó en una build vieja.
 *
 * No expone nada del tenant ni de la config: solo metadata del deploy.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.RAILWAY_GIT_BRANCH ?? null,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
      deployedAt: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
