/**
 * Base de datos de destinos turísticos para agencias de viajes argentinas.
 * Incluye ciudades con y sin aeropuerto, balnearios, pueblos turísticos, etc.
 *
 * Cada destino tiene:
 * - city: nombre de la ciudad/destino
 * - country: país
 * - countryCode: código ISO del país
 * - region: región geográfica
 * - iata?: código IATA del aeropuerto (si tiene)
 * - nearestAirport?: aeropuerto más cercano (si no tiene propio)
 * - aliases: nombres alternativos para búsqueda
 */

export interface Destination {
  city: string
  country: string
  countryCode: string
  region: string
  iata?: string
  nearestAirport?: string
  aliases: string[]
}

export const DESTINATIONS: Destination[] = [
  // ═══════════════════════════════════════════
  // CARIBE
  // ═══════════════════════════════════════════

  // República Dominicana
  { city: "Punta Cana", country: "República Dominicana", countryCode: "DO", region: "Caribe", iata: "PUJ", aliases: ["puntacana", "bavaro"] },
  { city: "Bayahibe", country: "República Dominicana", countryCode: "DO", region: "Caribe", nearestAirport: "PUJ (Punta Cana) / LRM (La Romana)", aliases: ["bayahibe", "dominicus"] },
  { city: "La Romana", country: "República Dominicana", countryCode: "DO", region: "Caribe", iata: "LRM", aliases: ["laromana", "romana"] },
  { city: "Santo Domingo", country: "República Dominicana", countryCode: "DO", region: "Caribe", iata: "SDQ", aliases: ["santodomingo"] },
  { city: "Puerto Plata", country: "República Dominicana", countryCode: "DO", region: "Caribe", iata: "POP", aliases: ["puertoplata", "playa dorada", "sosua", "cabarete"] },
  { city: "Samaná", country: "República Dominicana", countryCode: "DO", region: "Caribe", iata: "AZS", aliases: ["samana", "las terrenas", "lasterrenas"] },
  { city: "Boca Chica", country: "República Dominicana", countryCode: "DO", region: "Caribe", nearestAirport: "SDQ (Santo Domingo)", aliases: ["bocachica"] },
  { city: "Cap Cana", country: "República Dominicana", countryCode: "DO", region: "Caribe", nearestAirport: "PUJ (Punta Cana)", aliases: ["capcana"] },

  // México
  { city: "Cancún", country: "México", countryCode: "MX", region: "Caribe", iata: "CUN", aliases: ["cancun", "kanc"] },
  { city: "Riviera Maya", country: "México", countryCode: "MX", region: "Caribe", nearestAirport: "CUN (Cancún)", aliases: ["rivieramaya", "playacar"] },
  { city: "Playa del Carmen", country: "México", countryCode: "MX", region: "Caribe", nearestAirport: "CUN (Cancún)", aliases: ["playadelcarmen", "playa carmen"] },
  { city: "Tulum", country: "México", countryCode: "MX", region: "Caribe", nearestAirport: "CUN (Cancún)", aliases: ["tulum"] },
  { city: "Isla Mujeres", country: "México", countryCode: "MX", region: "Caribe", nearestAirport: "CUN (Cancún)", aliases: ["islamujeres"] },
  { city: "Cozumel", country: "México", countryCode: "MX", region: "Caribe", iata: "CZM", aliases: ["cozumel"] },
  { city: "Los Cabos", country: "México", countryCode: "MX", region: "Pacífico", iata: "SJD", aliases: ["loscabos", "cabo san lucas", "cabosanlucas", "san jose del cabo"] },
  { city: "Puerto Vallarta", country: "México", countryCode: "MX", region: "Pacífico", iata: "PVR", aliases: ["puertovallarta", "vallarta"] },
  { city: "Ciudad de México", country: "México", countryCode: "MX", region: "Centro América", iata: "MEX", aliases: ["cdmx", "mexico city", "df", "ciudaddemexico"] },
  { city: "Huatulco", country: "México", countryCode: "MX", region: "Pacífico", iata: "HUX", aliases: ["huatulco"] },
  { city: "Holbox", country: "México", countryCode: "MX", region: "Caribe", nearestAirport: "CUN (Cancún)", aliases: ["holbox", "isla holbox"] },
  { city: "Acapulco", country: "México", countryCode: "MX", region: "Pacífico", iata: "ACA", aliases: ["acapulco"] },

  // Cuba
  { city: "La Habana", country: "Cuba", countryCode: "CU", region: "Caribe", iata: "HAV", aliases: ["habana", "havana", "lahabana"] },
  { city: "Varadero", country: "Cuba", countryCode: "CU", region: "Caribe", iata: "VRA", aliases: ["varadero"] },
  { city: "Cayo Coco", country: "Cuba", countryCode: "CU", region: "Caribe", iata: "CCC", aliases: ["cayococo"] },
  { city: "Cayo Santa María", country: "Cuba", countryCode: "CU", region: "Caribe", nearestAirport: "SNU (Santa Clara)", aliases: ["cayosantamaria", "cayo santa maria"] },
  { city: "Trinidad", country: "Cuba", countryCode: "CU", region: "Caribe", nearestAirport: "SNU (Santa Clara)", aliases: ["trinidad cuba"] },
  { city: "Holguín", country: "Cuba", countryCode: "CU", region: "Caribe", iata: "HOG", aliases: ["holguin"] },

  // Jamaica
  { city: "Montego Bay", country: "Jamaica", countryCode: "JM", region: "Caribe", iata: "MBJ", aliases: ["montegobay", "mobay"] },
  { city: "Ocho Ríos", country: "Jamaica", countryCode: "JM", region: "Caribe", nearestAirport: "MBJ (Montego Bay)", aliases: ["ochorios"] },
  { city: "Negril", country: "Jamaica", countryCode: "JM", region: "Caribe", nearestAirport: "MBJ (Montego Bay)", aliases: ["negril"] },
  { city: "Kingston", country: "Jamaica", countryCode: "JM", region: "Caribe", iata: "KIN", aliases: ["kingston"] },

  // Aruba, Curazao, Bonaire
  { city: "Aruba", country: "Aruba", countryCode: "AW", region: "Caribe", iata: "AUA", aliases: ["aruba", "oranjestad", "palm beach", "eagle beach"] },
  { city: "Curazao", country: "Curazao", countryCode: "CW", region: "Caribe", iata: "CUR", aliases: ["curacao", "curazao", "willemstad"] },
  { city: "Bonaire", country: "Bonaire", countryCode: "BQ", region: "Caribe", iata: "BON", aliases: ["bonaire"] },
  { city: "San Andrés", country: "Colombia", countryCode: "CO", region: "Caribe", iata: "ADZ", aliases: ["sanandres", "san andres"] },

  // Otras islas del Caribe
  { city: "San Martín", country: "San Martín", countryCode: "SX", region: "Caribe", iata: "SXM", aliases: ["sanmartin", "saint martin", "sint maarten", "st martin", "st maarten"] },
  { city: "Barbados", country: "Barbados", countryCode: "BB", region: "Caribe", iata: "BGI", aliases: ["barbados", "bridgetown"] },
  { city: "Bahamas", country: "Bahamas", countryCode: "BS", region: "Caribe", iata: "NAS", aliases: ["bahamas", "nassau", "paradise island"] },
  { city: "Turks & Caicos", country: "Turks y Caicos", countryCode: "TC", region: "Caribe", iata: "PLS", aliases: ["turks", "caicos", "providenciales", "turksandcaicos"] },
  { city: "Islas Vírgenes", country: "Islas Vírgenes", countryCode: "VI", region: "Caribe", iata: "STT", aliases: ["islas virgenes", "st thomas", "virgin islands"] },
  { city: "Puerto Rico", country: "Puerto Rico", countryCode: "PR", region: "Caribe", iata: "SJU", aliases: ["puertorico", "san juan"] },
  { city: "Isla Margarita", country: "Venezuela", countryCode: "VE", region: "Caribe", iata: "PMV", aliases: ["margarita", "islamargarita", "porlamar"] },
  { city: "Trinidad y Tobago", country: "Trinidad y Tobago", countryCode: "TT", region: "Caribe", iata: "POS", aliases: ["trinidadytobago", "tobago", "port of spain"] },
  { city: "Guadalupe", country: "Guadalupe", countryCode: "GP", region: "Caribe", iata: "PTP", aliases: ["guadalupe", "guadeloupe"] },
  { city: "Martinica", country: "Martinica", countryCode: "MQ", region: "Caribe", iata: "FDF", aliases: ["martinica", "martinique", "fort de france"] },
  { city: "Santa Lucía", country: "Santa Lucía", countryCode: "LC", region: "Caribe", iata: "UVF", aliases: ["santalucia", "saint lucia", "st lucia"] },
  { city: "Antigua", country: "Antigua y Barbuda", countryCode: "AG", region: "Caribe", iata: "ANU", aliases: ["antigua", "barbuda", "antigua y barbuda"] },

  // ═══════════════════════════════════════════
  // BRASIL
  // ═══════════════════════════════════════════
  { city: "Río de Janeiro", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "GIG", aliases: ["rio", "riodejaneiro", "rio de janeiro", "galeao", "copacabana", "ipanema"] },
  { city: "São Paulo", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "GRU", aliases: ["saopaulo", "sao paulo", "guarulhos", "sampa"] },
  { city: "Florianópolis", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "FLN", aliases: ["florianopolis", "floripa"] },
  { city: "Búzios", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "GIG (Río de Janeiro)", aliases: ["buzios", "armacao dos buzios"] },
  { city: "Paraty", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "GIG (Río de Janeiro)", aliases: ["paraty", "parati"] },
  { city: "Ilha Grande", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "GIG (Río de Janeiro)", aliases: ["ilhagrande", "ilha grande"] },
  { city: "Salvador de Bahía", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "SSA", aliases: ["salvador", "bahia", "salvadordebahia"] },
  { city: "Maceió", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "MCZ", aliases: ["maceio"] },
  { city: "Recife", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "REC", aliases: ["recife", "porto de galinhas", "portodegalinhas"] },
  { city: "Porto de Galinhas", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "REC (Recife)", aliases: ["portodegalinhas", "porto de galinhas", "galinhas"] },
  { city: "Natal", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "NAT", aliases: ["natal", "pipa", "praia da pipa"] },
  { city: "Praia da Pipa", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "NAT (Natal)", aliases: ["pipa", "praiadapipa", "praia da pipa"] },
  { city: "Fortaleza", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "FOR", aliases: ["fortaleza", "jericoacoara"] },
  { city: "Jericoacoara", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "FOR (Fortaleza)", aliases: ["jericoacoara", "jeri"] },
  { city: "Foz do Iguaçu", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "IGU", aliases: ["fozdoiguazu", "foz do iguazu", "iguazu brasil", "cataratas brasil"] },
  { city: "Morro de São Paulo", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "SSA (Salvador)", aliases: ["morrodesaopaulo", "morro de sao paulo"] },
  { city: "Arraial do Cabo", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "GIG (Río de Janeiro)", aliases: ["arraialdocabo", "arraial do cabo", "arraial"] },
  { city: "Bombinhas", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "NVT (Navegantes)", aliases: ["bombinhas"] },
  { city: "Camboriú", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "NVT (Navegantes)", aliases: ["camboriu", "balneario camboriu"] },
  { city: "Gramado", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "POA (Porto Alegre)", aliases: ["gramado", "canela"] },
  { city: "Porto Alegre", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "POA", aliases: ["portoalegre", "porto alegre"] },
  { city: "Manaus", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "MAO", aliases: ["manaus", "amazonas"] },
  { city: "Fernando de Noronha", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "FEN", aliases: ["noronha", "fernandodenoronha", "fernando de noronha"] },
  { city: "Trancoso", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "BPS (Porto Seguro)", aliases: ["trancoso"] },
  { city: "Porto Seguro", country: "Brasil", countryCode: "BR", region: "Brasil", iata: "BPS", aliases: ["portoseguro", "porto seguro"] },
  { city: "Angra dos Reis", country: "Brasil", countryCode: "BR", region: "Brasil", nearestAirport: "GIG (Río de Janeiro)", aliases: ["angradosreis", "angra dos reis", "angra"] },

  // ═══════════════════════════════════════════
  // ESTADOS UNIDOS
  // ═══════════════════════════════════════════
  { city: "Miami", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "MIA", aliases: ["miami", "miami beach", "south beach", "fort lauderdale"] },
  { city: "Orlando", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "MCO", aliases: ["orlando", "disney", "disneyworld", "universal"] },
  { city: "Nueva York", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "JFK", aliases: ["newyork", "nueva york", "nyc", "manhattan", "ny"] },
  { city: "Las Vegas", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "LAS", aliases: ["lasvegas", "las vegas", "vegas"] },
  { city: "Los Ángeles", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "LAX", aliases: ["losangeles", "los angeles", "la", "hollywood"] },
  { city: "San Francisco", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "SFO", aliases: ["sanfrancisco", "san francisco", "sf"] },
  { city: "Washington D.C.", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "IAD", aliases: ["washington", "dc", "washingtondc"] },
  { city: "Chicago", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "ORD", aliases: ["chicago"] },
  { city: "Boston", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "BOS", aliases: ["boston"] },
  { city: "Honolulu", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "HNL", aliases: ["honolulu", "hawaii", "hawai", "waikiki"] },
  { city: "Key West", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "EYW", aliases: ["keywest", "key west", "cayos", "florida keys"] },
  { city: "Fort Lauderdale", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "FLL", aliases: ["fortlauderdale", "fort lauderdale"] },
  { city: "Atlanta", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "ATL", aliases: ["atlanta"] },
  { city: "Dallas", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "DFW", aliases: ["dallas"] },
  { city: "Houston", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "IAH", aliases: ["houston"] },
  { city: "Seattle", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "SEA", aliases: ["seattle"] },
  { city: "San Diego", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "SAN", aliases: ["sandiego", "san diego"] },
  { city: "Denver", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "DEN", aliases: ["denver"] },
  { city: "Nashville", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "BNA", aliases: ["nashville"] },
  { city: "New Orleans", country: "Estados Unidos", countryCode: "US", region: "Norteamérica", iata: "MSY", aliases: ["neworleans", "new orleans", "nueva orleans"] },

  // ═══════════════════════════════════════════
  // EUROPA
  // ═══════════════════════════════════════════

  // España
  { city: "Madrid", country: "España", countryCode: "ES", region: "Europa", iata: "MAD", aliases: ["madrid"] },
  { city: "Barcelona", country: "España", countryCode: "ES", region: "Europa", iata: "BCN", aliases: ["barcelona", "barna"] },
  { city: "Ibiza", country: "España", countryCode: "ES", region: "Europa", iata: "IBZ", aliases: ["ibiza", "eivissa"] },
  { city: "Mallorca", country: "España", countryCode: "ES", region: "Europa", iata: "PMI", aliases: ["mallorca", "palma", "palma de mallorca"] },
  { city: "Sevilla", country: "España", countryCode: "ES", region: "Europa", iata: "SVQ", aliases: ["sevilla", "seville"] },
  { city: "Málaga", country: "España", countryCode: "ES", region: "Europa", iata: "AGP", aliases: ["malaga", "marbella", "costa del sol"] },
  { city: "Valencia", country: "España", countryCode: "ES", region: "Europa", iata: "VLC", aliases: ["valencia"] },
  { city: "Tenerife", country: "España", countryCode: "ES", region: "Europa", iata: "TFS", aliases: ["tenerife", "canarias", "islas canarias"] },
  { city: "San Sebastián", country: "España", countryCode: "ES", region: "Europa", iata: "EAS", aliases: ["sansebastian", "san sebastian", "donostia"] },
  { city: "Granada", country: "España", countryCode: "ES", region: "Europa", iata: "GRX", aliases: ["granada", "alhambra"] },
  { city: "Bilbao", country: "España", countryCode: "ES", region: "Europa", iata: "BIO", aliases: ["bilbao"] },

  // Italia
  { city: "Roma", country: "Italia", countryCode: "IT", region: "Europa", iata: "FCO", aliases: ["roma", "rome", "fiumicino"] },
  { city: "Milán", country: "Italia", countryCode: "IT", region: "Europa", iata: "MXP", aliases: ["milan", "milano"] },
  { city: "Venecia", country: "Italia", countryCode: "IT", region: "Europa", iata: "VCE", aliases: ["venecia", "venezia", "venice"] },
  { city: "Florencia", country: "Italia", countryCode: "IT", region: "Europa", iata: "FLR", aliases: ["florencia", "firenze", "florence"] },
  { city: "Nápoles", country: "Italia", countryCode: "IT", region: "Europa", iata: "NAP", aliases: ["napoles", "napoli", "naples"] },
  { city: "Costa Amalfitana", country: "Italia", countryCode: "IT", region: "Europa", nearestAirport: "NAP (Nápoles)", aliases: ["amalfi", "costaamalfitana", "costa amalfitana", "positano", "ravello", "sorrento"] },
  { city: "Cinque Terre", country: "Italia", countryCode: "IT", region: "Europa", nearestAirport: "GOA (Génova) / PSA (Pisa)", aliases: ["cinqueterre", "cinque terre"] },
  { city: "Sicilia", country: "Italia", countryCode: "IT", region: "Europa", iata: "CTA", aliases: ["sicilia", "sicily", "catania", "palermo", "taormina"] },
  { city: "Cerdeña", country: "Italia", countryCode: "IT", region: "Europa", iata: "CAG", aliases: ["cerdena", "sardegna", "sardinia", "cagliari"] },
  { city: "Capri", country: "Italia", countryCode: "IT", region: "Europa", nearestAirport: "NAP (Nápoles)", aliases: ["capri"] },
  { city: "Turín", country: "Italia", countryCode: "IT", region: "Europa", iata: "TRN", aliases: ["turin", "torino"] },
  { city: "Como", country: "Italia", countryCode: "IT", region: "Europa", nearestAirport: "MXP (Milán)", aliases: ["como", "lago di como", "lago como", "bellagio"] },

  // Francia
  { city: "París", country: "Francia", countryCode: "FR", region: "Europa", iata: "CDG", aliases: ["paris", "charles de gaulle"] },
  { city: "Niza", country: "Francia", countryCode: "FR", region: "Europa", iata: "NCE", aliases: ["niza", "nice", "costa azul", "cote d'azur"] },
  { city: "Lyon", country: "Francia", countryCode: "FR", region: "Europa", iata: "LYS", aliases: ["lyon"] },
  { city: "Marsella", country: "Francia", countryCode: "FR", region: "Europa", iata: "MRS", aliases: ["marsella", "marseille", "marseilla"] },
  { city: "Burdeos", country: "Francia", countryCode: "FR", region: "Europa", iata: "BOD", aliases: ["burdeos", "bordeaux"] },
  { city: "Estrasburgo", country: "Francia", countryCode: "FR", region: "Europa", iata: "SXB", aliases: ["estrasburgo", "strasbourg"] },
  { city: "Mónaco", country: "Mónaco", countryCode: "MC", region: "Europa", nearestAirport: "NCE (Niza)", aliases: ["monaco", "montecarlo", "monte carlo"] },
  { city: "Cannes", country: "Francia", countryCode: "FR", region: "Europa", nearestAirport: "NCE (Niza)", aliases: ["cannes"] },
  { city: "Saint-Tropez", country: "Francia", countryCode: "FR", region: "Europa", nearestAirport: "NCE (Niza)", aliases: ["sainttropez", "saint tropez", "st tropez"] },

  // Reino Unido
  { city: "Londres", country: "Reino Unido", countryCode: "GB", region: "Europa", iata: "LHR", aliases: ["londres", "london", "heathrow"] },
  { city: "Edimburgo", country: "Reino Unido", countryCode: "GB", region: "Europa", iata: "EDI", aliases: ["edimburgo", "edinburgh"] },
  { city: "Liverpool", country: "Reino Unido", countryCode: "GB", region: "Europa", iata: "LPL", aliases: ["liverpool"] },
  { city: "Manchester", country: "Reino Unido", countryCode: "GB", region: "Europa", iata: "MAN", aliases: ["manchester"] },

  // Alemania
  { city: "Berlín", country: "Alemania", countryCode: "DE", region: "Europa", iata: "BER", aliases: ["berlin"] },
  { city: "Múnich", country: "Alemania", countryCode: "DE", region: "Europa", iata: "MUC", aliases: ["munich", "munchen", "münchen"] },
  { city: "Fráncfort", country: "Alemania", countryCode: "DE", region: "Europa", iata: "FRA", aliases: ["francfort", "frankfurt"] },
  { city: "Hamburgo", country: "Alemania", countryCode: "DE", region: "Europa", iata: "HAM", aliases: ["hamburgo", "hamburg"] },

  // Países Bajos
  { city: "Ámsterdam", country: "Países Bajos", countryCode: "NL", region: "Europa", iata: "AMS", aliases: ["amsterdam", "holanda"] },

  // Portugal
  { city: "Lisboa", country: "Portugal", countryCode: "PT", region: "Europa", iata: "LIS", aliases: ["lisboa", "lisbon"] },
  { city: "Oporto", country: "Portugal", countryCode: "PT", region: "Europa", iata: "OPO", aliases: ["oporto", "porto"] },
  { city: "Algarve", country: "Portugal", countryCode: "PT", region: "Europa", iata: "FAO", aliases: ["algarve", "faro"] },
  { city: "Madeira", country: "Portugal", countryCode: "PT", region: "Europa", iata: "FNC", aliases: ["madeira", "funchal"] },

  // Grecia
  { city: "Atenas", country: "Grecia", countryCode: "GR", region: "Europa", iata: "ATH", aliases: ["atenas", "athens", "acropolis"] },
  { city: "Santorini", country: "Grecia", countryCode: "GR", region: "Europa", iata: "JTR", aliases: ["santorini", "thira"] },
  { city: "Mykonos", country: "Grecia", countryCode: "GR", region: "Europa", iata: "JMK", aliases: ["mykonos", "mikonos"] },
  { city: "Creta", country: "Grecia", countryCode: "GR", region: "Europa", iata: "HER", aliases: ["creta", "crete", "heraklion"] },
  { city: "Rodas", country: "Grecia", countryCode: "GR", region: "Europa", iata: "RHO", aliases: ["rodas", "rhodes"] },
  { city: "Corfú", country: "Grecia", countryCode: "GR", region: "Europa", iata: "CFU", aliases: ["corfu", "kerkyra"] },
  { city: "Zante", country: "Grecia", countryCode: "GR", region: "Europa", iata: "ZTH", aliases: ["zante", "zakynthos"] },

  // Turquía
  { city: "Estambul", country: "Turquía", countryCode: "TR", region: "Europa", iata: "IST", aliases: ["estambul", "istanbul", "constantinopla"] },
  { city: "Capadocia", country: "Turquía", countryCode: "TR", region: "Europa", iata: "NAV", aliases: ["capadocia", "cappadocia", "goreme", "nevsehir"] },
  { city: "Antalya", country: "Turquía", countryCode: "TR", region: "Europa", iata: "AYT", aliases: ["antalya"] },
  { city: "Bodrum", country: "Turquía", countryCode: "TR", region: "Europa", iata: "BJV", aliases: ["bodrum"] },

  // Croacia
  { city: "Dubrovnik", country: "Croacia", countryCode: "HR", region: "Europa", iata: "DBV", aliases: ["dubrovnik"] },
  { city: "Split", country: "Croacia", countryCode: "HR", region: "Europa", iata: "SPU", aliases: ["split"] },
  { city: "Zagreb", country: "Croacia", countryCode: "HR", region: "Europa", iata: "ZAG", aliases: ["zagreb"] },
  { city: "Hvar", country: "Croacia", countryCode: "HR", region: "Europa", nearestAirport: "SPU (Split)", aliases: ["hvar"] },

  // Otros Europa
  { city: "Praga", country: "República Checa", countryCode: "CZ", region: "Europa", iata: "PRG", aliases: ["praga", "prague"] },
  { city: "Viena", country: "Austria", countryCode: "AT", region: "Europa", iata: "VIE", aliases: ["viena", "vienna", "wien"] },
  { city: "Budapest", country: "Hungría", countryCode: "HU", region: "Europa", iata: "BUD", aliases: ["budapest"] },
  { city: "Zúrich", country: "Suiza", countryCode: "CH", region: "Europa", iata: "ZRH", aliases: ["zurich", "zürich"] },
  { city: "Ginebra", country: "Suiza", countryCode: "CH", region: "Europa", iata: "GVA", aliases: ["ginebra", "geneva", "geneve"] },
  { city: "Interlaken", country: "Suiza", countryCode: "CH", region: "Europa", nearestAirport: "BRN (Berna)", aliases: ["interlaken", "jungfrau"] },
  { city: "Bruselas", country: "Bélgica", countryCode: "BE", region: "Europa", iata: "BRU", aliases: ["bruselas", "brussels", "bruxelles"] },
  { city: "Copenhague", country: "Dinamarca", countryCode: "DK", region: "Europa", iata: "CPH", aliases: ["copenhague", "copenhagen", "kobenhavn"] },
  { city: "Estocolmo", country: "Suecia", countryCode: "SE", region: "Europa", iata: "ARN", aliases: ["estocolmo", "stockholm"] },
  { city: "Oslo", country: "Noruega", countryCode: "NO", region: "Europa", iata: "OSL", aliases: ["oslo"] },
  { city: "Helsinki", country: "Finlandia", countryCode: "FI", region: "Europa", iata: "HEL", aliases: ["helsinki"] },
  { city: "Reikiavik", country: "Islandia", countryCode: "IS", region: "Europa", iata: "KEF", aliases: ["reikiavik", "reykjavik", "islandia", "iceland"] },
  { city: "Varsovia", country: "Polonia", countryCode: "PL", region: "Europa", iata: "WAW", aliases: ["varsovia", "warsaw", "warszawa"] },
  { city: "Cracovia", country: "Polonia", countryCode: "PL", region: "Europa", iata: "KRK", aliases: ["cracovia", "krakow"] },
  { city: "Moscú", country: "Rusia", countryCode: "RU", region: "Europa", iata: "SVO", aliases: ["moscu", "moscow", "moskva"] },
  { city: "San Petersburgo", country: "Rusia", countryCode: "RU", region: "Europa", iata: "LED", aliases: ["sanpetersburgo", "san petersburgo", "saint petersburg"] },
  { city: "Montecarlo", country: "Mónaco", countryCode: "MC", region: "Europa", nearestAirport: "NCE (Niza)", aliases: ["montecarlo", "monte carlo"] },
  { city: "Luxemburgo", country: "Luxemburgo", countryCode: "LU", region: "Europa", iata: "LUX", aliases: ["luxemburgo", "luxembourg"] },
  { city: "Dublín", country: "Irlanda", countryCode: "IE", region: "Europa", iata: "DUB", aliases: ["dublin", "irlanda"] },

  // ═══════════════════════════════════════════
  // ARGENTINA (doméstico)
  // ═══════════════════════════════════════════
  { city: "Buenos Aires", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "EZE", aliases: ["buenosaires", "buenos aires", "ezeiza", "bsas", "caba", "aeroparque"] },
  { city: "Bariloche", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "BRC", aliases: ["bariloche", "san carlos de bariloche", "sancarlosdebariloche"] },
  { city: "Mendoza", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "MDZ", aliases: ["mendoza"] },
  { city: "Ushuaia", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "USH", aliases: ["ushuaia", "tierra del fuego", "fin del mundo"] },
  { city: "El Calafate", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "FTE", aliases: ["calafate", "elcalafate", "el calafate", "glaciar perito moreno"] },
  { city: "Iguazú", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "IGR", aliases: ["iguazu", "cataratas", "puerto iguazu"] },
  { city: "Salta", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "SLA", aliases: ["salta", "la linda"] },
  { city: "Jujuy", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "JUJ", aliases: ["jujuy", "purmamarca", "humahuaca", "tilcara", "quebrada"] },
  { city: "Córdoba", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "COR", aliases: ["cordoba", "villa carlos paz", "carlos paz"] },
  { city: "Rosario", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "ROS", aliases: ["rosario"] },
  { city: "Mar del Plata", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "MDQ", aliases: ["mardelplata", "mar del plata", "mardel"] },
  { city: "Puerto Madryn", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "REL", aliases: ["madryn", "puertomadryn", "puerto madryn", "peninsula valdes"] },
  { city: "Trelew", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "REL", aliases: ["trelew"] },
  { city: "Villa La Angostura", country: "Argentina", countryCode: "AR", region: "Argentina", nearestAirport: "CPC (Chapelco) / BRC (Bariloche)", aliases: ["laangostura", "villa la angostura", "angostura"] },
  { city: "San Martín de los Andes", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "CPC", aliases: ["sanmartindelosandes", "san martin de los andes", "chapelco"] },
  { city: "El Chaltén", country: "Argentina", countryCode: "AR", region: "Argentina", nearestAirport: "FTE (El Calafate)", aliases: ["chalten", "elchalten", "el chalten", "fitz roy"] },
  { city: "Tucumán", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "TUC", aliases: ["tucuman", "san miguel de tucuman", "tafi del valle"] },
  { city: "Neuquén", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "NQN", aliases: ["neuquen"] },
  { city: "Río Gallegos", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "RGL", aliases: ["riogallegos", "rio gallegos"] },
  { city: "Comodoro Rivadavia", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "CRD", aliases: ["comodoro", "comodororivadavia"] },
  { city: "Resistencia", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "RES", aliases: ["resistencia", "chaco"] },
  { city: "Posadas", country: "Argentina", countryCode: "AR", region: "Argentina", iata: "PSS", aliases: ["posadas", "misiones"] },
  { city: "Pinamar", country: "Argentina", countryCode: "AR", region: "Argentina", nearestAirport: "MDQ (Mar del Plata)", aliases: ["pinamar", "carilo", "valeria del mar"] },
  { city: "Las Leñas", country: "Argentina", countryCode: "AR", region: "Argentina", nearestAirport: "MDZ (Mendoza)", aliases: ["laslenas", "las lenas", "malargue"] },

  // ═══════════════════════════════════════════
  // SUDAMÉRICA (otros)
  // ═══════════════════════════════════════════
  { city: "Santiago de Chile", country: "Chile", countryCode: "CL", region: "Sudamérica", iata: "SCL", aliases: ["santiago", "santiagodechile", "chile"] },
  { city: "Viña del Mar", country: "Chile", countryCode: "CL", region: "Sudamérica", nearestAirport: "SCL (Santiago)", aliases: ["vinadelmar", "vina del mar", "valparaiso"] },
  { city: "Torres del Paine", country: "Chile", countryCode: "CL", region: "Sudamérica", iata: "PUQ", aliases: ["torresdelpaine", "torres del paine", "punta arenas", "patagonia chilena"] },
  { city: "Isla de Pascua", country: "Chile", countryCode: "CL", region: "Sudamérica", iata: "IPC", aliases: ["isladepascua", "isla de pascua", "rapa nui", "easter island"] },
  { city: "Atacama", country: "Chile", countryCode: "CL", region: "Sudamérica", iata: "CJC", aliases: ["atacama", "san pedro de atacama", "desierto de atacama"] },
  { city: "Lima", country: "Perú", countryCode: "PE", region: "Sudamérica", iata: "LIM", aliases: ["lima"] },
  { city: "Cusco", country: "Perú", countryCode: "PE", region: "Sudamérica", iata: "CUZ", aliases: ["cusco", "cuzco", "machu picchu", "machupicchu"] },
  { city: "Bogotá", country: "Colombia", countryCode: "CO", region: "Sudamérica", iata: "BOG", aliases: ["bogota"] },
  { city: "Cartagena", country: "Colombia", countryCode: "CO", region: "Sudamérica", iata: "CTG", aliases: ["cartagena", "cartagena de indias"] },
  { city: "Medellín", country: "Colombia", countryCode: "CO", region: "Sudamérica", iata: "MDE", aliases: ["medellin"] },
  { city: "Santa Marta", country: "Colombia", countryCode: "CO", region: "Sudamérica", iata: "SMR", aliases: ["santamarta", "santa marta", "tayrona", "parque tayrona"] },
  { city: "Montevideo", country: "Uruguay", countryCode: "UY", region: "Sudamérica", iata: "MVD", aliases: ["montevideo"] },
  { city: "Punta del Este", country: "Uruguay", countryCode: "UY", region: "Sudamérica", iata: "PDP", aliases: ["puntadeleste", "punta del este", "jose ignacio"] },
  { city: "Colonia del Sacramento", country: "Uruguay", countryCode: "UY", region: "Sudamérica", nearestAirport: "MVD (Montevideo)", aliases: ["colonia", "coloniadelsacramento"] },
  { city: "Quito", country: "Ecuador", countryCode: "EC", region: "Sudamérica", iata: "UIO", aliases: ["quito"] },
  { city: "Galápagos", country: "Ecuador", countryCode: "EC", region: "Sudamérica", iata: "GPS", aliases: ["galapagos", "islas galapagos"] },
  { city: "Guayaquil", country: "Ecuador", countryCode: "EC", region: "Sudamérica", iata: "GYE", aliases: ["guayaquil"] },
  { city: "La Paz", country: "Bolivia", countryCode: "BO", region: "Sudamérica", iata: "LPB", aliases: ["lapaz", "la paz"] },
  { city: "Uyuni", country: "Bolivia", countryCode: "BO", region: "Sudamérica", iata: "UYU", aliases: ["uyuni", "salar de uyuni"] },
  { city: "Asunción", country: "Paraguay", countryCode: "PY", region: "Sudamérica", iata: "ASU", aliases: ["asuncion"] },

  // ═══════════════════════════════════════════
  // CENTRO AMÉRICA
  // ═══════════════════════════════════════════
  { city: "San José", country: "Costa Rica", countryCode: "CR", region: "Centro América", iata: "SJO", aliases: ["sanjose", "costa rica", "costarica"] },
  { city: "Panamá", country: "Panamá", countryCode: "PA", region: "Centro América", iata: "PTY", aliases: ["panama", "ciudad de panama"] },
  { city: "San Salvador", country: "El Salvador", countryCode: "SV", region: "Centro América", iata: "SAL", aliases: ["sansalvador", "el salvador"] },
  { city: "Guatemala", country: "Guatemala", countryCode: "GT", region: "Centro América", iata: "GUA", aliases: ["guatemala", "antigua guatemala"] },

  // ═══════════════════════════════════════════
  // ASIA
  // ═══════════════════════════════════════════
  { city: "Tokio", country: "Japón", countryCode: "JP", region: "Asia", iata: "NRT", aliases: ["tokio", "tokyo", "narita"] },
  { city: "Kioto", country: "Japón", countryCode: "JP", region: "Asia", nearestAirport: "KIX (Osaka)", aliases: ["kioto", "kyoto"] },
  { city: "Osaka", country: "Japón", countryCode: "JP", region: "Asia", iata: "KIX", aliases: ["osaka"] },
  { city: "Bangkok", country: "Tailandia", countryCode: "TH", region: "Asia", iata: "BKK", aliases: ["bangkok"] },
  { city: "Phuket", country: "Tailandia", countryCode: "TH", region: "Asia", iata: "HKT", aliases: ["phuket"] },
  { city: "Krabi", country: "Tailandia", countryCode: "TH", region: "Asia", iata: "KBV", aliases: ["krabi", "phi phi", "railay"] },
  { city: "Koh Samui", country: "Tailandia", countryCode: "TH", region: "Asia", iata: "USM", aliases: ["kohsamui", "koh samui", "samui"] },
  { city: "Chiang Mai", country: "Tailandia", countryCode: "TH", region: "Asia", iata: "CNX", aliases: ["chiangmai", "chiang mai"] },
  { city: "Bali", country: "Indonesia", countryCode: "ID", region: "Asia", iata: "DPS", aliases: ["bali", "denpasar", "ubud", "seminyak", "kuta"] },
  { city: "Singapur", country: "Singapur", countryCode: "SG", region: "Asia", iata: "SIN", aliases: ["singapur", "singapore"] },
  { city: "Hong Kong", country: "Hong Kong", countryCode: "HK", region: "Asia", iata: "HKG", aliases: ["hongkong", "hong kong"] },
  { city: "Shanghái", country: "China", countryCode: "CN", region: "Asia", iata: "PVG", aliases: ["shanghai"] },
  { city: "Pekín", country: "China", countryCode: "CN", region: "Asia", iata: "PEK", aliases: ["pekin", "beijing"] },
  { city: "Seúl", country: "Corea del Sur", countryCode: "KR", region: "Asia", iata: "ICN", aliases: ["seul", "seoul", "incheon"] },
  { city: "Hanoi", country: "Vietnam", countryCode: "VN", region: "Asia", iata: "HAN", aliases: ["hanoi"] },
  { city: "Ho Chi Minh", country: "Vietnam", countryCode: "VN", region: "Asia", iata: "SGN", aliases: ["hochiminh", "ho chi minh", "saigon"] },
  { city: "Siem Reap", country: "Camboya", countryCode: "KH", region: "Asia", iata: "REP", aliases: ["siemreap", "siem reap", "angkor wat", "angkor"] },
  { city: "Nueva Delhi", country: "India", countryCode: "IN", region: "Asia", iata: "DEL", aliases: ["nuevadelhi", "nueva delhi", "delhi", "new delhi"] },
  { city: "Bombay", country: "India", countryCode: "IN", region: "Asia", iata: "BOM", aliases: ["bombay", "mumbai"] },
  { city: "Goa", country: "India", countryCode: "IN", region: "Asia", iata: "GOI", aliases: ["goa"] },
  { city: "Maldivas", country: "Maldivas", countryCode: "MV", region: "Asia", iata: "MLE", aliases: ["maldivas", "maldives", "male"] },
  { city: "Sri Lanka", country: "Sri Lanka", countryCode: "LK", region: "Asia", iata: "CMB", aliases: ["srilanka", "sri lanka", "colombo"] },
  { city: "Dubái", country: "Emiratos Árabes", countryCode: "AE", region: "Medio Oriente", iata: "DXB", aliases: ["dubai", "dubái"] },
  { city: "Abu Dhabi", country: "Emiratos Árabes", countryCode: "AE", region: "Medio Oriente", iata: "AUH", aliases: ["abudhabi", "abu dhabi"] },
  { city: "Doha", country: "Qatar", countryCode: "QA", region: "Medio Oriente", iata: "DOH", aliases: ["doha", "qatar"] },
  { city: "Tel Aviv", country: "Israel", countryCode: "IL", region: "Medio Oriente", iata: "TLV", aliases: ["telaviv", "tel aviv", "israel", "jerusalen", "jerusalem"] },
  { city: "Marrakech", country: "Marruecos", countryCode: "MA", region: "África", iata: "RAK", aliases: ["marrakech", "marruecos", "morocco"] },

  // ═══════════════════════════════════════════
  // OCEANÍA
  // ═══════════════════════════════════════════
  { city: "Sídney", country: "Australia", countryCode: "AU", region: "Oceanía", iata: "SYD", aliases: ["sidney", "sydney"] },
  { city: "Melbourne", country: "Australia", countryCode: "AU", region: "Oceanía", iata: "MEL", aliases: ["melbourne"] },
  { city: "Auckland", country: "Nueva Zelanda", countryCode: "NZ", region: "Oceanía", iata: "AKL", aliases: ["auckland", "nueva zelanda", "new zealand"] },
  { city: "Queenstown", country: "Nueva Zelanda", countryCode: "NZ", region: "Oceanía", iata: "ZQN", aliases: ["queenstown"] },
  { city: "Tahití", country: "Polinesia Francesa", countryCode: "PF", region: "Oceanía", iata: "PPT", aliases: ["tahiti", "bora bora", "polinesia"] },
  { city: "Fiyi", country: "Fiyi", countryCode: "FJ", region: "Oceanía", iata: "NAN", aliases: ["fiyi", "fiji", "nadi"] },

  // ═══════════════════════════════════════════
  // ÁFRICA
  // ═══════════════════════════════════════════
  { city: "Ciudad del Cabo", country: "Sudáfrica", countryCode: "ZA", region: "África", iata: "CPT", aliases: ["ciudaddelcabo", "ciudad del cabo", "cape town", "capetown"] },
  { city: "Johannesburgo", country: "Sudáfrica", countryCode: "ZA", region: "África", iata: "JNB", aliases: ["johannesburgo", "johannesburg"] },
  { city: "Nairobi", country: "Kenia", countryCode: "KE", region: "África", iata: "NBO", aliases: ["nairobi", "kenia", "kenya", "safari"] },
  { city: "Zanzíbar", country: "Tanzania", countryCode: "TZ", region: "África", iata: "ZNZ", aliases: ["zanzibar"] },
  { city: "El Cairo", country: "Egipto", countryCode: "EG", region: "África", iata: "CAI", aliases: ["elcairo", "el cairo", "cairo", "egipto", "piramides"] },
  { city: "Mauricio", country: "Mauricio", countryCode: "MU", region: "África", iata: "MRU", aliases: ["mauricio", "mauritius"] },
  { city: "Seychelles", country: "Seychelles", countryCode: "SC", region: "África", iata: "SEZ", aliases: ["seychelles", "mahe"] },
]

// ═══════════════════════════════════════════
// Motor de búsqueda
// ═══════════════════════════════════════════

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
}

export interface DestinationSearchResult {
  value: string      // Lo que se guarda en el form (nombre de la ciudad)
  label: string      // Lo que se muestra como título
  subtitle: string   // Info extra (país, región, aeropuerto)
}

export function searchDestinations(query: string, limit = 15): DestinationSearchResult[] {
  if (!query || query.length < 2) return getPopularDestinations()

  const normalizedQuery = normalizeText(query)
  const queryWords = normalizedQuery.split(/\s+/)

  interface ScoredResult {
    destination: Destination
    score: number
  }

  const scored: ScoredResult[] = []

  for (const dest of DESTINATIONS) {
    let score = 0
    const normalizedCity = normalizeText(dest.city)
    const normalizedCountry = normalizeText(dest.country)
    const normalizedRegion = normalizeText(dest.region)
    const iataLower = dest.iata?.toLowerCase() || ""

    // Exact IATA match → highest priority
    if (iataLower && iataLower === normalizedQuery) {
      score = 1000
    }
    // City starts with query → very high
    else if (normalizedCity.startsWith(normalizedQuery)) {
      score = 500
    }
    // City contains query as a word
    else if (normalizedCity.includes(normalizedQuery)) {
      score = 300
    }
    // IATA starts with query
    else if (iataLower && iataLower.startsWith(normalizedQuery)) {
      score = 250
    }
    // Country matches
    else if (normalizedCountry.startsWith(normalizedQuery) || normalizedCountry.includes(normalizedQuery)) {
      score = 100
    }
    // Region matches
    else if (normalizedRegion.includes(normalizedQuery)) {
      score = 50
    }
    // Check aliases
    else {
      for (const alias of dest.aliases) {
        const normalizedAlias = normalizeText(alias)
        if (normalizedAlias.startsWith(normalizedQuery)) {
          score = Math.max(score, 400)
        } else if (normalizedAlias.includes(normalizedQuery)) {
          score = Math.max(score, 200)
        }
      }
    }

    // Multi-word boost: all query words present
    if (score === 0 && queryWords.length > 1) {
      const allText = `${normalizedCity} ${normalizedCountry} ${normalizedRegion} ${dest.aliases.map(normalizeText).join(" ")}`
      const allWordsMatch = queryWords.every(w => allText.includes(w))
      if (allWordsMatch) {
        score = 150
      }
    }

    if (score > 0) {
      scored.push({ destination: dest, score })
    }
  }

  // Sort by score desc, then alphabetically
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.destination.city.localeCompare(b.destination.city)
  })

  return scored.slice(0, limit).map(({ destination }) => formatResult(destination))
}

function formatResult(dest: Destination): DestinationSearchResult {
  const airportInfo = dest.iata
    ? `✈ ${dest.iata}`
    : dest.nearestAirport
      ? `✈ Cercano: ${dest.nearestAirport}`
      : ""

  const subtitle = [
    dest.country,
    dest.region !== dest.country ? dest.region : "",
    airportInfo,
  ].filter(Boolean).join(" · ")

  return {
    value: dest.city,
    label: dest.city,
    subtitle,
  }
}

function getPopularDestinations(): DestinationSearchResult[] {
  const popularCities = [
    "Punta Cana", "Cancún", "Miami", "Orlando", "Río de Janeiro",
    "Bariloche", "Iguazú", "Roma", "París", "Madrid",
    "Cartagena", "Aruba", "Bayahibe", "Salvador de Bahía", "Ushuaia",
  ]

  return DESTINATIONS
    .filter(d => popularCities.includes(d.city))
    .map(formatResult)
}
