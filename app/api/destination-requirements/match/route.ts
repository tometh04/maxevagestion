import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// Mapeo de destinos comunes a códigos de país
const destinationMappings: Record<string, string[]> = {
  // Brasil
  "BR": ["brasil", "brazil", "rio", "rio de janeiro", "sao paulo", "são paulo", "florianopolis", "florianópolis", "salvador", "fortaleza", "recife", "buzios", "búzios", "arraial", "porto seguro", "maceió", "maceio", "natal", "foz de iguazu", "foz do iguaçu"],
  // Colombia
  "CO": ["colombia", "cartagena", "bogota", "bogotá", "medellin", "medellín", "cali", "san andres", "san andrés", "santa marta"],
  // Estados Unidos
  "US": ["estados unidos", "usa", "united states", "miami", "new york", "nueva york", "los angeles", "las vegas", "orlando", "disney", "california", "florida", "texas", "chicago", "boston", "washington", "san francisco", "hawaii", "hawai"],
  // Europa Schengen
  "EU": ["europa", "europe", "españa", "spain", "italia", "italy", "francia", "france", "alemania", "germany", "portugal", "grecia", "greece", "holanda", "netherlands", "belgica", "bélgica", "austria", "suiza", "switzerland", "roma", "paris", "barcelona", "madrid", "amsterdam", "berlin", "viena", "vienna", "praga", "prague", "budapest", "atenas", "athens", "lisboa", "lisbon", "venecia", "venice", "florencia", "florence", "milan", "milán"],
  // México
  "MX": ["mexico", "méxico", "cancun", "cancún", "riviera maya", "playa del carmen", "los cabos", "cabo san lucas", "puerto vallarta", "ciudad de mexico", "cdmx", "tulum", "cozumel"],
  // Cuba
  "CU": ["cuba", "habana", "la habana", "havana", "varadero", "santiago de cuba"],
  // República Dominicana  
  "DO": ["republica dominicana", "república dominicana", "dominicana", "punta cana", "santo domingo", "puerto plata", "bayahibe", "la romana", "samana", "samaná"],
  // Tailandia
  "TH": ["tailandia", "thailand", "bangkok", "phuket", "krabi", "chiang mai", "koh samui", "pattaya"],
  // Australia
  "AU": ["australia", "sydney", "melbourne", "brisbane", "perth", "gold coast", "cairns"],
  // Egipto
  "EG": ["egipto", "egypt", "cairo", "el cairo", "luxor", "aswan", "hurghada", "sharm el sheikh"],
  // Caribe genérico
  "CARIBE": ["caribe", "caribbean", "aruba", "curacao", "curaçao", "jamaica", "bahamas", "barbados", "san martin", "saint martin"],
}

// GET - Buscar requisitos que aplican a un destino
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    
    const { searchParams } = new URL(request.url)
    const destination = searchParams.get("destination")?.toLowerCase()

    if (!destination) {
      return NextResponse.json({ error: "Destino requerido" }, { status: 400 })
    }

    // Encontrar códigos de país que matchean con el destino
    const matchingCodes: string[] = []
    
    for (const [code, keywords] of Object.entries(destinationMappings)) {
      for (const keyword of keywords) {
        if (destination.includes(keyword) || keyword.includes(destination)) {
          if (!matchingCodes.includes(code)) {
            matchingCodes.push(code)
          }
          break
        }
      }
    }

    if (matchingCodes.length === 0) {
      return NextResponse.json({ requirements: [], matchedDestinations: [] })
    }

    // Buscar requisitos para los códigos encontrados
    const { data, error } = await (supabase.from("destination_requirements") as any)
      .select("*")
      .in("destination_code", matchingCodes)
      .eq("is_active", true)
      .order("is_required", { ascending: false })
      .order("requirement_type", { ascending: true })

    if (error) {
      console.error("Error fetching requirements:", error)
      return NextResponse.json({ error: "Error al buscar requisitos" }, { status: 500 })
    }

    // Obtener nombres de destinos encontrados (sin duplicados)
    const matchedDestinations = Array.from(new Set((data || []).map((r: any) => r.destination_name)))

    return NextResponse.json({ 
      requirements: data || [],
      matchedDestinations,
      searchedDestination: destination,
    })
  } catch (error: any) {
    console.error("Error in GET /api/destination-requirements/match:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

