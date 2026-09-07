# Contexto de búsqueda por turno en Emilia

## Objetivo

Evitar que una solicitud completa de un viaje nuevo herede origen, destino,
fechas, pasajeros, hoteles, filtros o selecciones de la búsqueda anterior. Los
refinamientos explícitos sí conservan el contexto necesario.

## Contrato entre capas

Emilia clasifica cada turno con una de estas relaciones:

- `new_search`: viaje independiente; rota `searchContextId`, limpia el
  `pending_action` anterior y no hereda campos del viaje previo.
- `refinement`: cambio sobre la búsqueda activa; conserva `searchContextId` y
  hereda únicamente campos no reemplazados por el usuario.
- `pending_answer`: respuesta corta a un dato solicitado.
- `result_selection`: selección de una opción ya mostrada.
- `non_search`: turno que no ejecuta una búsqueda.

La respuesta de Emilia incluye `turn_semantics` y `search_summary`; el mensaje
persistido usa `turnSemantics`, `searchSummary` y `searchContextId`. El CRM
conserva esos metadatos dentro de `content.metadata.emilia_meta` y los rehidrata
al abrir nuevamente el lead.

## Invariantes del CRM

- El historial completo sigue visible y tenant-scoped por conversación.
- Cada respuesta de búsqueda muestra el resumen efectivo entendido por Emilia.
- Un `searchContextId` nuevo separa visualmente la búsqueda y limpia selección
  y filtros locales.
- Sólo las cards del último turno con resultados de la búsqueda activa pueden
  alimentar una cotización; resultados anteriores quedan como históricos.
- Mientras una nueva búsqueda está procesándose no se puede generar una
  cotización con selecciones previas.

## Compatibilidad

El contrato `emilia.turn.v1` admite `search_context` en cada hotel:
`stay_id`, `destination_option_id`, `required_stay_ids` y presupuesto combinado
opcional. Las estadías provienen de `query.segments`; `destinationOptions`
representa ciudades alternativas para una misma estadía. El adaptador conserva
estos identificadores y resuelve fechas, ocupación, país y consulta de actualización
por la estadía y alternativa correspondientes. `metadata.hotel_segments` conserva
los estados disponible, vacío y fallido, incluso si no hay cards en un destino.

El chat permite un hotel por estadía; cambiar de alternativa reemplaza la selección
de esa estadía. El mapper exige todas las estadías y construye una opción de
cotización que suma cada alojamiento y el vuelo una sola vez. Cotización y PDF
conservan las ciudades y fechas propias de cada hotel. Las ofertas sin scope
conservan el flujo histórico de comparación de opciones.

Conversaciones históricas sin `searchContextId` usan el último mensaje con
cards como contexto activo. No se requiere migración de base de datos: el
estado y los metadatos se persisten en columnas JSONB existentes.
