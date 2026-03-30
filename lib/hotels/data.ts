/**
 * Dataset de hoteles por destino.
 * Cubre los destinos mas vendidos por agencias de viaje argentinas.
 * Mismo patron que lib/airports/data.ts — busqueda local e instantanea.
 */

export interface HotelEntry {
  name: string
  stars: number
  city: string
  country: string
  zone?: string // zona/barrio dentro de la ciudad
}

export const HOTELS: HotelEntry[] = [
  // ══════════════════════════════════════════════════════════════════════
  // CANCUN / RIVIERA MAYA — Mexico
  // ══════════════════════════════════════════════════════════════════════
  { name: "Hyatt Ziva Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Hyatt Zilara Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "RIU Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "RIU Palace Peninsula", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "RIU Caribe", stars: 4, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Hard Rock Hotel Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Dreams Sands Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Secrets The Vine Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Live Aqua Beach Resort Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "The Westin Resort & Spa Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "JW Marriott Cancun Resort & Spa", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Marriott Cancun Resort", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Fiesta Americana Condesa Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Krystal Cancun", stars: 4, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Iberostar Selection Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Iberostar Cancun Star Prestige", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Moon Palace The Grand Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Paradisus Cancun", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Sandos Cancun All Inclusive", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Grand Oasis Cancun", stars: 4, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Oasis Palm Cancun", stars: 4, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Nizuc Resort & Spa", stars: 5, city: "Cancun", country: "Mexico", zone: "Punta Nizuc" },
  { name: "Grand Fiesta Americana Coral Beach", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Hilton Cancun Mar Caribe", stars: 5, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },
  { name: "Hotel NYX Cancun", stars: 4, city: "Cancun", country: "Mexico", zone: "Zona Hotelera" },

  // Riviera Maya / Playa del Carmen
  { name: "Iberostar Paraiso Beach", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playa Paraiso" },
  { name: "Iberostar Paraiso Del Mar", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playa Paraiso" },
  { name: "Iberostar Grand Paraiso", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playa Paraiso" },
  { name: "Iberostar Quetzal", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playacar" },
  { name: "Iberostar Tucan", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playacar" },
  { name: "Grand Hyatt Playa del Carmen", stars: 5, city: "Playa del Carmen", country: "Mexico" },
  { name: "Thompson Playa del Carmen", stars: 5, city: "Playa del Carmen", country: "Mexico" },
  { name: "Hilton Playa del Carmen", stars: 5, city: "Playa del Carmen", country: "Mexico" },
  { name: "Secrets Akumal Riviera Maya", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Akumal" },
  { name: "Dreams Riviera Cancun", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Puerto Morelos" },
  { name: "Dreams Puerto Aventuras", stars: 4, city: "Riviera Maya", country: "Mexico", zone: "Puerto Aventuras" },
  { name: "Barcelo Maya Palace", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Xpu-Ha" },
  { name: "Barcelo Maya Grand Resort", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Xpu-Ha" },
  { name: "Barcelo Maya Riviera", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Xpu-Ha" },
  { name: "RIU Palace Riviera Maya", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playa del Carmen" },
  { name: "RIU Yucatan", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playacar" },
  { name: "RIU Playacar", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Playacar" },
  { name: "RIU Tequila", stars: 4, city: "Riviera Maya", country: "Mexico", zone: "Playacar" },
  { name: "Xcaret Hotel", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Xcaret" },
  { name: "Hotel Xcaret Arte", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Xcaret" },
  { name: "Sandos Caracol Eco Resort", stars: 4, city: "Riviera Maya", country: "Mexico", zone: "Playa del Carmen" },
  { name: "Grand Palladium Colonial Resort", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Kantenah" },
  { name: "Grand Palladium White Sand", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Kantenah" },
  { name: "Bahia Principe Grand Tulum", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Tulum" },
  { name: "Bahia Principe Luxury Akumal", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Akumal" },
  { name: "TRS Yucatan Hotel", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Kantenah" },
  { name: "Finest Playa Mujeres", stars: 5, city: "Playa Mujeres", country: "Mexico" },
  { name: "Excellence Playa Mujeres", stars: 5, city: "Playa Mujeres", country: "Mexico" },
  { name: "Excellence Riviera Cancun", stars: 5, city: "Riviera Maya", country: "Mexico", zone: "Puerto Morelos" },

  // ══════════════════════════════════════════════════════════════════════
  // PUNTA CANA — Republica Dominicana
  // ══════════════════════════════════════════════════════════════════════
  { name: "Hard Rock Hotel & Casino Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Iberostar Selection Bavaro", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Iberostar Grand Bavaro", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Iberostar Dominicana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Iberostar Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "RIU Palace Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Arena Gorda" },
  { name: "RIU Bambu", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Arena Gorda" },
  { name: "RIU Republica", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Arena Gorda" },
  { name: "RIU Naiboa", stars: 4, city: "Punta Cana", country: "Republica Dominicana", zone: "Arena Gorda" },
  { name: "Barcelo Bavaro Palace", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Barcelo Bavaro Beach", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Dreams Royal Beach Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Dreams Macao Beach Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Macao" },
  { name: "Secrets Royal Beach Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Secrets Cap Cana Resort", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Cap Cana" },
  { name: "Hyatt Zilara Cap Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Cap Cana" },
  { name: "Hyatt Ziva Cap Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Cap Cana" },
  { name: "Bahia Principe Grand Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana" },
  { name: "Bahia Principe Luxury Ambar", stars: 5, city: "Punta Cana", country: "Republica Dominicana" },
  { name: "Bahia Principe Fantasia Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana" },
  { name: "Grand Palladium Punta Cana Resort", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Grand Palladium Palace Resort", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "TRS Turquesa Hotel", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Lopesan Costa Bavaro Resort", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Majestic Elegance Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana" },
  { name: "Majestic Mirage Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana" },
  { name: "Paradisus Palma Real Golf & Spa", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Paradisus Grand Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Bavaro" },
  { name: "Excellence Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Uvero Alto" },
  { name: "Breathless Punta Cana Resort", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Uvero Alto" },
  { name: "Now Onyx Punta Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Uvero Alto" },
  { name: "Sanctuary Cap Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Cap Cana" },
  { name: "Margaritaville Island Reserve Cap Cana", stars: 5, city: "Punta Cana", country: "Republica Dominicana", zone: "Cap Cana" },

  // ══════════════════════════════════════════════════════════════════════
  // ARUBA
  // ══════════════════════════════════════════════════════════════════════
  { name: "Riu Palace Aruba", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Riu Palace Antillas", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Hyatt Regency Aruba Resort", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Hilton Aruba Caribbean Resort", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Holiday Inn Resort Aruba", stars: 4, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Marriott Resort & Stellaris Casino", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "The Ritz-Carlton Aruba", stars: 5, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Barcelo Aruba", stars: 4, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Radisson Blu Aruba", stars: 4, city: "Aruba", country: "Aruba", zone: "Palm Beach" },
  { name: "Divi Aruba All Inclusive", stars: 4, city: "Aruba", country: "Aruba", zone: "Druif Beach" },
  { name: "Tamarijn Aruba All Inclusive", stars: 4, city: "Aruba", country: "Aruba", zone: "Druif Beach" },
  { name: "Manchebo Beach Resort & Spa", stars: 4, city: "Aruba", country: "Aruba", zone: "Eagle Beach" },
  { name: "Bucuti & Tara Beach Resort", stars: 4, city: "Aruba", country: "Aruba", zone: "Eagle Beach" },
  { name: "Amsterdam Manor Beach Resort", stars: 4, city: "Aruba", country: "Aruba", zone: "Eagle Beach" },
  { name: "Renaissance Aruba Resort & Casino", stars: 5, city: "Aruba", country: "Aruba", zone: "Oranjestad" },

  // ══════════════════════════════════════════════════════════════════════
  // CURACAO
  // ══════════════════════════════════════════════════════════════════════
  { name: "Dreams Curacao Resort", stars: 5, city: "Curacao", country: "Curacao" },
  { name: "Hilton Curacao", stars: 4, city: "Curacao", country: "Curacao" },
  { name: "Renaissance Curacao Resort", stars: 4, city: "Curacao", country: "Curacao" },
  { name: "Marriott Beach Resort Curacao", stars: 4, city: "Curacao", country: "Curacao" },
  { name: "Sandals Royal Curacao", stars: 5, city: "Curacao", country: "Curacao" },
  { name: "Corendon Mangrove Beach Resort", stars: 4, city: "Curacao", country: "Curacao" },
  { name: "Lions Dive & Beach Resort", stars: 4, city: "Curacao", country: "Curacao" },

  // ══════════════════════════════════════════════════════════════════════
  // JAMAICA
  // ══════════════════════════════════════════════════════════════════════
  { name: "Iberostar Grand Rose Hall", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Iberostar Selection Rose Hall", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Hyatt Ziva Rose Hall", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Hyatt Zilara Rose Hall", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "RIU Palace Jamaica", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "RIU Reggae", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Secrets St James Montego Bay", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Sandals Royal Caribbean", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Secrets Wild Orchid Montego Bay", stars: 5, city: "Montego Bay", country: "Jamaica" },
  { name: "Half Moon Resort", stars: 5, city: "Montego Bay", country: "Jamaica" },

  // ══════════════════════════════════════════════════════════════════════
  // MIAMI / ORLANDO / USA
  // ══════════════════════════════════════════════════════════════════════
  { name: "Fontainebleau Miami Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Miami Beach" },
  { name: "The Setai Miami Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "Faena Hotel Miami Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Mid Beach" },
  { name: "1 Hotel South Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "W South Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "The Ritz-Carlton South Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "Loews Miami Beach Hotel", stars: 4, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "Eden Roc Miami Beach", stars: 4, city: "Miami", country: "Estados Unidos", zone: "Miami Beach" },
  { name: "Hilton Cabana Miami Beach", stars: 4, city: "Miami", country: "Estados Unidos", zone: "Miami Beach" },
  { name: "Holiday Inn Miami Beach Oceanfront", stars: 3, city: "Miami", country: "Estados Unidos", zone: "Miami Beach" },
  { name: "Intercontinental Miami", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Downtown" },
  { name: "JW Marriott Miami", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Brickell" },
  { name: "Marriott Stanton South Beach", stars: 4, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "The Confidante Miami Beach", stars: 4, city: "Miami", country: "Estados Unidos", zone: "Mid Beach" },
  { name: "Nobu Hotel Miami Beach", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Mid Beach" },
  { name: "Acqualina Resort & Residences", stars: 5, city: "Miami", country: "Estados Unidos", zone: "Sunny Isles" },
  { name: "Trump International Beach Resort", stars: 4, city: "Miami", country: "Estados Unidos", zone: "Sunny Isles" },
  { name: "The Palms Hotel & Spa", stars: 4, city: "Miami", country: "Estados Unidos", zone: "Miami Beach" },
  { name: "Kimpton Surfcomber Hotel", stars: 4, city: "Miami", country: "Estados Unidos", zone: "South Beach" },
  { name: "National Hotel Miami Beach", stars: 4, city: "Miami", country: "Estados Unidos", zone: "South Beach" },

  // Orlando
  { name: "Walt Disney World Swan & Dolphin", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Disney's Grand Floridian Resort", stars: 5, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Disney's Contemporary Resort", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Disney's Animal Kingdom Lodge", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Disney's Art of Animation Resort", stars: 3, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Disney's All-Star Movies Resort", stars: 3, city: "Orlando", country: "Estados Unidos", zone: "Disney World" },
  { name: "Universal's Cabana Bay Beach Resort", stars: 3, city: "Orlando", country: "Estados Unidos", zone: "Universal" },
  { name: "Universal's Loews Royal Pacific", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Universal" },
  { name: "Universal's Hard Rock Hotel", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Universal" },
  { name: "Universal's Aventura Hotel", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Universal" },
  { name: "Hilton Orlando Bonnet Creek", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "Bonnet Creek" },
  { name: "Marriott's Grande Vista", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "International Drive" },
  { name: "Hyatt Regency Orlando", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "International Drive" },
  { name: "Rosen Shingle Creek", stars: 4, city: "Orlando", country: "Estados Unidos", zone: "International Drive" },

  // New York
  { name: "The Plaza Hotel", stars: 5, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },
  { name: "The St. Regis New York", stars: 5, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },
  { name: "Park Hyatt New York", stars: 5, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },
  { name: "The Peninsula New York", stars: 5, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },
  { name: "Marriott Marquis Times Square", stars: 4, city: "Nueva York", country: "Estados Unidos", zone: "Times Square" },
  { name: "Hilton Midtown Manhattan", stars: 4, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },
  { name: "Row NYC Hotel", stars: 3, city: "Nueva York", country: "Estados Unidos", zone: "Times Square" },
  { name: "Pod 51 Hotel", stars: 3, city: "Nueva York", country: "Estados Unidos", zone: "Midtown" },

  // ══════════════════════════════════════════════════════════════════════
  // BRASIL
  // ══════════════════════════════════════════════════════════════════════
  { name: "Copacabana Palace", stars: 5, city: "Rio de Janeiro", country: "Brasil", zone: "Copacabana" },
  { name: "JW Marriott Rio de Janeiro", stars: 5, city: "Rio de Janeiro", country: "Brasil", zone: "Copacabana" },
  { name: "Hilton Rio de Janeiro Copacabana", stars: 5, city: "Rio de Janeiro", country: "Brasil", zone: "Copacabana" },
  { name: "Windsor Atlantica Hotel", stars: 4, city: "Rio de Janeiro", country: "Brasil", zone: "Copacabana" },
  { name: "Hotel Fasano Rio de Janeiro", stars: 5, city: "Rio de Janeiro", country: "Brasil", zone: "Ipanema" },
  { name: "Sheraton Grand Rio Hotel", stars: 5, city: "Rio de Janeiro", country: "Brasil", zone: "Leblon" },
  { name: "Windsor Marapendi", stars: 4, city: "Rio de Janeiro", country: "Brasil", zone: "Barra da Tijuca" },

  // Florianopolis
  { name: "Costao do Santinho Resort", stars: 5, city: "Florianopolis", country: "Brasil" },
  { name: "Il Campanario Villaggio Resort", stars: 5, city: "Florianopolis", country: "Brasil", zone: "Jurere" },
  { name: "Ponta dos Ganchos Resort", stars: 5, city: "Florianopolis", country: "Brasil" },
  { name: "Majestic Palace Hotel", stars: 4, city: "Florianopolis", country: "Brasil", zone: "Centro" },

  // Salvador de Bahia
  { name: "Tivoli Ecoresort Praia do Forte", stars: 5, city: "Salvador de Bahia", country: "Brasil", zone: "Praia do Forte" },
  { name: "Iberostar Selection Praia do Forte", stars: 5, city: "Salvador de Bahia", country: "Brasil", zone: "Praia do Forte" },
  { name: "Grand Palladium Imbassai Resort", stars: 5, city: "Salvador de Bahia", country: "Brasil", zone: "Imbassai" },
  { name: "Catussaba Resort Hotel", stars: 4, city: "Salvador de Bahia", country: "Brasil" },

  // Buzios
  { name: "Casas Brancas Boutique Hotel & Spa", stars: 5, city: "Buzios", country: "Brasil" },
  { name: "Insolito Boutique Hotel", stars: 4, city: "Buzios", country: "Brasil" },
  { name: "Ferradura Resort", stars: 4, city: "Buzios", country: "Brasil" },

  // ══════════════════════════════════════════════════════════════════════
  // EUROPA
  // ══════════════════════════════════════════════════════════════════════
  // Madrid
  { name: "The Westin Palace Madrid", stars: 5, city: "Madrid", country: "Espana" },
  { name: "Hotel Ritz Madrid (Mandarin Oriental)", stars: 5, city: "Madrid", country: "Espana" },
  { name: "Melia Madrid Princesa", stars: 4, city: "Madrid", country: "Espana" },
  { name: "NH Collection Madrid Eurobuilding", stars: 5, city: "Madrid", country: "Espana" },
  { name: "Iberostar Las Letras Gran Via", stars: 4, city: "Madrid", country: "Espana", zone: "Gran Via" },
  { name: "Room Mate Oscar", stars: 3, city: "Madrid", country: "Espana", zone: "Gran Via" },
  { name: "Catalonia Gran Via", stars: 4, city: "Madrid", country: "Espana", zone: "Gran Via" },

  // Barcelona
  { name: "Hotel Arts Barcelona", stars: 5, city: "Barcelona", country: "Espana", zone: "Port Olimpic" },
  { name: "W Barcelona", stars: 5, city: "Barcelona", country: "Espana", zone: "Barceloneta" },
  { name: "Majestic Hotel & Spa Barcelona", stars: 5, city: "Barcelona", country: "Espana", zone: "Paseo de Gracia" },
  { name: "Melia Barcelona Sarria", stars: 4, city: "Barcelona", country: "Espana" },
  { name: "Catalonia Barcelona Plaza", stars: 4, city: "Barcelona", country: "Espana", zone: "Plaza Espana" },
  { name: "NH Collection Barcelona Gran Hotel Calderon", stars: 4, city: "Barcelona", country: "Espana", zone: "Rambla Catalunya" },

  // Roma
  { name: "Hotel Hassler Roma", stars: 5, city: "Roma", country: "Italia", zone: "Plaza de Espana" },
  { name: "Hotel de Russie", stars: 5, city: "Roma", country: "Italia", zone: "Piazza del Popolo" },
  { name: "NH Collection Roma Centro", stars: 4, city: "Roma", country: "Italia", zone: "Termini" },
  { name: "Melia Roma Aurelia Antica", stars: 4, city: "Roma", country: "Italia" },
  { name: "Hotel Artemide", stars: 4, city: "Roma", country: "Italia", zone: "Via Nazionale" },

  // Paris
  { name: "Le Meurice", stars: 5, city: "Paris", country: "Francia", zone: "1er Arrondissement" },
  { name: "Hotel Plaza Athenee", stars: 5, city: "Paris", country: "Francia", zone: "Champs-Elysees" },
  { name: "Pullman Paris Tour Eiffel", stars: 4, city: "Paris", country: "Francia", zone: "Torre Eiffel" },
  { name: "Citadines Tour Eiffel Paris", stars: 3, city: "Paris", country: "Francia", zone: "Torre Eiffel" },
  { name: "Mercure Paris Centre Tour Eiffel", stars: 4, city: "Paris", country: "Francia" },
  { name: "Novotel Paris Centre Tour Eiffel", stars: 4, city: "Paris", country: "Francia" },

  // Londres
  { name: "The Savoy", stars: 5, city: "Londres", country: "Reino Unido", zone: "Covent Garden" },
  { name: "Claridge's", stars: 5, city: "Londres", country: "Reino Unido", zone: "Mayfair" },
  { name: "Park Plaza Westminster Bridge", stars: 4, city: "Londres", country: "Reino Unido", zone: "Westminster" },
  { name: "Hilton London Metropole", stars: 4, city: "Londres", country: "Reino Unido", zone: "Paddington" },
  { name: "Premier Inn London City Tower Hill", stars: 3, city: "Londres", country: "Reino Unido", zone: "Tower Hill" },

  // ══════════════════════════════════════════════════════════════════════
  // ARGENTINA
  // ══════════════════════════════════════════════════════════════════════
  // Bariloche
  { name: "Llao Llao Resort Golf & Spa", stars: 5, city: "Bariloche", country: "Argentina" },
  { name: "Charming Luxury Lodge & Private Spa", stars: 5, city: "Bariloche", country: "Argentina" },
  { name: "NH Edelweiss Bariloche", stars: 4, city: "Bariloche", country: "Argentina", zone: "Centro" },
  { name: "Cacique Inacayal Lake Hotel & Spa", stars: 4, city: "Bariloche", country: "Argentina", zone: "Centro" },
  { name: "Panamericano Bariloche", stars: 4, city: "Bariloche", country: "Argentina", zone: "Centro" },
  { name: "Design Suites Bariloche", stars: 4, city: "Bariloche", country: "Argentina" },

  // Mendoza
  { name: "Park Hyatt Mendoza", stars: 5, city: "Mendoza", country: "Argentina", zone: "Centro" },
  { name: "Sheraton Mendoza Hotel", stars: 5, city: "Mendoza", country: "Argentina", zone: "Centro" },
  { name: "Intercontinental Mendoza", stars: 5, city: "Mendoza", country: "Argentina", zone: "Centro" },
  { name: "The Vines Resort & Spa", stars: 5, city: "Mendoza", country: "Argentina", zone: "Valle de Uco" },
  { name: "Cavas Wine Lodge", stars: 5, city: "Mendoza", country: "Argentina", zone: "Lujan de Cuyo" },
  { name: "Mod Hotel Mendoza", stars: 4, city: "Mendoza", country: "Argentina", zone: "Centro" },

  // Iguazu
  { name: "Gran Melia Iguazu", stars: 5, city: "Iguazu", country: "Argentina", zone: "Parque Nacional" },
  { name: "Sheraton Iguazu Resort & Spa", stars: 5, city: "Iguazu", country: "Argentina", zone: "Parque Nacional" },
  { name: "Loi Suites Iguazu Hotel", stars: 5, city: "Iguazu", country: "Argentina" },
  { name: "Mercure Iguazu Hotel Iru", stars: 4, city: "Iguazu", country: "Argentina" },
  { name: "Amerian Portal del Iguazu", stars: 4, city: "Iguazu", country: "Argentina" },

  // El Calafate
  { name: "Xelena Hotel & Suites", stars: 4, city: "El Calafate", country: "Argentina" },
  { name: "Imago Hotel & Spa", stars: 5, city: "El Calafate", country: "Argentina" },
  { name: "Esplendor by Wyndham El Calafate", stars: 4, city: "El Calafate", country: "Argentina" },
  { name: "Design Suites Calafate", stars: 4, city: "El Calafate", country: "Argentina" },

  // Ushuaia
  { name: "Arakur Ushuaia Resort & Spa", stars: 5, city: "Ushuaia", country: "Argentina" },
  { name: "Los Cauquenes Resort & Spa", stars: 5, city: "Ushuaia", country: "Argentina" },
  { name: "Hotel Albatros", stars: 4, city: "Ushuaia", country: "Argentina" },
  { name: "Las Hayas Ushuaia Resort", stars: 5, city: "Ushuaia", country: "Argentina" },

  // Salta
  { name: "Sheraton Salta Hotel", stars: 5, city: "Salta", country: "Argentina", zone: "Centro" },
  { name: "Design Suites Salta", stars: 4, city: "Salta", country: "Argentina", zone: "Centro" },
  { name: "Legado Mitico Salta", stars: 5, city: "Salta", country: "Argentina", zone: "Centro" },
  { name: "Hotel Alejandro I", stars: 4, city: "Salta", country: "Argentina", zone: "Centro" },

  // Buenos Aires
  { name: "Alvear Palace Hotel", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Recoleta" },
  { name: "Alvear Art Hotel", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Recoleta" },
  { name: "Palacio Duhau Park Hyatt Buenos Aires", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Recoleta" },
  { name: "Four Seasons Hotel Buenos Aires", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Retiro" },
  { name: "Faena Hotel Buenos Aires", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Puerto Madero" },
  { name: "Hotel Madero Buenos Aires", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Puerto Madero" },
  { name: "Hilton Buenos Aires", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Puerto Madero" },
  { name: "Sofitel Buenos Aires Recoleta", stars: 5, city: "Buenos Aires", country: "Argentina", zone: "Recoleta" },
  { name: "NH Collection Buenos Aires Centro", stars: 4, city: "Buenos Aires", country: "Argentina", zone: "Centro" },
  { name: "Panamericano Buenos Aires", stars: 4, city: "Buenos Aires", country: "Argentina", zone: "Obelisco" },

  // ══════════════════════════════════════════════════════════════════════
  // CRUCEROS — Lineas principales
  // ══════════════════════════════════════════════════════════════════════
  { name: "MSC Grandiosa", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "MSC Fantasia", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "MSC Preziosa", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "MSC Seaview", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "MSC Seaside", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "MSC World Europa", stars: 5, city: "Crucero MSC", country: "Crucero" },
  { name: "Costa Toscana", stars: 5, city: "Crucero Costa", country: "Crucero" },
  { name: "Costa Smeralda", stars: 5, city: "Crucero Costa", country: "Crucero" },
  { name: "Royal Caribbean Odyssey of the Seas", stars: 5, city: "Crucero Royal Caribbean", country: "Crucero" },
  { name: "Royal Caribbean Wonder of the Seas", stars: 5, city: "Crucero Royal Caribbean", country: "Crucero" },
  { name: "Royal Caribbean Allure of the Seas", stars: 5, city: "Crucero Royal Caribbean", country: "Crucero" },
  { name: "Norwegian Epic", stars: 5, city: "Crucero Norwegian", country: "Crucero" },
  { name: "Celebrity Beyond", stars: 5, city: "Crucero Celebrity", country: "Crucero" },

  // ══════════════════════════════════════════════════════════════════════
  // COLOMBIA
  // ══════════════════════════════════════════════════════════════════════
  { name: "Sofitel Legend Santa Clara Cartagena", stars: 5, city: "Cartagena", country: "Colombia", zone: "Centro Historico" },
  { name: "Hotel Charleston Santa Teresa", stars: 5, city: "Cartagena", country: "Colombia", zone: "Centro Historico" },
  { name: "Hilton Cartagena", stars: 5, city: "Cartagena", country: "Colombia", zone: "Bocagrande" },
  { name: "Hyatt Regency Cartagena", stars: 5, city: "Cartagena", country: "Colombia", zone: "Centro Historico" },
  { name: "Las Americas Beach Resort Cartagena", stars: 5, city: "Cartagena", country: "Colombia" },
  { name: "Hotel Dann Carlton Bogota", stars: 5, city: "Bogota", country: "Colombia" },
  { name: "JW Marriott Hotel Bogota", stars: 5, city: "Bogota", country: "Colombia" },

  // ══════════════════════════════════════════════════════════════════════
  // PERU
  // ══════════════════════════════════════════════════════════════════════
  { name: "JW Marriott Hotel Lima", stars: 5, city: "Lima", country: "Peru", zone: "Miraflores" },
  { name: "Belmond Miraflores Park", stars: 5, city: "Lima", country: "Peru", zone: "Miraflores" },
  { name: "Hilton Lima Miraflores", stars: 5, city: "Lima", country: "Peru", zone: "Miraflores" },
  { name: "Belmond Sanctuary Lodge", stars: 5, city: "Cusco", country: "Peru", zone: "Machu Picchu" },
  { name: "JW Marriott El Convento Cusco", stars: 5, city: "Cusco", country: "Peru", zone: "Centro Historico" },
  { name: "Palacio del Inka, a Luxury Collection Hotel", stars: 5, city: "Cusco", country: "Peru", zone: "Centro Historico" },
  { name: "Belmond Hotel Monasterio", stars: 5, city: "Cusco", country: "Peru", zone: "Centro Historico" },

  // ══════════════════════════════════════════════════════════════════════
  // CHILE
  // ══════════════════════════════════════════════════════════════════════
  { name: "The Ritz-Carlton Santiago", stars: 5, city: "Santiago", country: "Chile", zone: "Las Condes" },
  { name: "W Santiago", stars: 5, city: "Santiago", country: "Chile", zone: "Las Condes" },
  { name: "Mandarin Oriental Santiago", stars: 5, city: "Santiago", country: "Chile", zone: "Las Condes" },
  { name: "Hotel Noi Vitacura", stars: 5, city: "Santiago", country: "Chile", zone: "Vitacura" },

  // ══════════════════════════════════════════════════════════════════════
  // PANAMA
  // ══════════════════════════════════════════════════════════════════════
  { name: "The Westin Playa Bonita Panama", stars: 5, city: "Panama", country: "Panama", zone: "Playa Bonita" },
  { name: "JW Marriott Panama", stars: 5, city: "Panama", country: "Panama" },
  { name: "Hard Rock Hotel Panama Megapolis", stars: 5, city: "Panama", country: "Panama" },
  { name: "Trump International Hotel Panama", stars: 5, city: "Panama", country: "Panama" },
  { name: "RIU Plaza Panama", stars: 4, city: "Panama", country: "Panama" },
  { name: "Dreams Playa Bonita Panama", stars: 5, city: "Panama", country: "Panama", zone: "Playa Bonita" },

  // ══════════════════════════════════════════════════════════════════════
  // COSTA RICA
  // ══════════════════════════════════════════════════════════════════════
  { name: "RIU Palace Costa Rica", stars: 5, city: "Guanacaste", country: "Costa Rica", zone: "Playa Matapalo" },
  { name: "RIU Guanacaste", stars: 4, city: "Guanacaste", country: "Costa Rica", zone: "Playa Matapalo" },
  { name: "Dreams Las Mareas Costa Rica", stars: 5, city: "Guanacaste", country: "Costa Rica" },
  { name: "Secrets Papagayo Costa Rica", stars: 5, city: "Guanacaste", country: "Costa Rica" },
  { name: "Westin Reserva Conchal", stars: 5, city: "Guanacaste", country: "Costa Rica", zone: "Playa Conchal" },
  { name: "Andaz Costa Rica Resort at Peninsula Papagayo", stars: 5, city: "Guanacaste", country: "Costa Rica" },
  { name: "Four Seasons Resort Costa Rica", stars: 5, city: "Guanacaste", country: "Costa Rica", zone: "Peninsula Papagayo" },

  // ══════════════════════════════════════════════════════════════════════
  // CUBA
  // ══════════════════════════════════════════════════════════════════════
  { name: "Melia Habana", stars: 5, city: "La Habana", country: "Cuba" },
  { name: "Iberostar Parque Central", stars: 5, city: "La Habana", country: "Cuba", zone: "Habana Vieja" },
  { name: "Hotel Nacional de Cuba", stars: 5, city: "La Habana", country: "Cuba", zone: "Vedado" },
  { name: "Iberostar Selection Varadero", stars: 5, city: "Varadero", country: "Cuba" },
  { name: "Melia Varadero", stars: 5, city: "Varadero", country: "Cuba" },
  { name: "Melia Peninsula Varadero", stars: 5, city: "Varadero", country: "Cuba" },
  { name: "Paradisus Princesa del Mar", stars: 5, city: "Varadero", country: "Cuba" },
  { name: "Royalton Hicacos Resort", stars: 5, city: "Varadero", country: "Cuba" },

  // ══════════════════════════════════════════════════════════════════════
  // TURQUIA / DUBAI
  // ══════════════════════════════════════════════════════════════════════
  { name: "Four Seasons Hotel Istanbul at Sultanahmet", stars: 5, city: "Estambul", country: "Turquia" },
  { name: "Raffles Istanbul", stars: 5, city: "Estambul", country: "Turquia" },
  { name: "Ciragan Palace Kempinski Istanbul", stars: 5, city: "Estambul", country: "Turquia" },
  { name: "Swissotel The Bosphorus Istanbul", stars: 5, city: "Estambul", country: "Turquia" },

  { name: "Atlantis The Palm Dubai", stars: 5, city: "Dubai", country: "Emiratos Arabes", zone: "Palm Jumeirah" },
  { name: "Burj Al Arab Jumeirah", stars: 5, city: "Dubai", country: "Emiratos Arabes", zone: "Jumeirah" },
  { name: "JW Marriott Marquis Hotel Dubai", stars: 5, city: "Dubai", country: "Emiratos Arabes" },
  { name: "Hilton Dubai Jumeirah", stars: 5, city: "Dubai", country: "Emiratos Arabes", zone: "Jumeirah Beach" },
]

/**
 * Busca hoteles por nombre, ciudad o pais.
 * Prioriza coincidencias por ciudad del destino seleccionado.
 */
export function searchHotels(query: string, destinationCity?: string, limit: number = 20): HotelEntry[] {
  const q = normalize(query)

  if (!q && !destinationCity) return []

  // Si no hay query pero si destino, devolver hoteles de esa ciudad
  if (!q && destinationCity) {
    const destNorm = normalize(destinationCity)
    return HOTELS
      .filter(h => normalize(h.city).includes(destNorm) || destNorm.includes(normalize(h.city)))
      .slice(0, limit)
  }

  // Scoring: priorizar matches por ciudad del destino
  const destNorm = destinationCity ? normalize(destinationCity) : ""
  const scored = HOTELS.map(h => {
    let score = 0
    const nameNorm = normalize(h.name)
    const cityNorm = normalize(h.city)
    const countryNorm = normalize(h.country)
    const zoneNorm = h.zone ? normalize(h.zone) : ""

    // Match por nombre del hotel
    if (nameNorm.includes(q)) score += 500
    if (nameNorm.startsWith(q)) score += 200

    // Match por ciudad
    if (cityNorm.includes(q)) score += 300
    if (countryNorm.includes(q)) score += 100
    if (zoneNorm.includes(q)) score += 150

    // Bonus si el hotel esta en el destino seleccionado
    if (destNorm && (cityNorm.includes(destNorm) || destNorm.includes(cityNorm))) {
      score += 1000
    }

    // Bonus por estrellas (mejores primero)
    score += h.stars * 2

    return { hotel: h, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.hotel)
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}
