# Equipaje Delfos en Emilia

El contrato público de Delfos entrega `journeys[].segments[].baggage`:
`checked`, `carry_on`, `personal_item` y, cuando está disponible,
`by_passenger_type`. Cada franquicia informa `included: boolean | null`, piezas,
peso KG/LB y descripciones opcionales de peso y dimensiones. La fuente revisada
es `flights.presenter.ts` y `baggage-allowance.ts` del repositorio Delfos.

El adaptador `delfos-api/mapFlights.ts` de WholeSale descartaba esos campos.
Ahora conserva una lista explícita de campos públicos como `baggageAllowance`
por segmento. `_shared/emiliaTurnContract.ts` la publica como `segments[].baggage`
en `emilia.flight-offer.v1`. No se transportan objetos crudos del proveedor.

La inclusión global sólo es confirmada si todos los segmentos la confirman.
Una exclusión explícita en cualquier segmento impide anunciarla para todo el
viaje; una ausencia de datos mantiene el estado desconocido. Los filtros de
Emilia existentes usan estos estados para `carry_on`, `checked`, `both` y `none`.
Las ofertas desconocidas se conservan con metadata `unverifiable`, sin afirmar
que cumplen. La interpretación del pedido sigue en el parser de Emilia.

El CRM conserva los segmentos mediante `transformCanonicalFlights` y
`canonicalOfferCards`. La tarjeta muestra piezas, peso y condiciones por
segmento/pasajero cuando existen; los datos ausentes quedan a confirmar.
Los booleanos de inclusión ya no se convierten en una pieza inventada.
Las conversaciones históricas sin detalle mantienen la presentación resumida.

No cambia auth, tenancy, precios ni endpoints de reserva. Se requieren despliegues
de las Edge Functions que empaquetan el contrato compartido, del adaptador
`delfos-api` y del CRM. Las pruebas locales usan fixtures del contrato; no prueban
que el servidor de Delfos desplegado ya informe estos datos en todas sus ofertas.
La novedad de producto corresponde al despliegue verificado, no al cambio local.
