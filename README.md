# Gestor de vacaciones del equipo

Aplicación web para organizar las vacaciones y ausencias de un equipo con varias tiendas.
Se hizo pensando en Óptica Universitaria, que hoy lo gestiona con un Excel, y **puede
empezar a usarse importando ese mismo Excel tal cual**, sin tener que rehacer nada.

## Qué hace

- **Calendario mensual** con todo el equipo agrupado por tienda. Las ausencias se ven como
  barras de color y las pendientes, rayadas. Para pedir días basta con arrastrar sobre la
  fila de una persona.
- **Cobertura por tienda**: cada tienda tiene un mínimo de personas trabajando. Cada día
  muestra cuántas quedan y se marca en rojo si no se llega al mínimo (y en ámbar si pasaría
  al aprobar las pendientes).
- **Solicitudes y aprobación**: cualquiera puede pedir vacaciones, que quedan *pendientes*.
  El responsable las aprueba o las rechaza viendo antes quién más falta esas fechas, si la
  tienda se queda corta y cuántos días le quedan a esa persona.
- **Saldos**: días por año (general o por persona), días aprobados, pendientes y restantes,
  contados en días laborables o naturales. Los domingos y festivos no cuentan.
- **Vista anual**: mapa de calor para ver de un vistazo cómo queda repartido el verano o la
  Navidad, del equipo entero, de una tienda o de una persona.
- **Festivos**: los nacionales se añaden con un clic; los autonómicos y locales, a mano.
- **Exportar a Excel**: resumen de saldos, listado y un cuadrante por mes con colores.
- **Copias de seguridad**: una copia automática al día y descarga o restauración manual.
- Se puede usar desde el móvil.

## Importar el Excel actual

En **Importar Excel** se sube el fichero (.xlsx o .csv) y la aplicación detecta sola el
formato. Entiende los formatos más habituales:

| Formato | Ejemplo |
| --- | --- |
| Cuadrante: una fila por persona, una columna por día | Una hoja por mes, varios meses en una hoja o el año entero en horizontal. Los días pueden ser `1, 2, 3…` o fechas. El mes se saca del nombre de la hoja o de un título como «JULIO 2026». |
| Marcas con letras | `V`, `VAC`, `AP`, `B`, `F`, `X`… |
| Marcas con colores | Celdas pintadas (también con colores del tema de Office). Las columnas sombreadas enteras, como los fines de semana, no cuentan como marca. |
| Cuadrante traspuesto | Una fila por día y una columna por persona. |
| Listado | Columnas como `Nombre`, `Desde`/`Hasta` (o `Fecha inicio`/`Fecha fin`, `Salida`/`Regreso`), y opcionalmente `Tipo`, `Tienda`/`Centro`, `Estado` y `Observaciones`. |
| Una hoja por tienda | Se ofrece usar el nombre de cada hoja como tienda. |

Antes de guardar nada se muestra un resumen para revisarlo:

1. Qué hojas se importan.
2. **Qué significa cada marca o color** (vacaciones, asuntos propios, baja, formación, otro,
   o ignorarla). Viene rellenado con una propuesta.
3. Qué filas son personas: las filas de totales o de leyenda salen ya desmarcadas.
4. Una vista previa de los periodos de cada persona. Los días sueltos seguidos se unen en
   periodos, aunque haya un fin de semana o un festivo en medio.

Se puede volver a importar el Excel más adelante: la opción «Reemplazar lo importado
anteriormente» evita que se dupliquen los datos.

Los ficheros `.xls` antiguos hay que abrirlos antes en Excel y guardarlos como `.xlsx`.

En la carpeta [`samples/`](samples/) hay Excels de ejemplo con cada formato para probarlo.

## Puesta en marcha

Hace falta [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run build      # compila la web
npm start          # http://localhost:3000
```

- El **PIN de responsable** inicial es `1234`. Cámbialo en *Ajustes* nada más empezar, o
  arranca con `ADMIN_PIN=xxxx npm start` la primera vez.
- Los datos se guardan en `data/db.json`, con copias diarias en `data/backups/`. Se puede
  cambiar la carpeta con `DATA_DIR=/ruta`. Para hacer una copia basta con copiar esa carpeta.
- Para cambiar el puerto: `PORT=8080 npm start`.

Para que lo use todo el equipo hay dos opciones sencillas:

- **En un ordenador de la óptica** que esté siempre encendido: los demás entran desde el
  navegador con `http://IP-del-ordenador:3000` dentro de la misma red.
- **En un servidor en la nube** (Render, Railway, Fly.io, un VPS…) con el `Dockerfile`
  incluido. En ese caso conviene ponerlo detrás de HTTPS y montar un volumen persistente
  en `/app/data`.

## Desarrollo

```bash
npm run dev        # API en :3000 y web con recarga automática en :5173
npm test           # pruebas (importador, cálculos y API)
npm run typecheck
npm run samples    # regenera los Excels de ejemplo
```

Estructura:

- `shared/`: lógica común a servidor y navegador, con los tipos, las fechas y festivos, los
  saldos y la cobertura, y **el analizador de Excel** (`importer.ts`).
- `server/`: API con Express, almacenamiento en JSON, lectura de Excel (`exceljs`) y
  exportación.
- `src/`: interfaz en React, con las vistas de calendario, vista anual, solicitudes, equipo,
  importación y ajustes.
- `tests/`: pruebas con Vitest, que incluyen la importación de cada formato de ejemplo y la
  exportación e importación de ida y vuelta.

## Limitaciones conocidas

- El acceso es sencillo: todos pueden ver el calendario y pedir días, y las acciones de
  responsable piden un PIN. No hay usuarios con contraseña individual. Si se publica en
  internet, conviene protegerlo (VPN, acceso restringido o autenticación del proxy).
- Los colores que vienen de *formato condicional* de Excel no se pueden leer, porque no se
  guardan en la celda. Sí se leen los rellenos normales.
