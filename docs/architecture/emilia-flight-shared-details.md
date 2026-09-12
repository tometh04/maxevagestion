# Sidebar de vuelos de Emilia

Los vuelos y hoteles comparten `ResultDetailSidebar`: panel acoplado al chat,
420 px desde md y 480 px desde xl; en móvil reemplaza la conversación. El lead
mantiene una sola sidebar activa, identificada por mensaje y oferta, independiente
de la selección. Escape/cerrar devuelve el foco al disparador. Las tarjetas
permanecen compactas y alineadas mediante `FlightResults` y `result-carousel`.
El chat general de Emilia también abre el detalle junto a la conversación.

## Datos y contrato

Se verificaron con curl búsquedas EZE–PUJ, 10–17 de octubre de 2026, 2 adultos:
Starling (adaptador autenticado `starling-flights`) respondió HTTP 200 con 1429
Fares; Delfos (`/v1/flights/search`) respondió HTTP 200 con 20 ofertas. La URL de
Delfos configurada en Railway es `api-staging.delfos.tur.ar`: esta evidencia NO
verifica disponibilidad de producción. No se ejecutaron reservas ni emisiones.

WholeSale conserva `provider_details`, una lista opcional de secciones con
campos `{ label, value }`, antes de descartar los datos del proveedor. La
proyección usa rutas permitidas explícitas de las respuestas auditadas: tarifa,
impuestos, comisiones, netos, desglose por pasajero, emisión, cancelación, pagos,
IATA, equipaje, aeronave, disponibilidad, base tarifaria y todos los horarios
alternativos. Los códigos originales se conservan bajo etiquetas en español.
Valores cero, false, null y listas vacías permanecen diferenciados. No se
propagan credenciales, IDs internos de búsqueda/reserva ni campos desconocidos.
Las alternativas son informativas: la tarjeta y la selección siguen usando
la primera opción de cada trayecto, como antes de este cambio.

La proyección existe en Edge y API por sus runtimes independientes; un test
exige que ambas copias sean idénticas. `emiliaTurnContract` conserva el detalle;
el gateway lo valida con Zod estricto y el CRM lo mantiene en transformadores,
view models y conversaciones. El formato antiguo sigue funcionando y muestra
un aviso para volver a buscar cuando carece del detalle ampliado. No se pueden
recuperar campos ya descartados en búsquedas históricas sin otra consulta.

También se preservan números de vuelo numéricos de TVC y se interpretan sus
códigos explícitos de equipaje PC/KG/LB en los segmentos del contrato canónico.
Ausencia de cantidad de carry-on sigue siendo desconocida, nunca cero.

## Validación y publicación

Fixtures comerciales sanitizadas procedentes de las respuestas reales prueban
proveedor → contrato Edge → gateway estricto → CRM y persistencia. Las pruebas
de UI verifican campos, selección independiente, cambio entre hotel/vuelo,
Escape, foco y compatibilidad histórica. Capturas locales con componentes/CSS
reales y esos datos verifican 320, 390, 768, 1280 y 1440 px y modo oscuro.

Este cambio requiere publicar tanto los adaptadores/contrato de WholeSale como
el CRM para que las búsquedas nuevas incluyan el detalle. La vista previa local
no constituye un despliegue ni una prueba autenticada de producción.
