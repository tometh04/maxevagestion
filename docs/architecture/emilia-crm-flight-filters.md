# Filtros de vuelos de Emilia en el CRM

## Inventario ampliado y cantidades por escalas (2026-09-12, local)

Las cantidades máximas por grupo se configuran sobre las opciones recibidas:
0, 1, 2 escalas y los demás grupos encontrados. Vacío significa sin límite;
cero oculta ese grupo. Se aplica primero horario y demás restricciones, después
el cupo, conservando el orden de búsqueda. Una selección previa se conserva
aunque exceda el cupo. Las escalas se clasifican por el máximo de cada trayecto,
sin sumar ida y vuelta. Los datos desconocidos no se clasifican como directos.

El CRM conserva todas las opciones recibidas y monta páginas de 24 tarjetas.
Cambiar los filtros vuelve a la primera página y no consulta proveedores.

En Wholesale se retira el corte final de 40 de los tres ejecutores y se conservan
ofertas diferentes aunque tengan igual precio. Solo se deduplican payloads
idénticos; no se colapsan distintos regresos, proveedores o condiciones.
El adaptador de Delfos sigue `search_id` y `next_cursor` de `/v1/flights/search/page`
con las mismas credenciales de agencia. `max_results: 20` sigue siendo el tamaño
de página válido de la API, no el límite final del inventario recuperado.

La navegación comparte un presupuesto hasta 40 segundos desde el comienzo del
adaptador y un máximo de 250 páginas, acorde al límite upstream de 5000 alternativas.
No vuelve a ejecutar disponibilidad. Una página fallida, vencimiento, cursor
repetido o falta de snapshot conserva las páginas previas y marca cobertura parcial.
Esa cobertura se proyecta al contrato público sin IDs/cursors ni errores internos
y el CRM la muestra. Los límites upstream de cobertura también se informan.

Esto puede aumentar el tiempo hasta los primeros vuelos porque el ejecutor espera
el lote del adaptador; no se implementó streaming por página de proveedor. La
paginación de tarjetas evita montar miles de componentes, pero el payload completo
sigue viajando y persistiendo: el impacto real requiere medir búsquedas autenticadas.
La novedad de producto corresponde cuando estos cambios estén desplegados.
