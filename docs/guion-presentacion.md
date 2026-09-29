# Guion de presentación: Gestor de vacaciones

Pensado para una videollamada o un vídeo de **15 a 20 minutos**. En cada bloque tienes
**lo que dices** (en cursiva, para leerlo o adaptarlo) y **lo que enseñas en pantalla**.
Al final hay una lista con todas las funciones para que no se te escape nada, las preguntas
que te pueden hacer con sus respuestas y los siguientes pasos para cerrar.

---

## 0. Preparación (el día antes)

Hazlo todo antes de la llamada, para que en directo no haya que esperar ni improvisar.

1. **Arranca la aplicación con datos limpios**, en otra carpeta de datos para no mezclarlos con tus pruebas:
   ```bash
   npm run build
   DATA_DIR=./demo npm start
   ```
   En Windows, con PowerShell: `$env:DATA_DIR="./demo"; npm start`.
   Abre `http://localhost:3000`. Debe salir el banner amarillo «¡Bienvenido!».
2. **Ensaya la importación** con `samples/ejemplo-optica.xlsx`. Luego borra la carpeta `demo`
   para que en la llamada la importación se haga en directo, desde cero. Es el momento que más impresiona.
3. **Ten abiertos en Excel** `ejemplo-optica.xlsx` y `cuadrante-colores.xlsx`, para enseñar
   «esto es lo que tenéis hoy» antes de entrar en la aplicación.
4. **Ten preparado el móvil** conectado a la misma wifi que el ordenador, para abrir
   `http://IP-de-tu-ordenador:3000`. La IP la ves con `ipconfig` en Windows o `ifconfig` en Mac.
5. **La pantalla:**
   - navegador a pantalla completa y zoom al 110 %;
   - pestañas y notificaciones cerradas;
   - modo claro, que en vídeo se ve mejor.
6. **Ten a mano el PIN de responsable**, que es `1234`.
7. **Si es un vídeo grabado:** grábalo por bloques y únelos después; si te equivocas, repites
   solo ese bloque. OBS o la grabación de pantalla de Windows (Win+Alt+R) o de Mac (Cmd+Shift+5) sirven.

---

## 1. Apertura (1 minuto)

> *«Gracias por tu tiempo. Te quiero enseñar una herramienta que he hecho para organizar las
> vacaciones del equipo. Hoy lo lleváis con un Excel. Funciona, pero seguro que conoces sus problemas:
> una sola persona lo actualiza, nadie sabe si puede pedir unos días sin preguntar, y en verano
> hay que mirar con lupa que no se quede una tienda sin gente.»*

> *«Lo importante: no hay que cambiar nada de cómo trabajáis. Cogemos vuestro Excel tal cual,
> lo subimos y en un minuto está todo dentro. Te lo enseño.»*

**Pantalla:** abre el Excel `ejemplo-optica.xlsx` y enséñalo unos segundos.
- Hay una hoja por mes, una fila por persona y letras V, AP, B y F.
- Una persona (Sergio, en agosto) marca pintando las celdas en amarillo en vez de escribir la letra.

> *«Esto es lo típico: cada uno lo marca a su manera. Letras, colores… Da igual.»*

---

## 2. Importar el Excel en directo (3 minutos). El momento clave

**Pantalla:** la aplicación vacía, con el banner amarillo «¡Bienvenido! Empieza con el Excel que ya tenéis».

> *«Esta es la aplicación recién instalada, sin nada. Con los colores de Óptica Universitaria.»*

1. Pulsa **«Soy responsable»** y pon el PIN `1234`.
   > *«Hay dos niveles. Todo el equipo puede ver el calendario y pedir días. Aprobar, importar
   > o cambiar ajustes solo lo puede hacer el responsable, con su PIN.»*
2. Pulsa **Importar Excel** y arrastra el fichero.
3. Explica la pantalla **«Revisar importación»** de arriba abajo:
   - **1 · Hojas detectadas.** *«Ha encontrado las 12 hojas, una por mes, y ha sacado el mes y el año
     del título de cada hoja.»*
   - **2 · ¿Qué significa cada marca?** *«Ha encontrado las letras V, AP, B y F y ya propone qué es cada una. Fíjate:
     también ha detectado el **amarillo** que usa Sergio y pregunta qué significa. Le digo que son
     vacaciones.»*
     - Cambia el color amarillo a «Vacaciones» si no viene ya.
     - Menciona que los domingos grises y los festivos rosas los ignora solo.
   - **3 · Personas y periodos.** *«Aquí ves a cada persona con sus periodos ya agrupados. Si alguien
     tiene del 27 de julio al 7 de agosto, aunque esté en dos hojas distintas, lo junta en un
     solo periodo. La fila de la leyenda la ha detectado y viene desmarcada para que no se cuele.»*
   - Enseña que ha creado las **3 tiendas** a partir de la columna «Tienda».
4. Pulsa **Importar** y verás «¡Importación completada!».
   > *«Ya está. 14 personas, 3 tiendas y todo el año. Nadie ha tenido que teclear nada.»*

**Si pregunta «¿y si nuestro Excel es distinto?»:** importa también `cuadrante-colores.xlsx`
(ver la sección 8). Así ve que entiende más de un formato.

---

## 3. El calendario del equipo (3 minutos)

**Pantalla:** Calendario. Ve a **agosto 2026** con la flecha ‹ ›.

> *«Esta es la pantalla principal. Todo el equipo, agrupado por tienda. Cada barra es una ausencia,
> con su color según el tipo.»*

Enséñalo en este orden:

- **Colores por tipo:** vacaciones en azul, asuntos propios en morado, baja en rojo y formación en
  naranja. La leyenda está abajo.
- **Domingos y festivos** sombreados. El 15 de agosto sale en rosa porque es festivo nacional.
- **Fila de cada tienda con números:** *«Esto es cuántas personas quedan trabajando ese día en esa tienda.»*
- **Los tres indicadores de arriba:**
  - personas fuera hoy;
  - solicitudes pendientes;
  - días sin cobertura mínima este mes.
- **Al lado de cada nombre, los días que le quedan** a esa persona este año. Pasa el ratón por
  encima y lo dice.
- **Buscador y filtro por tienda**, arriba a la derecha: escribe «Marta» y luego filtra por «Gràcia».
- **Pulsa una barra** para ver el detalle de esa ausencia.
- **«Hoy»** te devuelve al mes actual.

### Cobertura mínima: la función estrella para una óptica

> *«En una óptica no puede quedarse una tienda sin optometrista o con una sola persona. Le digo
> a la aplicación el mínimo de gente de cada tienda…»*

1. Ve a **Equipo**, edita la tienda **Gràcia** y pon **mínimo 3**. Guarda.
2. Vuelve al **Calendario**, en agosto.
   > *«…y automáticamente me marca en rojo los días en que Gràcia se queda con 2 personas. Del
   > 17 al 28 de agosto. Eso con el Excel no lo ves hasta que te das cuenta en la tienda.»*
3. Enseña que el indicador «días sin cobertura mínima» ha subido.

---

## 4. Pedir vacaciones como empleado (2 minutos)

> *«Ahora me pongo en el lugar de un empleado.»*

1. Sal del modo responsable con el botón de abajo a la izquierda, **«Salir»**.
2. **Arrastra con el ratón** sobre la fila de **Elena Castro** (Gràcia) del **17 al 21 de agosto**.
   > *«Arrastro sobre mis días y ya está.»*
3. En la ventana que se abre, enseña:
   - **Tipo** (vacaciones, asuntos propios…) y **nota opcional**.
   - **Cuántos días gasta y cuántos le quedan.**
   - **«Cobertura insuficiente»** en rojo: *«Antes de pedirlo ya ve que su tienda se quedaría corta.»*
   - **«Compañeros de su tienda fuera esos días»:** Marta y Pau.
   > *«El empleado ya sabe, antes de pedir, si le van a decir que no. Se ahorran conversaciones.»*
4. **Enviar solicitud.** Aparece **rayada**, porque está pendiente.
5. Haz otra solicitud **sin conflictos**: Laura Fernández (Diagonal), del **5 al 9 de octubre**.
   Enseña el mensaje **«Nadie. ¡Vía libre!»** y envíala.
6. Intenta pedir días que **se solapan** con otra ausencia de la misma persona. La aplicación no lo permite.

---

## 5. Aprobar o rechazar como responsable (2 minutos)

1. Entra otra vez con el PIN. Enseña el **número rojo** junto a «Solicitudes» en el menú.
2. Ve a **Solicitudes**.
   > *«Aquí el responsable tiene todo delante para decidir: quién más falta esos días, si la tienda
   > se queda corta y cuántos días le quedan a la persona.»*
3. En la de Elena, enseña el aviso de cobertura y **Rechazar**.
4. En la de Laura, verás **«Sin conflictos»**; pulsa **Aprobar**.
   - La barra deja de estar rayada en el calendario.
   - En **«Decididas recientemente»** queda el historial.
5. Menciona que el responsable también puede **añadir ausencias directamente**, que quedan
   aprobadas: una baja, una formación…
   Y que puede **editar o borrar** cualquier ausencia pulsando sobre ella.

---

## 6. Vista anual (1 minuto)

**Pantalla:** Vista anual.

> *«Para planificar el verano o la Navidad: el año entero de un vistazo. Cuanto más intenso el
> color, más gente fuera ese día.»*

- Enseña cómo **agosto** destaca, y que te indica el **día con más ausencias**.
- Los días con **borde rojo** son los que no llegan al mínimo de su tienda.
- En el selector de arriba a la derecha:
  - elige **una tienda**, para ver solo la suya;
  - elige **una persona**, para ver su año con los colores de cada tipo.
- Pulsa el **nombre de un mes** para saltar a ese mes en el calendario.

---

## 7. Equipo y saldos (1,5 minutos)

**Pantalla:** Equipo.

- **Cada persona con su barra de días:** gastados, pendientes y restantes. Arriba se elige el año.
- **Días al año por persona:** edita a alguien y pon, por ejemplo, 25 días.
  > *«Si alguien tiene más días por antigüedad o por contrato, se pone aquí; si no, usa el valor general.»*
- **Activa / inactiva:** *«Si alguien deja la empresa, se desactiva y no se pierde su historial.»*
- **Añadir persona**, asignarle una tienda y un color.
- **Tiendas:** añadir o renombrar tiendas y fijar el **mínimo de personas** de cada una.
- **Solo cuentan para el saldo las vacaciones.** Asuntos propios, bajas y formación no descuentan días.

---

## 7 bis. Horarios, turnos y sábados (2 minutos)

> *«Esto lo hemos añadido a partir de lo que nos contó el equipo: turnos de mañana, tarde y
> partido, horarios rotativos y el límite de sábados.»*

1. En **Ajustes → Horarios** enseña los tres horarios que vienen creados:
   - **Mañana**: de lunes a viernes, con un día de jornada partida; el sábado no se trabaja.
   - **Tarde**: de lunes a viernes de tarde, y el sábado.
   - **Sábados**: solo los sábados.
   > *«Cada día se cambia con un clic, y se pueden crear o duplicar todos los horarios que haga falta.»*
2. En **Equipo**, edita a una persona y ponle un horario **rotativo** (Tarde ⇄ Mañana).
   Enseña la **vista previa de esta semana y la próxima**:
   > *«Marco qué le toca esta semana y la aplicación calcula sola las siguientes.»*

   Haz clic en un día de la vista previa (por ejemplo, el lunes) para cambiarlo de mañana a tarde:
   > *«Si un día concreto alguien cambia el turno, se toca aquí con un clic, sin tocar su horario. Queda marcado con un punto.»*

   Enseña también el **día de jornada partida** de esa persona (por ejemplo, el lunes) y cómo cambia en la vista previa.
   Después asigna a alguien el horario **Sábados**: sus días de vacaciones pasan a **4** solos.
3. En el **Calendario**, filtra una tienda:
   - cada día sale la letra del turno (M, T o P), y los días que no trabaja salen rayados;
   - la fila de la tienda muestra **dos números: mañana arriba y tarde abajo**. El mínimo se comprueba en cada turno:
   > *«No basta con que haya 3 personas en la tienda: tiene que haber gente por la mañana y por la tarde.»*
4. **Sábados:** sin PIN, pide para alguien de tarde una semana de lunes a sábado cuando ya ha gastado sus 2 sábados.
   Sale el aviso **«Se pasa de los sábados de vacaciones»** y no deja enviarla.
   > *«La regla de los 21 + 2 la aplica la aplicación sola. Como responsable puedes hacer una excepción.»*
5. En **Equipo** enseña la columna **Sábados** (por ejemplo, 1/2) y la columna **Horario**.

---

## 8. Ajustes (1,5 minutos)

**Pantalla:** Ajustes.

- **Nombre de la empresa**, que aparece arriba a la izquierda.
- **Días de vacaciones al año** por defecto, que empieza en 23.
- **Cómo se cuentan: laborables o naturales.**
  > *«Si en vuestro convenio son días naturales, se cambia aquí y se recalcula todo.»*
- **Días que se trabaja:** de lunes a sábado por defecto, porque las ópticas abren los sábados. Se puede cambiar.
- **Festivos:**
  - los nacionales se añaden **con un clic**, y Semana Santa se calcula sola cada año;
  - los locales o autonómicos se añaden a mano. Ejemplo en directo: **«La Mercè», 24 de septiembre**.
  > *«Los festivos no cuentan como días gastados.»*
- **Exportar a Excel:** pulsa y abre el fichero. Tiene:
  - una hoja «Resumen» con los saldos de cada persona;
  - un «Listado» de todas las ausencias;
  - **un cuadrante por mes con colores**, como el que tenían.
  > *«Si un día queréis volver al Excel, o la gestoría os lo pide, lo tenéis en un clic. No os quedáis atrapados.»*
- **Copia de seguridad:** descargar y restaurar.
  > *«Además, cada día se hace una copia automática y se guardan las de los últimos 30 días.»*
- **Cambiar el PIN de responsable.**

---

## 9. En el móvil (1 minuto)

**Pantalla:** el móvil (compártelo en la llamada o enséñalo a cámara).

> *«Y todo esto funciona en el móvil. Cualquiera puede mirar desde el sofá si puede pedir un
> puente, y pedirlo ahí mismo.»*

- En el móvil el menú está abajo, como en una app.
- **Modo oscuro automático** si el móvil lo tiene activado.
- **Se actualiza sola:** aprueba una solicitud en el ordenador y a los pocos segundos aparece en
  el móvil. La aplicación comprueba si hay cambios cada 30 segundos.

---

## 10. Cierre (1 minuto)

> *«Resumiendo:*
> - *empezáis el primer día con vuestro Excel, sin reescribir nada;*
> - *cada empleado ve sus días y los pide sin molestar a nadie;*
> - *el responsable aprueba con toda la información delante;*
> - *y la aplicación avisa sola cuando una tienda se queda corta.*
>
> *Y si algún día queréis salir, os lleváis los datos a Excel en un clic.»*

> *«Mi propuesta es que lo probéis un mes en una tienda, o en todas, con vuestro Excel real.
> Yo me encargo de instalarlo y dejarlo funcionando. ¿Qué te parece?»*

Después **calla y deja que hable**. Apunta todo lo que pida: son las mejoras de la versión siguiente.

---

## Lista completa de funciones (para no olvidar nada)

**Importar Excel**
- [ ] Ficheros .xlsx, .xlsm y .csv. Los .xls antiguos hay que guardarlos antes como .xlsx.
- [ ] Detecta solo el formato:
  - cuadrante por meses (una hoja por mes, varios meses en una hoja o el año en horizontal);
  - cuadrante traspuesto;
  - listado con columnas Desde/Hasta;
  - una hoja por tienda.
- [ ] Entiende letras (V, VAC, AP, B, F, X…) y **celdas pintadas**, incluidos los colores del tema de Office.
- [ ] Ignora los fines de semana y festivos sombreados.
- [ ] Saca el mes y el año del nombre de la hoja o del título.
- [ ] Pregunta qué es cada marca y viene con una propuesta rellenada.
- [ ] Desmarca solas las filas de totales y leyendas.
- [ ] Une los días sueltos seguidos en periodos, aunque haya un domingo o un festivo en medio o crucen de mes.
- [ ] Crea las tiendas a partir de una columna «Tienda» o «Centro», o del nombre de las hojas.
- [ ] Se puede volver a importar con «Reemplazar lo importado anteriormente» para no duplicar.

**Calendario**
- [ ] Todo el equipo agrupado por tienda, un mes por pantalla.
- [ ] Barras de colores por tipo; las pendientes, rayadas.
- [ ] Domingos y festivos sombreados.
- [ ] Personas trabajando por tienda y día, en rojo si no se llega al mínimo y en ámbar si pasaría al aprobar las pendientes.
- [ ] Indicadores de personas fuera hoy, solicitudes pendientes y días sin cobertura.
- [ ] Días restantes junto a cada nombre.
- [ ] Buscador y filtro por tienda.
- [ ] Arrastrar para pedir días y pulsar una barra para ver su detalle.

**Solicitudes**
- [ ] Cualquiera pide; queda pendiente.
- [ ] Al pedir se ven los días que gasta y los que le quedan, los compañeros fuera y el aviso de cobertura.
- [ ] No deja solapar dos ausencias de la misma persona.
- [ ] El responsable aprueba o rechaza con toda la información, y queda el historial de decididas.
- [ ] El responsable puede añadir, editar y borrar ausencias directamente.

**Tipos de ausencia**
- [ ] Vacaciones (la única que descuenta días), asuntos propios, baja, formación y otro/libre.

**Vista anual**
- [ ] Mapa de calor de todo el año: equipo entero, una tienda o una persona.
- [ ] Día con más ausencias y días sin cobertura con borde rojo.
- [ ] Pulsar un mes lleva al calendario.

**Horarios y turnos**
- [ ] Horarios semanales con turno de mañana, tarde o partido por día, que se pueden crear, duplicar y borrar.
- [ ] Horario fijo o rotativo por persona (cambia cada semana), con vista previa de 2 semanas y cambios a mano por día.
- [ ] Letra del turno en el calendario y días de descanso rayados.
- [ ] Cobertura mínima por turno (mañana y tarde).
- [ ] Las vacaciones solo descuentan los días que a esa persona le toca trabajar.
- [ ] Límite de sábados de vacaciones al año (2 por defecto): bloquea al empleado y avisa al responsable.

**Equipo**
- [ ] Saldos por persona y año: gastados, pendientes y restantes.
- [ ] Días al año personalizados por persona.
- [ ] Personas activas o inactivas, con color y tienda.
- [ ] Tiendas con su mínimo de personas.

**Ajustes**
- [ ] Nombre de empresa y días por defecto.
- [ ] Días laborables o naturales, y qué días se trabaja.
- [ ] Festivos nacionales en un clic (con Semana Santa calculada) y festivos locales a mano.
- [ ] Cambiar el PIN.

**Datos y seguridad**
- [ ] Exportar a Excel: resumen, listado y cuadrante mensual con colores. El export se puede volver a importar.
- [ ] Copia automática diaria (se guardan 30) y descarga o restauración manual.
- [ ] Los datos se quedan en su ordenador o servidor, sin depender de terceros.

**General**
- [ ] Colores de la marca, con modo claro y oscuro automáticos.
- [ ] Funciona en el móvil.
- [ ] Se actualiza sola cada 30 segundos en todos los dispositivos.

---

## Preguntas que te pueden hacer (y qué responder)

Responde siempre con la verdad. Si algo no está, di «eso se puede añadir» y apúntalo.

**«¿Cada empleado tiene su usuario y contraseña?»**
Ahora no. Todos ven el calendario y piden días, y las acciones de responsable van con PIN. Es
sencillo a propósito, para que nadie tenga que acordarse de otra contraseña. Si lo necesitan,
se añaden usuarios individuales. Esa sería la mejora número uno.

**«¿Llega un aviso por email o WhatsApp cuando alguien pide días?»**
Ahora no: el aviso es el número rojo en «Solicitudes». Avisos por email se pueden añadir.

**«¿Dónde se guardan los datos? ¿Es seguro?»**
En un fichero en el ordenador o servidor donde se instale, con una copia diaria automática.
No se envían a ningún sitio externo. Si se publica en internet, se pone con HTTPS y acceso restringido.

**«¿Qué necesitamos para instalarlo?»**
Hay dos opciones:
- un ordenador de la tienda siempre encendido, y los demás entran por el navegador desde la misma red;
- un servidor en la nube, más cómodo si hay varias tiendas o se quiere usar desde casa.

Tú te encargas de instalarlo. En la nube cuesta pocos euros al mes de alojamiento.

**«¿Y si tenemos 100 tiendas?»**
El filtro por tienda y la vista por tienda ya están pensados para eso. Para una implantación en
toda la cadena habría que hablar de usuarios por tienda y responsables por tienda (ver la mejora de arriba).

**«¿Se conecta con nóminas o con nuestro programa de RR. HH.?»**
Ahora no, pero exporta a Excel, que casi cualquier programa o gestoría acepta. Una integración se estudia.

**«¿Y si nuestro Excel es diferente al que has enseñado?»**
Entiende los formatos más habituales. Propón: «Pásame vuestro Excel real, con los datos que
queráis, y te enseño cómo queda importado.» Esto es un cierre muy potente.

**«¿Cuenta los sábados?»**
Sí: por defecto se trabaja de lunes a sábado. Se cambia en Ajustes, igual que elegir días naturales o laborables.

**«¿Guarda los años anteriores?»**
Sí. Todo queda guardado y los saldos se ven por año.

---

## Siguientes pasos para cerrar

1. **Pídele su Excel real** y enséñale el resultado en 24 horas. Nada convence más que ver sus propios datos.
2. **Ofrece una prueba de un mes** sin compromiso, en una o en todas las tiendas.
3. **Lleva pensado cómo cobrarlo.** Por ejemplo:
   - una cuota de instalación y puesta en marcha;
   - una cuota mensual pequeña por alojamiento, copias de seguridad y soporte;
   - o un precio cerrado por las mejoras que pida (usuarios, emails…).
4. **Apunta cada petición** que haga durante la llamada y confírmalas por escrito después, con
   lo que entra en el precio y lo que sería un extra.
5. **Antes de enseñarlo** a la central de la marca o de usarlo con su nombre fuera de la tienda,
   confirma con ellos el uso de los colores y el nombre de Óptica Universitaria.
