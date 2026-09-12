# Detalle de hoteles en el CRM

El chat del lead abre un panel de hotel junto a los resultados en escritorio.
En pantallas de menos de 768 px el panel ocupa el espacio del chat. Cerrar el
panel devuelve el foco al control que lo abrió. Las tarjetas conservan foto,
ubicación, fechas, precio desde por moneda y selección del hotel; las habitaciones
se eligen exclusivamente dentro del panel de detalle.

## Ownership y contrato

Emilia API normaliza los datos comerciales de proveedores en
`emilia.hotel-offer.v1`. El gateway valida una lista explícita de campos públicos;
no transmite respuestas crudas, credenciales ni tokens de reserva al componente.
El CRM transforma esa respuesta en `EurovipsHotel`, conserva los textos completos
recibidos y renderiza texto escapado por React. Las URLs de sitios web permiten
HTTP(S) sin credenciales. No se modificaron permisos, credenciales ni queries de tenant.

| Emilia API | CRM |
| --- | --- |
| phone, website, description, images, category, expires_at | Mismos campos, category usa stars cuando existe |
| location, stay, amenities, accessibility | Dirección, coordenadas, fechas, noches, servicios y accesibilidad |
| lodging_policy, cancellation_policy | policy_lodging, policy_cancellation |
| rooms.id, name, description, board, board_description | occupancy_id, type, description, board, board_description |
| rooms.occupancy | adults, children, infants; fallback al pedido para respuestas antiguas |
| rooms.price, price_per_night, price_breakdown | Total, importe por noche y base/impuestos |
| rooms.refundable, free_cancellation, payment_at_property | Indicadores explícitos; null conserva desconocido |
| rooms.availability, availability_status | Cupo/estado informado, sin prometer confirmación de reserva |
| rooms.cancellation_policy, amenities, room_type_code, rate_plan_code | Política de tarifa, servicios y referencias comerciales |
| room_conditions, observations | Condiciones de habitaciones y observaciones generales del proveedor |
| rooms.images | Fotos asociadas explícitamente a esa habitación; nunca se copian fotos del hotel |
| rooms.promotion, cancellation_deadline | Promoción y fecha límite informadas, sin inferir cancelación gratuita |
| rooms.nightly_prices | Fecha e importe por noche, conservando la moneda propia de cada importe |
| rooms.cancellation_terms | Desde/hasta e importe de penalidad con su propia moneda |

El scroll vertical del chat y del panel mide 4 px en Chromium, sin pista ni
flechas, con contraste bajo que aumenta al interactuar. Firefox usa barra fina;
en modo de colores forzados se conserva un indicador visible. No cambia el
desplazamiento nativo por rueda, toque o teclado.

EUROVIPS puede entregar `Fare.type=SGL` junto a una descripción comercial completa.
La API conserva esa descripción como nombre de habitación y el código por separado.
Los textos de cama y vista se muestran como los informó el proveedor: no se
deducen atributos estructurados ni fotos de habitación a partir de un nombre de
archivo del hotel. `RoomFeatures` contiene condiciones de contratación y no debe
tratarse automáticamente como lista de comodidades.

El panel toma el hotel original del mensaje, no la copia con habitaciones filtradas.
Así se puede inspeccionar toda su información. Las tarifas que no cumplen el filtro
se identifican. La selección usa la clave de resultado del mensaje y el occupancy_id;
generar cotización sigue resolviendo el índice sobre las habitaciones originales.

## Filtros

- Nombre sin distinguir acentos o mayúsculas, categoría, régimen y mayorista.
- Moneda y máximo total de estadía. Con varias monedas se debe elegir una antes
  de ingresar un máximo; no se comparan ARS y USD como importes equivalentes.
- Cancelación gratuita solo cuando el proveedor informa true.
- Disponibilidad solo cuando el estado o cupo lo confirma al consultar.
- Los menús se construyen con los valores de los resultados recibidos.
- Una selección fuera de los filtros se mantiene visible con un aviso y se puede quitar.
- Los filtros refinan resultados ya recibidos; no disparan consultas adicionales.

## Verificación y entrega

`lib/emilia/fixtures/hotel-details.synthetic.json` es una copia del fixture canónico
generado y verificado en Emilia API (`api/test/fixtures/emiliaHotelDetails.synthetic.canonical.json`).
No representa una búsqueda viva. Los tests cubren contrato, persistencia sin recorte,
filtros, selección y total cotizado; la prueba de navegador local usa el componente
real del chat con transporte y servicios auxiliares simulados.

Los cambios están en los checkouts del CRM y de `wholesale-connect-ai`. Deben
publicarse ambos para recibir los campos nuevos. Conversaciones antiguas cuyos
textos ya fueron recortados requieren una nueva búsqueda. Emilia API mantiene su
límite de 12.000 caracteres para textos extensos y solo expone campos comerciales
definidos; los datos ausentes no se completan con contenido inventado.

La validación con proveedores requiere un smoke autenticado independiente del fixture.
La entrega se prepara sobre la rama remota actual en un worktree aislado,
conservando las reglas de selección por estadía y base de costos ya publicadas.

Novedad para publicar junto con la entrega usable, tipo `IMPROVEMENT`:

**Más detalle y mejores filtros al buscar hoteles con Emilia**

Consultá fotos, servicios, condiciones y tarifas en el panel del hotel. Elegí la
habitación desde el mismo lugar y refiná tus resultados por nombre, moneda,
cancelación gratuita y disponibilidad.

## Reversión

Revertir el commit del CRM restaura las habitaciones dentro de las tarjetas y los
filtros anteriores. Los campos opcionales de Emilia API pueden permanecer publicados;
no hay migraciones ni cambios de permisos que revertir.
