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

Conversaciones históricas sin `searchContextId` usan el último mensaje con
cards como contexto activo. No se requiere migración de base de datos: el
estado y los metadatos se persisten en columnas JSONB existentes.
