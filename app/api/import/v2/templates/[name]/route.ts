import { NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"

export const dynamic = "force-dynamic"

const VALID_TEMPLATES = [
  "operations-master",
  "customers",
  "operators",
  "payments-suelto",
  "cash-movements",
]

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!VALID_TEMPLATES.includes(name)) {
    return NextResponse.json({ error: "Template no encontrado" }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), "lib/import/templates", `${name}.csv`)
    const content = await fs.readFile(filePath, "utf-8")

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    })
  } catch (error: any) {
    console.error(`Error reading template ${name}:`, error)
    return NextResponse.json(
      { error: "Error leyendo el template" },
      { status: 500 }
    )
  }
}
