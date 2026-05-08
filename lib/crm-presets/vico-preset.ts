/**
 * Preset de seed para VICO Travel Group.
 * Espejo de la configuración actual de su Callbell (tags + funnels)
 * según el instructivo y el cuestionario respondido.
 *
 * Uso: ver lib/crm-presets/seed-advanced-mode.ts (Task 4)
 */

export type TagCategoryPreset = {
  name: string
  color: string
  cardinality: "one" | "many"
  display_order: number
  tags: Array<{ label: string; display_order: number }>
}

export type FunnelPreset = {
  name: string
  display_order: number
  color: string
  is_terminal: boolean
  is_default_new: boolean
}

export const VICO_TAG_CATEGORIES: TagCategoryPreset[] = [
  {
    name: "temperatura",
    color: "red",
    cardinality: "one",
    display_order: 1,
    tags: [
      { label: "CALIENTE", display_order: 1 },
      { label: "TEMPLADO", display_order: 2 },
      { label: "FRIO", display_order: 3 },
    ],
  },
  {
    name: "destino",
    color: "green",
    cardinality: "many",
    display_order: 2,
    tags: [
      { label: "ARUBA", display_order: 1 },
      { label: "BARILOCHE", display_order: 2 },
      { label: "BAYAHIBE", display_order: 3 },
      { label: "BUZIOS", display_order: 4 },
      { label: "CABO FRIO", display_order: 5 },
      { label: "CAMBORIU", display_order: 6 },
      { label: "CANCUN", display_order: 7 },
      { label: "CARTAGENA", display_order: 8 },
      { label: "CATARATAS", display_order: 9 },
      { label: "COLOMBIA", display_order: 10 },
      { label: "COSTA RICA", display_order: 11 },
      { label: "CRUCERO", display_order: 12 },
      { label: "CUBA", display_order: 13 },
      { label: "CURAZAO", display_order: 14 },
      { label: "DISNEY", display_order: 15 },
      { label: "EEUU", display_order: 16 },
      { label: "EGIPTO", display_order: 17 },
      { label: "EUROPA", display_order: 18 },
      { label: "EXOTICOS", display_order: 19 },
      { label: "FLORIANOPOLIS", display_order: 20 },
      { label: "FORMULA 1", display_order: 21 },
      { label: "GRECIA", display_order: 22 },
      { label: "JAMAICA", display_order: 23 },
      { label: "JAPON", display_order: 24 },
      { label: "JUAN DOLIO", display_order: 25 },
      { label: "MACEIO", display_order: 26 },
      { label: "MALDIVAS", display_order: 27 },
      { label: "MARAGOGI", display_order: 28 },
      { label: "MIAMI", display_order: 29 },
      { label: "MUNDIAL", display_order: 30 },
      { label: "NACIONAL", display_order: 31 },
      { label: "NATAL", display_order: 32 },
      { label: "PANAMA", display_order: 33 },
      { label: "PERU", display_order: 34 },
      { label: "PIPA", display_order: 35 },
      { label: "PLAYA DEL CARMEN", display_order: 36 },
      { label: "PUNTA CANA", display_order: 37 },
      { label: "RIO DE JANEIRO", display_order: 38 },
      { label: "SAN ANDRES", display_order: 39 },
      { label: "TURQUIA", display_order: 40 },
    ],
  },
  {
    name: "mes",
    color: "purple",
    cardinality: "one",
    display_order: 3,
    tags: [
      { label: "ENERO", display_order: 1 },
      { label: "FEBRERO", display_order: 2 },
      { label: "MARZO", display_order: 3 },
      { label: "ABRIL", display_order: 4 },
      { label: "MAYO", display_order: 5 },
      { label: "JUNIO", display_order: 6 },
      { label: "JULIO", display_order: 7 },
      { label: "AGOSTO", display_order: 8 },
      { label: "SEPTIEMBRE", display_order: 9 },
      { label: "OCTUBRE", display_order: 10 },
      { label: "NOVIEMBRE", display_order: 11 },
      { label: "DICIEMBRE", display_order: 12 },
    ],
  },
  {
    name: "origen",
    color: "orange",
    cardinality: "one",
    display_order: 4,
    tags: [
      { label: "DERIVACION DE TRAFICO", display_order: 1 },
      { label: "PUBLICIDAD", display_order: 2 },
      { label: "CANALES", display_order: 3 },
      { label: "REFERIDO", display_order: 4 },
      { label: "OPERADOR", display_order: 5 },
    ],
  },
]

export const VICO_FUNNELS: FunnelPreset[] = [
  { name: "PRIMER CONTACTO", display_order: 1, color: "gray", is_terminal: false, is_default_new: true },
  { name: "COTIZANDO", display_order: 2, color: "yellow", is_terminal: false, is_default_new: false },
  { name: "SEGUIMIENTO", display_order: 3, color: "orange", is_terminal: false, is_default_new: false },
  { name: "VENDIDO", display_order: 4, color: "green", is_terminal: true, is_default_new: false },
  { name: "NO VENDIDO", display_order: 5, color: "red", is_terminal: true, is_default_new: false },
  { name: "EN VIAJE", display_order: 6, color: "blue", is_terminal: false, is_default_new: false },
  { name: "CLIENTE VICO", display_order: 7, color: "purple", is_terminal: false, is_default_new: false },
]
