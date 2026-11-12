# Lorax ticket tracker: registro de gastos con tickets

## Objetivo

Crear una app web para telefono que permita fotografiar tickets, registrar
gastos y consultar graficas, sin instalar una aplicacion ni crear una cuenta.
Todo el procesamiento y almacenamiento se realizara en el dispositivo.

**Alcance actualizado:** Android solamente, sin publicar la app ni ejecutar un
servidor. Se entrega un HTML autonomo experimental con OCR incluido. El usuario
acepto respaldo/restauracion manual si Chrome impide conservar datos entre
sesiones. La variante web original se conserva como alternativa, no como
requisito para usar el archivo local.

## Requisitos acordados

- Abrir el archivo `lorax-ticket-tracker.html` en Chrome de Android, sin ZIP,
  instalacion, sitio web ni servidor.
- Datos independientes por telefono, navegador y origen de la app.
- Sin cuentas, sincronizacion, base de datos remota ni APIs de procesamiento.
- Fotos, OCR, clasificacion, filtros, graficas y CSV procesados localmente.
- Funcionamiento sin conexion con todos los recursos y el modelo OCR incluidos
  en el propio HTML.
- Intentar IndexedDB; si el archivo no tiene acceso, mostrar modo temporal de
  forma permanente y permitir respaldo/restauracion completa en JSON.
- No prometer que Chrome conserve el almacenamiento de un archivo al moverlo,
  renombrarlo o volver a abrirlo mediante otro proveedor de archivos.
- Interfaz en espanol, adaptada a pantallas pequenas.

## Flujo principal

1. Abrir la app y seleccionar "Nuevo gasto".
2. Tomar una foto o seleccionar una imagen de la galeria.
3. Ejecutar OCR local e intentar identificar comercio, fecha e importe total.
4. Sugerir una categoria usando reglas locales.
5. Mostrar los datos para revision y permitir corregirlos.
6. Guardar el gasto y su foto en el navegador.
7. Actualizar historial, totales y graficas.

La captura manual estara disponible aunque el OCR falle. Ningun resultado del
OCR se guardara automaticamente sin confirmacion.

## Alcance de la primera version

### Registro e historial

- Crear, editar y eliminar gastos.
- Foto del ticket opcional para permitir captura manual.
- Campos: identificador, fecha del gasto, comercio, importe, moneda, categoria,
  notas opcionales y fecha de creacion.
- Asociar la foto al gasto cuando exista.
- Guardar importes en unidades menores de la moneda para evitar errores de
  redondeo al sumar.
- Clasificar el ticket completo, no cada producto.
- Categorias iniciales: gasolina, super, restaurantes, transporte, servicios,
  salud, compras, entretenimiento y otros.
- Usar "otros" cuando no haya una sugerencia fiable.

### Periodos y filtros

Un selector compartido controlara el historial, los totales y las graficas.

| Periodo | Definicion |
| --- | --- |
| Mensual | Mes calendario seleccionado; mes actual por defecto |
| Ultimos 7 dias | Hoy y los 6 dias anteriores |
| Ultimos 28 dias | Hoy y los 27 dias anteriores |
| Ultimos 90 dias | Hoy y los 89 dias anteriores |

- Permitir seleccionar meses anteriores en la vista mensual.
- Incluir filtros por categoria y busqueda por comercio.
- Combinar filtros y aplicarlos tambien a la exportacion del periodo.
- Calcular periodos con fechas calendario locales, no con bloques de 24 horas.
- Usar la fecha del gasto, no la fecha de captura del ticket.
- Incluir ambos extremos del intervalo.

### Resumen y graficas

- Total gastado y numero de gastos del periodo filtrado.
- Grafica de distribucion del gasto por categoria.
- Grafica de evolucion diaria, incluyendo dias sin gastos.
- Mostrar un estado vacio claro cuando no existan registros.

### Exportacion a CSV

- Ofrecer exportacion de todos los gastos o de la seleccion filtrada.
- Columnas: fecha, comercio, categoria, importe, moneda y notas.
- Generar y descargar el archivo exclusivamente en el navegador.
- Usar UTF-8 y escapar separadores, comillas y saltos de linea correctamente.
- Evitar que textos del usuario se interpreten como formulas en hojas de calculo.
- Aclarar que el CSV no incluye fotos ni constituye un respaldo completo.

### Importacion de CSV

- Importar los CSV exportados por Lorax o por la version anterior.
- Validar todas las filas antes de guardar; un error no modifica los gastos.
- Agregar los registros sin borrar los actuales, previa confirmacion.
- Advertir que importar el mismo archivo nuevamente duplica sus registros.
- Admitir UTF-8, comillas escapadas, comas y saltos de linea dentro de campos.
- Limitar la importacion a 5 MB y 10,000 gastos por archivo.
- Conservar respaldo/restauracion JSON para recuperar tambien las fotos.

### Respaldo y restauracion completos

- Descargar un JSON con todos los gastos y fotos, sin cifrar y sin subir datos.
- Restaurar solo respaldos compatibles y validados, de hasta 100 MB.
- Advertir y pedir confirmacion antes de reemplazar los gastos actuales.
- Reemplazar los registros en una sola transaccion; conservar los datos
  anteriores si falla la escritura.
- Ofrecer respaldo y restauracion tambien en modo temporal sin IndexedDB.
- Advertir que el HTML original no se modifica al guardar y que el respaldo
  debe descargarse y verificarse antes de cerrar.

## Arquitectura propuesta

- Salida principal: un HTML con interfaz, estilos, scripts, icono, worker,
  WebAssembly y modelo OCR embebidos; no necesita recursos vecinos.
- Variante web conservada: frontend estatico servido por HTTPS, sin backend.
- IndexedDB para gastos y fotos; no usar localStorage para las imagenes.
- Motor OCR ejecutado mediante WebAssembly en un worker Blob. El archivo
  portatil proporciona el modelo desde sus propios bytes, sin peticiones
  de red ni lectura de archivos vecinos.
- Reglas locales para sugerir categorias a partir del comercio y texto leido.
- Service worker solo para la variante web; el HTML portatil no lo necesita.
- Sin fuentes, scripts, modelos, analitica ni otros recursos de terceros
  solicitados durante el uso.
- Las fotos y los datos de gastos nunca se enviaran por la red.

El archivo portatil se debe transferir al telefono una vez; no requiere
conexion para ejecutarse. Solo la variante web necesita una primera carga
con conexion. No se exigira instalacion.

## Pantallas

1. **Inicio:** selector de periodo, filtros, resumen, graficas y acceso a captura.
2. **Nuevo gasto / editar:** foto, estado del OCR y formulario de revision.
3. **Historial:** lista filtrada y acciones para consultar, editar o eliminar.
4. **Datos:** CSV, respaldo/restauracion con fotos, estado del almacenamiento
   y advertencias.

## Limitaciones y proteccion de datos

- El almacenamiento pertenece al origen y al perfil del navegador, no al
  telefono de forma global. Otro navegador no vera los mismos gastos.
- Cambiar la direccion de la app puede dejar inaccesibles los datos anteriores.
- Borrar datos del sitio, perder el telefono o la limpieza del navegador puede
  causar perdida de registros y fotos.
- No mostrar opciones tecnicas de almacenamiento en la interfaz. Mantener
  avisos claros cuando no sea posible guardar o exista riesgo de perder datos.
- Manejar falta de espacio y errores al guardar sin mostrar exito falso.
- Informar que el modo privado no es adecuado para conservar gastos.
- La precision y velocidad del OCR dependen del telefono y de la foto.
- No prometer resultados fiables para todos los formatos de ticket.
- Android puede abrir HTML como `content://` o en un visor que no ejecute
  JavaScript; la apertura en Chrome debe validarse en el telefono real.
- Los avisos al cerrar una pestana no estan garantizados en Android. El aviso
  de respaldar permanece visible; no depender solo de `beforeunload`.

## Etapas de implementacion

1. **Base local:** interfaz movil, modelo de datos, IndexedDB y captura manual
   con foto; creacion, edicion y eliminacion.
2. **Consulta y exportacion:** periodos, filtros, totales, graficas y CSV.
3. **Lectura automatica:** OCR local, extraccion de campos, reglas de categorias
   y revision antes de guardar.
4. **Uso offline y validacion:** cache de app y modelos, disponibilidad offline,
   errores de almacenamiento y pruebas en navegadores moviles.

## Criterios de aceptacion

- Registrar gastos con y sin foto; conservarlos al cerrar y reabrir el navegador.
- Editar y eliminar un gasto y comprobar su efecto en historial y graficas.
- Verificar cada periodo en limites de mes, ano y cambios de horario local.
- Obtener el mismo conjunto de gastos en historial, resumen, graficas y CSV
  cuando se usan los mismos filtros.
- Exportar todos los gastos o solo los filtrados sin incluir fotos.
- Procesar una foto y guardar el gasto en modo avion una vez preparada la app.
- Verificar mediante inspeccion de red que fotos y gastos no salen del telefono.
- Confirmar captura manual cuando el OCR no encuentre datos utilizables.
- Comprobar manejo de almacenamiento lleno o no disponible.
- Abrir el HTML en Chromium sin servidor y sin conexion, leer una foto real
  sintetizada y recuperar sus datos y foto desde un respaldo.
- Forzar denegacion de IndexedDB y verificar aviso temporal, captura y
  restauracion entre sesiones.
- Probar en Chrome de Android fisico, incluyendo apertura desde Archivos,
  captura, descarga de JSON y reapertura; registrar limitaciones reales.

## Decisiones de la primera implementacion

- Moneda confirmada: pesos mexicanos (MXN).
- Nombre: Lorax ticket tracker. Interfaz centrada en gastos, sin mensajes sobre servidores,
  archivos locales ni detalles de arquitectura.
- Mantener el nombre interno de IndexedDB y el formato de respaldo anterior
  para conservar compatibilidad con los datos existentes.
- Frontend: TypeScript, CSS y Vite, sin framework de interfaz.
- Graficas: SVG y CSS locales, sin servicios o bibliotecas externas de graficas.
- OCR: Tesseract.js con modelo en espanol, worker y WebAssembly locales.
- Gastos y fotos en IndexedDB; las fotos se serializan como ArrayBuffer para
  evitar errores de persistencia de Blob en WebKit.
- Fotos redimensionadas localmente a un maximo de 2200 pixeles en su lado mayor
  y guardadas como JPEG; no se conserva el archivo original sin cambios.
- Service worker generado en la compilacion, con cache de todos los recursos
  de la app y del OCR para la variante web. Las actualizaciones requieren
  confirmacion del usuario.

## Ejecucion y pruebas

### Archivo Android autonomo (opcion principal)

```sh
npm ci
npm run build:portable
```

Resultado: `lorax-ticket-tracker.html`, aproximadamente 6.6 MB, con OCR en
espanol incluido. Transferir ese unico archivo a Descargas del telefono y
seleccionar abrir con Chrome; no enviar el ZIP web anterior ni instalar nada.
Si Android solo ofrece un visor o bloquea su ejecucion, registrar esa limitacion:
el comportamiento de `content://` no se puede garantizar desde Chromium de
escritorio.

Antes de cerrar: **Mis datos > Descargar respaldo completo** y comprobar que el
JSON se guardo. Al reabrir, si los gastos no aparecen, usar **Restaurar respaldo**.
El CSV sirve para hojas de calculo; no sustituye al JSON ni incluye fotos.

```sh
npm test
npx playwright install chromium
npm run build:portable
npm run test:portable
```

Las pruebas portatiles no arrancan un servidor: abren el HTML mediante `file://`
en Chromium con viewport Android y la red deshabilitada. Esto no equivale a
probar la apertura `content://` en un telefono fisico.

### Variante web original (opcional)

Requiere Node.js 22.12 o posterior dentro de la rama 22, o una version mas nueva
compatible con Vite.

```sh
npm ci
npm run dev
```

La preparacion de los recursos OCR se ejecuta automaticamente antes de iniciar
desarrollo o compilar. El modo offline se habilita en la compilacion de
produccion, no en el servidor de desarrollo:

```sh
npm run build
npm run preview
```

Solo para la variante web, publicar el contenido
de `dist/` en un sitio HTTPS en la raiz del dominio. `localhost` permite las
pruebas locales, pero abrir la IP de una computadora mediante HTTP desde un
telefono no ofrece el mismo contexto seguro. Mantener el mismo origen en
futuras publicaciones para conservar el acceso a los gastos.

```sh
npm test
TZ=America/Los_Angeles npm test
npx playwright install chromium webkit
npm run build
npm run test:e2e
```

- 94 pruebas unitarias: periodos, horario de verano, filtros, centavos, CSV,
  tickets, transacciones, respaldo, validacion y modo temporal.
- 4 pruebas de extremo a extremo en Chromium y WebKit con viewport movil:
  captura, edicion, eliminacion, persistencia, filtros y descarga CSV.
- Las pruebas de extremo a extremo incluyen OCR real de un ticket sintetico
  sin conexion, persistencia de su foto y ausencia de peticiones a terceros.
- 3 pruebas portatiles sin servidor: OCR embebido, reapertura del archivo,
  recuperacion de fotos, ausencia de peticiones HTTP y de archivos vecinos,
  modo temporal y restauracion valida/no destructiva ante archivos invalidos.
- Verificacion de marca Lorax, ausencia de opciones tecnicas de almacenamiento
  e importacion CSV sin borrar gastos actuales.
- Pruebas adicionales con las nueve fotos proporcionadas (seis imagenes
  distintas de tres tickets): importe y fecha esperados, sin acceso a red.
  Las fotos personales no se incluyen en Git y estas pruebas se omiten cuando
  las muestras no estan disponibles.
- OCR con reorientacion por cuartos de vuelta, segunda segmentacion para
  recuperar fechas y lectura de separadores decimales confundidos con dos puntos.
- Excluir comisiones al buscar el pago total; mantener revision manual para
  depositos y pagos bancarios que no necesariamente representan consumo.
- Compilacion y verificacion de tipos completadas.
- Pendiente la validacion con camaras y tickets reales en telefonos fisicos;
  la emulacion de navegador no sustituye esas pruebas.

## Fuera del alcance inicial

- Cuentas, nube, sincronizacion y colaboracion entre telefonos.
- Conexion con bancos o facturacion fiscal.
- Division de un ticket entre varias categorias por producto.
- Conversion entre monedas.
- Deteccion automatica de tickets duplicados, presupuestos y gastos recurrentes.
