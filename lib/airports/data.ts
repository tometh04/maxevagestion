/**
 * Dataset estático de aeropuertos y ciudades.
 * Cubre los destinos más usados por agencias de viaje latinoamericanas.
 * No requiere API externa — búsqueda local e instantánea.
 */

export interface Airport {
  code: string   // Código IATA
  name: string   // Nombre del aeropuerto
  city: string   // Ciudad
  country: string
}

export const AIRPORTS: Airport[] = [
  // ── ARGENTINA ──────────────────────────────────────────────────────────
  { code: "EZE", name: "Aeropuerto Internacional Ministro Pistarini", city: "Buenos Aires", country: "Argentina" },
  { code: "AEP", name: "Aeroparque Jorge Newbery", city: "Buenos Aires", country: "Argentina" },
  { code: "COR", name: "Aeropuerto Internacional Ing. Aeronáutico Ambrosio Taravella", city: "Córdoba", country: "Argentina" },
  { code: "MDZ", name: "Aeropuerto Internacional El Plumerillo", city: "Mendoza", country: "Argentina" },
  { code: "BRC", name: "Aeropuerto Internacional Teniente Luis Candelaria", city: "Bariloche", country: "Argentina" },
  { code: "IGR", name: "Aeropuerto Internacional Cataratas del Iguazú", city: "Iguazú", country: "Argentina" },
  { code: "USH", name: "Aeropuerto Internacional Malvinas Argentinas", city: "Ushuaia", country: "Argentina" },
  { code: "FTE", name: "Aeropuerto Internacional El Calafate", city: "El Calafate", country: "Argentina" },
  { code: "TUC", name: "Aeropuerto Internacional Benjamín Matienzo", city: "Tucumán", country: "Argentina" },
  { code: "SLA", name: "Aeropuerto Internacional Martín Miguel de Güemes", city: "Salta", country: "Argentina" },
  { code: "ROS", name: "Aeropuerto Internacional Islas Malvinas", city: "Rosario", country: "Argentina" },
  { code: "NQN", name: "Aeropuerto Internacional Presidente Perón", city: "Neuquén", country: "Argentina" },
  { code: "REL", name: "Aeropuerto Internacional Almirante Marcos Zar", city: "Trelew", country: "Argentina" },
  { code: "PMY", name: "Aeropuerto El Tehuelche", city: "Puerto Madryn", country: "Argentina" },
  { code: "IRJ", name: "Aeropuerto Capitán Vicente Almandos Almonacid", city: "La Rioja", country: "Argentina" },
  { code: "CRD", name: "Aeropuerto Internacional General Enrique Mosconi", city: "Comodoro Rivadavia", country: "Argentina" },
  { code: "VDM", name: "Aeropuerto Gobernador Castello", city: "Viedma", country: "Argentina" },
  { code: "RSA", name: "Aeropuerto Santa Rosa", city: "Santa Rosa", country: "Argentina" },
  { code: "JUJ", name: "Aeropuerto Internacional Gobernador Horacio Guzmán", city: "Jujuy", country: "Argentina" },

  // ── REPÚBLICA DOMINICANA ──────────────────────────────────────────────
  { code: "PUJ", name: "Aeropuerto Internacional de Punta Cana", city: "Punta Cana", country: "República Dominicana" },
  { code: "SDQ", name: "Aeropuerto Internacional Las Américas", city: "Santo Domingo", country: "República Dominicana" },
  { code: "STI", name: "Aeropuerto Internacional del Cibao", city: "Santiago", country: "República Dominicana" },
  { code: "LRM", name: "Aeropuerto Internacional La Romana", city: "La Romana", country: "República Dominicana" },
  { code: "AZS", name: "Aeropuerto Internacional El Catey", city: "Samaná", country: "República Dominicana" },
  { code: "BRX", name: "Aeropuerto Internacional María Montez", city: "Barahona", country: "República Dominicana" },

  // ── MÉXICO ────────────────────────────────────────────────────────────
  { code: "CUN", name: "Aeropuerto Internacional de Cancún", city: "Cancún", country: "México" },
  { code: "MEX", name: "Aeropuerto Internacional Benito Juárez", city: "Ciudad de México", country: "México" },
  { code: "GDL", name: "Aeropuerto Internacional Miguel Hidalgo y Costilla", city: "Guadalajara", country: "México" },
  { code: "MTY", name: "Aeropuerto Internacional Mariano Escobedo", city: "Monterrey", country: "México" },
  { code: "SJD", name: "Aeropuerto Internacional de Los Cabos", city: "Los Cabos", country: "México" },
  { code: "PVR", name: "Aeropuerto Internacional Licenciado Gustavo Díaz Ordaz", city: "Puerto Vallarta", country: "México" },
  { code: "ZIH", name: "Aeropuerto Internacional de Ixtapa-Zihuatanejo", city: "Ixtapa", country: "México" },
  { code: "MZT", name: "Aeropuerto Internacional General Rafael Buelna", city: "Mazatlán", country: "México" },
  { code: "HUX", name: "Aeropuerto Internacional de Huatulco", city: "Huatulco", country: "México" },
  { code: "OAX", name: "Aeropuerto Internacional Xoxocotlán", city: "Oaxaca", country: "México" },
  { code: "MID", name: "Aeropuerto Internacional Manuel Crescencio Rejón", city: "Mérida", country: "México" },
  { code: "TRC", name: "Aeropuerto Internacional Francisco Sarabia", city: "Torreón", country: "México" },
  { code: "TAM", name: "Aeropuerto Internacional General Francisco Javier Mina", city: "Tampico", country: "México" },

  // ── CUBA ──────────────────────────────────────────────────────────────
  { code: "HAV", name: "Aeropuerto Internacional José Martí", city: "La Habana", country: "Cuba" },
  { code: "VRA", name: "Aeropuerto Internacional Juan Gualberto Gómez", city: "Varadero", country: "Cuba" },
  { code: "SCU", name: "Aeropuerto Internacional Antonio Maceo", city: "Santiago de Cuba", country: "Cuba" },
  { code: "HOG", name: "Aeropuerto Internacional Frank País", city: "Holguín", country: "Cuba" },
  { code: "SNU", name: "Aeropuerto Internacional Abel Santamaría", city: "Santa Clara", country: "Cuba" },

  // ── CARIBE ────────────────────────────────────────────────────────────
  { code: "MBJ", name: "Aeropuerto Internacional Sangster", city: "Montego Bay", country: "Jamaica" },
  { code: "KIN", name: "Aeropuerto Internacional Norman Manley", city: "Kingston", country: "Jamaica" },
  { code: "NAS", name: "Aeropuerto Internacional Lynden Pindling", city: "Nassau", country: "Bahamas" },
  { code: "SXM", name: "Aeropuerto Internacional Princess Juliana", city: "Sint Maarten", country: "Sint Maarten" },
  { code: "PTP", name: "Aeropuerto Internacional Pole Caraïbes", city: "Pointe-à-Pitre", country: "Guadalupe" },
  { code: "BGI", name: "Aeropuerto Internacional Grantley Adams", city: "Bridgetown", country: "Barbados" },
  { code: "UVF", name: "Aeropuerto Internacional Hewanorra", city: "Santa Lucía", country: "Santa Lucía" },
  { code: "ANU", name: "Aeropuerto Internacional V.C. Bird", city: "St. John's", country: "Antigua y Barbuda" },
  { code: "AUA", name: "Aeropuerto Internacional Reina Beatrix", city: "Oranjestad", country: "Aruba" },
  { code: "CUR", name: "Aeropuerto Internacional Hato", city: "Willemstad", country: "Curazao" },
  { code: "TAB", name: "Aeropuerto Crown Point", city: "Tobago", country: "Trinidad y Tobago" },
  { code: "POS", name: "Aeropuerto Internacional Piarco", city: "Port of Spain", country: "Trinidad y Tobago" },
  { code: "SKB", name: "Aeropuerto Internacional Robert Llewellyn Bradshaw", city: "Basseterre", country: "San Cristóbal y Nieves" },
  { code: "GND", name: "Aeropuerto Internacional Maurice Bishop", city: "St. George's", country: "Granada" },
  { code: "STT", name: "Aeropuerto Internacional Cyril E. King", city: "Charlotte Amalie", country: "Islas Vírgenes (EE.UU.)" },
  { code: "SJU", name: "Aeropuerto Internacional Luis Muñoz Marín", city: "San Juan", country: "Puerto Rico" },

  // ── CENTROAMÉRICA Y PANAMÁ ────────────────────────────────────────────
  { code: "PTY", name: "Aeropuerto Internacional de Tocumen", city: "Ciudad de Panamá", country: "Panamá" },
  { code: "SJO", name: "Aeropuerto Internacional Juan Santamaría", city: "San José", country: "Costa Rica" },
  { code: "LIR", name: "Aeropuerto Internacional Daniel Oduber Quirós", city: "Liberia", country: "Costa Rica" },
  { code: "GUA", name: "Aeropuerto Internacional La Aurora", city: "Ciudad de Guatemala", country: "Guatemala" },
  { code: "SAL", name: "Aeropuerto Internacional Monseñor Óscar Arnulfo Romero", city: "San Salvador", country: "El Salvador" },
  { code: "MGA", name: "Aeropuerto Internacional Augusto C. Sandino", city: "Managua", country: "Nicaragua" },
  { code: "TGU", name: "Aeropuerto Internacional Toncontín", city: "Tegucigalpa", country: "Honduras" },
  { code: "BZE", name: "Aeropuerto Internacional Philip S. W. Goldson", city: "Belice", country: "Belice" },
  { code: "RTB", name: "Aeropuerto Nacional Roatán", city: "Roatán", country: "Honduras" },

  // ── COLOMBIA ──────────────────────────────────────────────────────────
  { code: "BOG", name: "Aeropuerto Internacional El Dorado", city: "Bogotá", country: "Colombia" },
  { code: "MDE", name: "Aeropuerto Internacional José María Córdova", city: "Medellín", country: "Colombia" },
  { code: "CTG", name: "Aeropuerto Internacional Rafael Núñez", city: "Cartagena", country: "Colombia" },
  { code: "CLO", name: "Aeropuerto Internacional Alfonso Bonilla Aragón", city: "Cali", country: "Colombia" },
  { code: "SMR", name: "Aeropuerto Internacional Simón Bolívar", city: "Santa Marta", country: "Colombia" },
  { code: "BAQ", name: "Aeropuerto Internacional Ernesto Cortissoz", city: "Barranquilla", country: "Colombia" },

  // ── PERÚ ──────────────────────────────────────────────────────────────
  { code: "LIM", name: "Aeropuerto Internacional Jorge Chávez", city: "Lima", country: "Perú" },
  { code: "CUZ", name: "Aeropuerto Internacional Alejandro Velasco Astete", city: "Cusco", country: "Perú" },
  { code: "AQP", name: "Aeropuerto Internacional Rodríguez Ballón", city: "Arequipa", country: "Perú" },

  // ── CHILE ─────────────────────────────────────────────────────────────
  { code: "SCL", name: "Aeropuerto Internacional Arturo Merino Benítez", city: "Santiago de Chile", country: "Chile" },
  { code: "PMC", name: "Aeropuerto El Tepual", city: "Puerto Montt", country: "Chile" },
  { code: "IQQ", name: "Aeropuerto Diego Aracena", city: "Iquique", country: "Chile" },
  { code: "CCP", name: "Aeropuerto Internacional Carriel Sur", city: "Concepción", country: "Chile" },
  { code: "PUQ", name: "Aeropuerto Internacional Carlos Ibáñez del Campo", city: "Punta Arenas", country: "Chile" },

  // ── BRASIL ────────────────────────────────────────────────────────────
  { code: "GRU", name: "Aeropuerto Internacional de Guarulhos", city: "São Paulo", country: "Brasil" },
  { code: "GIG", name: "Aeropuerto Internacional Tom Jobim", city: "Río de Janeiro", country: "Brasil" },
  { code: "SDU", name: "Aeropuerto Santos Dumont", city: "Río de Janeiro", country: "Brasil" },
  { code: "SSA", name: "Aeropuerto Internacional Deputado Luís Eduardo Magalhães", city: "Salvador", country: "Brasil" },
  { code: "FOR", name: "Aeropuerto Internacional Pinto Martins", city: "Fortaleza", country: "Brasil" },
  { code: "REC", name: "Aeropuerto Internacional dos Guararapes", city: "Recife", country: "Brasil" },
  { code: "BSB", name: "Aeropuerto Internacional de Brasilia", city: "Brasilia", country: "Brasil" },
  { code: "POA", name: "Aeropuerto Internacional Salgado Filho", city: "Porto Alegre", country: "Brasil" },
  { code: "CWB", name: "Aeropuerto Internacional Afonso Pena", city: "Curitiba", country: "Brasil" },
  { code: "FLN", name: "Aeropuerto Internacional Hercílio Luz", city: "Florianópolis", country: "Brasil" },
  { code: "NAT", name: "Aeropuerto Internacional Governador Aluízio Alves", city: "Natal", country: "Brasil" },
  { code: "MCZ", name: "Aeropuerto Internacional Zumbi dos Palmares", city: "Maceió", country: "Brasil" },
  { code: "MAO", name: "Aeropuerto Internacional Eduardo Gomes", city: "Manaos", country: "Brasil" },
  { code: "BEL", name: "Aeropuerto Internacional Val de Cans", city: "Belém", country: "Brasil" },
  { code: "IGU", name: "Aeropuerto Internacional de Foz do Iguaçu", city: "Foz do Iguaçu", country: "Brasil" },

  // ── URUGUAY ───────────────────────────────────────────────────────────
  { code: "MVD", name: "Aeropuerto Internacional de Carrasco", city: "Montevideo", country: "Uruguay" },
  { code: "PDP", name: "Aeropuerto de Punta del Este / Capitán Corbeta Carlos A. Curbelo", city: "Punta del Este", country: "Uruguay" },

  // ── ECUADOR ───────────────────────────────────────────────────────────
  { code: "GYE", name: "Aeropuerto Internacional José Joaquín de Olmedo", city: "Guayaquil", country: "Ecuador" },
  { code: "UIO", name: "Aeropuerto Internacional Mariscal Sucre", city: "Quito", country: "Ecuador" },
  { code: "GPS", name: "Aeropuerto Seymour Baltra", city: "Galápagos", country: "Ecuador" },

  // ── VENEZUELA ─────────────────────────────────────────────────────────
  { code: "CCS", name: "Aeropuerto Internacional Simón Bolívar", city: "Caracas", country: "Venezuela" },

  // ── BOLIVIA ───────────────────────────────────────────────────────────
  { code: "VVI", name: "Aeropuerto Internacional Viru-Viru", city: "Santa Cruz", country: "Bolivia" },
  { code: "LPB", name: "Aeropuerto Internacional El Alto", city: "La Paz", country: "Bolivia" },
  { code: "CBB", name: "Aeropuerto Internacional Jorge Wilstermann", city: "Cochabamba", country: "Bolivia" },

  // ── PARAGUAY ──────────────────────────────────────────────────────────
  { code: "ASU", name: "Aeropuerto Internacional Silvio Pettirossi", city: "Asunción", country: "Paraguay" },

  // ── ESTADOS UNIDOS ────────────────────────────────────────────────────
  { code: "MIA", name: "Aeropuerto Internacional de Miami", city: "Miami", country: "Estados Unidos" },
  { code: "MCO", name: "Aeropuerto Internacional Orlando", city: "Orlando", country: "Estados Unidos" },
  { code: "FLL", name: "Aeropuerto Internacional Fort Lauderdale-Hollywood", city: "Fort Lauderdale", country: "Estados Unidos" },
  { code: "JFK", name: "Aeropuerto Internacional John F. Kennedy", city: "Nueva York", country: "Estados Unidos" },
  { code: "EWR", name: "Aeropuerto Internacional Newark Liberty", city: "Nueva York", country: "Estados Unidos" },
  { code: "LGA", name: "Aeropuerto LaGuardia", city: "Nueva York", country: "Estados Unidos" },
  { code: "LAX", name: "Aeropuerto Internacional de Los Ángeles", city: "Los Ángeles", country: "Estados Unidos" },
  { code: "ORD", name: "Aeropuerto Internacional O'Hare", city: "Chicago", country: "Estados Unidos" },
  { code: "MDW", name: "Aeropuerto Midway de Chicago", city: "Chicago", country: "Estados Unidos" },
  { code: "DFW", name: "Aeropuerto Internacional Dallas/Fort Worth", city: "Dallas", country: "Estados Unidos" },
  { code: "ATL", name: "Aeropuerto Internacional Hartsfield-Jackson", city: "Atlanta", country: "Estados Unidos" },
  { code: "SFO", name: "Aeropuerto Internacional de San Francisco", city: "San Francisco", country: "Estados Unidos" },
  { code: "LAS", name: "Aeropuerto Internacional Harry Reid", city: "Las Vegas", country: "Estados Unidos" },
  { code: "IAH", name: "Aeropuerto Internacional George Bush", city: "Houston", country: "Estados Unidos" },
  { code: "BOS", name: "Aeropuerto Internacional Logan", city: "Boston", country: "Estados Unidos" },
  { code: "SEA", name: "Aeropuerto Internacional Seattle-Tacoma", city: "Seattle", country: "Estados Unidos" },
  { code: "DEN", name: "Aeropuerto Internacional de Denver", city: "Denver", country: "Estados Unidos" },
  { code: "PHX", name: "Aeropuerto Internacional Sky Harbor", city: "Phoenix", country: "Estados Unidos" },
  { code: "TPA", name: "Aeropuerto Internacional de Tampa", city: "Tampa", country: "Estados Unidos" },
  { code: "SAN", name: "Aeropuerto Internacional de San Diego", city: "San Diego", country: "Estados Unidos" },
  { code: "MSP", name: "Aeropuerto Internacional Minneapolis-St. Paul", city: "Minneapolis", country: "Estados Unidos" },
  { code: "DTW", name: "Aeropuerto Internacional Detroit Metropolitan Wayne County", city: "Detroit", country: "Estados Unidos" },
  { code: "PHL", name: "Aeropuerto Internacional de Filadelfia", city: "Filadelfia", country: "Estados Unidos" },
  { code: "CLT", name: "Aeropuerto Internacional de Charlotte", city: "Charlotte", country: "Estados Unidos" },
  { code: "IAD", name: "Aeropuerto Internacional Washington Dulles", city: "Washington D.C.", country: "Estados Unidos" },
  { code: "DCA", name: "Aeropuerto Nacional Reagan", city: "Washington D.C.", country: "Estados Unidos" },
  { code: "BWI", name: "Aeropuerto Internacional de Baltimore", city: "Baltimore", country: "Estados Unidos" },
  { code: "MSY", name: "Aeropuerto Internacional Louis Armstrong", city: "Nueva Orleans", country: "Estados Unidos" },
  { code: "AUS", name: "Aeropuerto Internacional de Austin-Bergstrom", city: "Austin", country: "Estados Unidos" },
  { code: "BNA", name: "Aeropuerto Internacional Nashville", city: "Nashville", country: "Estados Unidos" },
  { code: "SLC", name: "Aeropuerto Internacional de Salt Lake City", city: "Salt Lake City", country: "Estados Unidos" },
  { code: "HNL", name: "Aeropuerto Internacional Daniel K. Inouye", city: "Honolulú", country: "Estados Unidos" },
  { code: "ANC", name: "Aeropuerto Internacional Ted Stevens", city: "Anchorage", country: "Estados Unidos" },

  // ── CANADÁ ────────────────────────────────────────────────────────────
  { code: "YYZ", name: "Aeropuerto Internacional Toronto Pearson", city: "Toronto", country: "Canadá" },
  { code: "YVR", name: "Aeropuerto Internacional de Vancouver", city: "Vancouver", country: "Canadá" },
  { code: "YUL", name: "Aeropuerto Internacional Pierre Elliott Trudeau", city: "Montreal", country: "Canadá" },
  { code: "YYC", name: "Aeropuerto Internacional de Calgary", city: "Calgary", country: "Canadá" },
  { code: "YOW", name: "Aeropuerto Internacional de Ottawa", city: "Ottawa", country: "Canadá" },
  { code: "YEG", name: "Aeropuerto Internacional de Edmonton", city: "Edmonton", country: "Canadá" },

  // ── ESPAÑA ────────────────────────────────────────────────────────────
  { code: "MAD", name: "Aeropuerto Adolfo Suárez Madrid-Barajas", city: "Madrid", country: "España" },
  { code: "BCN", name: "Aeropuerto de Barcelona-El Prat", city: "Barcelona", country: "España" },
  { code: "PMI", name: "Aeropuerto de Palma de Mallorca", city: "Palma de Mallorca", country: "España" },
  { code: "AGP", name: "Aeropuerto de Málaga-Costa del Sol", city: "Málaga", country: "España" },
  { code: "ALC", name: "Aeropuerto de Alicante-Elche", city: "Alicante", country: "España" },
  { code: "VLC", name: "Aeropuerto de Valencia", city: "Valencia", country: "España" },
  { code: "SVQ", name: "Aeropuerto de Sevilla", city: "Sevilla", country: "España" },
  { code: "IBZ", name: "Aeropuerto de Ibiza", city: "Ibiza", country: "España" },
  { code: "TFS", name: "Aeropuerto Tenerife Sur", city: "Tenerife", country: "España" },
  { code: "TFN", name: "Aeropuerto Tenerife Norte", city: "Tenerife", country: "España" },
  { code: "LPA", name: "Aeropuerto de Gran Canaria", city: "Las Palmas de Gran Canaria", country: "España" },
  { code: "ACE", name: "Aeropuerto César Manrique de Lanzarote", city: "Lanzarote", country: "España" },
  { code: "FUE", name: "Aeropuerto de Fuerteventura", city: "Fuerteventura", country: "España" },

  // ── PORTUGAL ──────────────────────────────────────────────────────────
  { code: "LIS", name: "Aeropuerto de Lisboa Humberto Delgado", city: "Lisboa", country: "Portugal" },
  { code: "OPO", name: "Aeropuerto Francisco Sá Carneiro", city: "Porto", country: "Portugal" },
  { code: "FAO", name: "Aeropuerto Internacional de Faro", city: "Faro", country: "Portugal" },

  // ── ITALIA ────────────────────────────────────────────────────────────
  { code: "FCO", name: "Aeropuerto Internacional Leonardo da Vinci", city: "Roma", country: "Italia" },
  { code: "MXP", name: "Aeropuerto Internacional de Milán-Malpensa", city: "Milán", country: "Italia" },
  { code: "LIN", name: "Aeropuerto de Milán Linate", city: "Milán", country: "Italia" },
  { code: "VCE", name: "Aeropuerto de Venecia Marco Polo", city: "Venecia", country: "Italia" },
  { code: "NAP", name: "Aeropuerto de Nápoles", city: "Nápoles", country: "Italia" },
  { code: "FLR", name: "Aeropuerto de Florencia", city: "Florencia", country: "Italia" },
  { code: "BGY", name: "Aeropuerto de Bérgamo", city: "Bérgamo", country: "Italia" },
  { code: "BRI", name: "Aeropuerto de Bari", city: "Bari", country: "Italia" },
  { code: "CTA", name: "Aeropuerto de Catania-Fontanarossa", city: "Catania", country: "Italia" },
  { code: "PMO", name: "Aeropuerto de Palermo", city: "Palermo", country: "Italia" },

  // ── FRANCIA ───────────────────────────────────────────────────────────
  { code: "CDG", name: "Aeropuerto Charles de Gaulle", city: "París", country: "Francia" },
  { code: "ORY", name: "Aeropuerto de París-Orly", city: "París", country: "Francia" },
  { code: "NCE", name: "Aeropuerto de Niza Côte d'Azur", city: "Niza", country: "Francia" },
  { code: "MRS", name: "Aeropuerto de Marsella Provenza", city: "Marsella", country: "Francia" },
  { code: "LYS", name: "Aeropuerto de Lyon Saint-Exupéry", city: "Lyon", country: "Francia" },

  // ── REINO UNIDO ───────────────────────────────────────────────────────
  { code: "LHR", name: "Aeropuerto de Heathrow", city: "Londres", country: "Reino Unido" },
  { code: "LGW", name: "Aeropuerto de Gatwick", city: "Londres", country: "Reino Unido" },
  { code: "STN", name: "Aeropuerto de Stansted", city: "Londres", country: "Reino Unido" },
  { code: "MAN", name: "Aeropuerto de Manchester", city: "Manchester", country: "Reino Unido" },
  { code: "EDI", name: "Aeropuerto de Edimburgo", city: "Edimburgo", country: "Reino Unido" },

  // ── ALEMANIA ──────────────────────────────────────────────────────────
  { code: "FRA", name: "Aeropuerto de Fráncfort", city: "Fráncfort", country: "Alemania" },
  { code: "MUC", name: "Aeropuerto Internacional de Múnich", city: "Múnich", country: "Alemania" },
  { code: "BER", name: "Aeropuerto Internacional Berlín Brandeburgo", city: "Berlín", country: "Alemania" },
  { code: "DUS", name: "Aeropuerto de Düsseldorf", city: "Düsseldorf", country: "Alemania" },
  { code: "HAM", name: "Aeropuerto de Hamburgo", city: "Hamburgo", country: "Alemania" },

  // ── PAÍSES BAJOS / BÉLGICA / SUIZA / AUSTRIA ─────────────────────────
  { code: "AMS", name: "Aeropuerto de Ámsterdam-Schiphol", city: "Ámsterdam", country: "Países Bajos" },
  { code: "BRU", name: "Aeropuerto de Bruselas", city: "Bruselas", country: "Bélgica" },
  { code: "ZRH", name: "Aeropuerto de Zúrich", city: "Zúrich", country: "Suiza" },
  { code: "GVA", name: "Aeropuerto de Ginebra", city: "Ginebra", country: "Suiza" },
  { code: "VIE", name: "Aeropuerto de Viena", city: "Viena", country: "Austria" },

  // ── EUROPA DEL ESTE / NORTE ───────────────────────────────────────────
  { code: "PRG", name: "Aeropuerto Václav Havel de Praga", city: "Praga", country: "República Checa" },
  { code: "WAW", name: "Aeropuerto Chopin de Varsovia", city: "Varsovia", country: "Polonia" },
  { code: "BUD", name: "Aeropuerto Internacional de Budapest", city: "Budapest", country: "Hungría" },
  { code: "ATH", name: "Aeropuerto Internacional Eleftherios Venizelos", city: "Atenas", country: "Grecia" },
  { code: "IST", name: "Aeropuerto de Estambul", city: "Estambul", country: "Turquía" },
  { code: "SAW", name: "Aeropuerto de Sabiha Gökçen", city: "Estambul", country: "Turquía" },
  { code: "DUB", name: "Aeropuerto de Dublín", city: "Dublín", country: "Irlanda" },
  { code: "CPH", name: "Aeropuerto de Copenhague", city: "Copenhague", country: "Dinamarca" },
  { code: "ARN", name: "Aeropuerto de Estocolmo-Arlanda", city: "Estocolmo", country: "Suecia" },
  { code: "OSL", name: "Aeropuerto de Oslo", city: "Oslo", country: "Noruega" },
  { code: "HEL", name: "Aeropuerto de Helsinki-Vantaa", city: "Helsinki", country: "Finlandia" },
  { code: "LIS", name: "Aeropuerto Humberto Delgado", city: "Lisboa", country: "Portugal" },
  { code: "OTP", name: "Aeropuerto Internacional Henri Coandă", city: "Bucarest", country: "Rumanía" },
  { code: "SOF", name: "Aeropuerto de Sofía", city: "Sofía", country: "Bulgaria" },
  { code: "BEG", name: "Aeropuerto de Belgrado Nikola Tesla", city: "Belgrado", country: "Serbia" },
  { code: "ZAG", name: "Aeropuerto de Zagreb", city: "Zagreb", country: "Croacia" },
  { code: "SPU", name: "Aeropuerto de Split", city: "Split", country: "Croacia" },
  { code: "DBV", name: "Aeropuerto de Dubrovnik", city: "Dubrovnik", country: "Croacia" },

  // ── ORIENTE MEDIO ─────────────────────────────────────────────────────
  { code: "DXB", name: "Aeropuerto Internacional de Dubái", city: "Dubái", country: "Emiratos Árabes Unidos" },
  { code: "AUH", name: "Aeropuerto Internacional de Abu Dabi", city: "Abu Dabi", country: "Emiratos Árabes Unidos" },
  { code: "DOH", name: "Aeropuerto Internacional Hamad", city: "Doha", country: "Catar" },
  { code: "TLV", name: "Aeropuerto Internacional Ben Gurión", city: "Tel Aviv", country: "Israel" },
  { code: "AMM", name: "Aeropuerto Internacional Queen Alia", city: "Ammán", country: "Jordania" },

  // ── EGIPTO Y ÁFRICA ───────────────────────────────────────────────────
  { code: "CAI", name: "Aeropuerto Internacional de El Cairo", city: "El Cairo", country: "Egipto" },
  { code: "HRG", name: "Aeropuerto Internacional de Hurghada", city: "Hurghada", country: "Egipto" },
  { code: "SSH", name: "Aeropuerto Internacional de Sharm el-Sheij", city: "Sharm el-Sheij", country: "Egipto" },
  { code: "LXR", name: "Aeropuerto de Luxor", city: "Luxor", country: "Egipto" },
  { code: "ASW", name: "Aeropuerto de Asuán", city: "Asuán", country: "Egipto" },
  { code: "JNB", name: "Aeropuerto Internacional O.R. Tambo", city: "Johannesburgo", country: "Sudáfrica" },
  { code: "CPT", name: "Aeropuerto Internacional de Ciudad del Cabo", city: "Ciudad del Cabo", country: "Sudáfrica" },
  { code: "NBO", name: "Aeropuerto Internacional Jomo Kenyatta", city: "Nairobi", country: "Kenia" },
  { code: "TNR", name: "Aeropuerto Internacional Ivato", city: "Antananarivo", country: "Madagascar" },
  { code: "MRU", name: "Aeropuerto Internacional Sir Seewoosagur Ramgoolam", city: "Mauricio", country: "Mauricio" },
  { code: "RUN", name: "Aeropuerto Internacional Roland Garros", city: "Reunión", country: "Francia" },

  // ── ASIA ──────────────────────────────────────────────────────────────
  { code: "BKK", name: "Aeropuerto Internacional Suvarnabhumi", city: "Bangkok", country: "Tailandia" },
  { code: "HKT", name: "Aeropuerto Internacional de Phuket", city: "Phuket", country: "Tailandia" },
  { code: "ICN", name: "Aeropuerto Internacional de Incheon", city: "Seúl", country: "Corea del Sur" },
  { code: "NRT", name: "Aeropuerto Internacional Narita", city: "Tokio", country: "Japón" },
  { code: "HND", name: "Aeropuerto Internacional Haneda", city: "Tokio", country: "Japón" },
  { code: "HKG", name: "Aeropuerto Internacional de Hong Kong", city: "Hong Kong", country: "Hong Kong" },
  { code: "SIN", name: "Aeropuerto de Changi", city: "Singapur", country: "Singapur" },
  { code: "KUL", name: "Aeropuerto Internacional de Kuala Lumpur", city: "Kuala Lumpur", country: "Malasia" },
  { code: "CGK", name: "Aeropuerto Internacional Soekarno-Hatta", city: "Yakarta", country: "Indonesia" },
  { code: "DPS", name: "Aeropuerto Internacional Ngurah Rai", city: "Bali", country: "Indonesia" },
  { code: "PEK", name: "Aeropuerto Internacional de Pekín Capital", city: "Pekín", country: "China" },
  { code: "PVG", name: "Aeropuerto Internacional de Shanghái Pudong", city: "Shanghái", country: "China" },
  { code: "DEL", name: "Aeropuerto Internacional Indira Gandhi", city: "Nueva Delhi", country: "India" },
  { code: "BOM", name: "Aeropuerto Internacional Chhatrapati Shivaji Maharaj", city: "Bombay", country: "India" },
  { code: "CMB", name: "Aeropuerto Internacional Bandaranaike", city: "Colombo", country: "Sri Lanka" },
  { code: "MLE", name: "Aeropuerto Internacional Ibrahim Nasir", city: "Malé", country: "Maldivas" },

  // ── OCEANÍA ───────────────────────────────────────────────────────────
  { code: "SYD", name: "Aeropuerto Internacional de Sydney", city: "Sídney", country: "Australia" },
  { code: "MEL", name: "Aeropuerto de Melbourne Tullamarine", city: "Melbourne", country: "Australia" },
  { code: "BNE", name: "Aeropuerto de Brisbane", city: "Brisbane", country: "Australia" },
  { code: "AKL", name: "Aeropuerto Internacional de Auckland", city: "Auckland", country: "Nueva Zelanda" },
  { code: "NAN", name: "Aeropuerto Internacional de Nadi", city: "Nadi", country: "Fiyi" },
  { code: "PPT", name: "Aeropuerto Internacional de Faa'a", city: "Papeete", country: "Polinesia Francesa" },
]

/**
 * Busca en el dataset local por código IATA, ciudad o país.
 * Normaliza caracteres especiales para búsquedas sin acento.
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function searchLocalAirports(query: string, limit = 10): Airport[] {
  if (!query || query.length < 2) return []
  const q = normalize(query)
  const results: Airport[] = []
  for (const airport of AIRPORTS) {
    if (
      normalize(airport.code).includes(q) ||
      normalize(airport.city).includes(q) ||
      normalize(airport.name).includes(q) ||
      normalize(airport.country).includes(q)
    ) {
      results.push(airport)
      if (results.length >= limit) break
    }
  }
  return results
}
