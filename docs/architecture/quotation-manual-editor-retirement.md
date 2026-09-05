# Retiro del cotizador manual del CRM

Se eliminan Nueva, Subir y Editar servicios y opciones del detalle del lead,
el formulario manual y sus endpoints exclusivos de costos y carga de capturas.
El detalle ya no expone PATCH para editar encabezado, opciones o servicios.
La migración retira las dos RPC exclusivas de esa edición, sin borrar datos.

Cotizar sigue abriendo Emilia. Ante falta de acceso o error de conexión se informa
el problema y se permite reintentar; ya no existe una alternativa manual.

POST /api/quotations sigue siendo usado por Emilia. Se mantienen sus validaciones,
persistencia compartida y los endpoints de precios, documentos, consulta,
conversión y eliminación. Los adjuntos anteriores se pueden consultar y eliminar;
el upload genérico del lead rechaza el tipo QUOTATION antes de subir a Storage.
La carga de otros documentos del lead permanece disponible.

Las migraciones históricas conservan el historial del schema. Aplicar la nueva
migración al publicar. Los tipos eliminan únicamente las firmas de las dos RPC
retiradas; el resto del schema permanece intacto.
