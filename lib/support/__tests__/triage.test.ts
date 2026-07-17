import { classifyTicket } from "../triage"

describe("classifyTicket — fallback sin IA", () => {
  // Sin apiKey (y sin OPENAI_API_KEY en el entorno de test) debe caer al
  // fallback seguro derivado del tipo elegido, sin lanzar ni llamar a la red.
  const prevKey = process.env.OPENAI_API_KEY

  beforeAll(() => {
    delete process.env.OPENAI_API_KEY
  })
  afterAll(() => {
    if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey
  })

  it("un bug sin API key cae a fallback medium/normal, ai=false", async () => {
    const result = await classifyTicket({
      subject: "No puedo registrar un cobro",
      description: "Tira error al guardar",
      userType: "bug",
    })
    expect(result.category).toBe("bug")
    expect(result.severity).toBe("medium")
    expect(result.priority).toBe("normal")
    expect(result.ai).toBe(false)
  })

  it("una consulta sin API key cae a severidad baja", async () => {
    const result = await classifyTicket({
      subject: "¿Cómo exporto operaciones?",
      userType: "question",
    })
    expect(result.category).toBe("question")
    expect(result.severity).toBe("low")
    expect(result.ai).toBe(false)
  })

  it("una mejora sin API key preserva la categoría del usuario", async () => {
    const result = await classifyTicket({
      subject: "Sumar exportación a Excel",
      userType: "improvement",
    })
    expect(result.category).toBe("improvement")
    expect(result.ai).toBe(false)
  })
})
