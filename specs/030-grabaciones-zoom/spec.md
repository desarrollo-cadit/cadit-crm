# Feature Specification: Grabaciones de Zoom — sección central y adjudicación automática a clases

**Feature Branch**: `030-grabaciones-zoom`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Integrar la API de Zoom para traer las grabaciones en la nube de las cuentas de la academia, listarlas en una sección Grabaciones con filtros, copiar/compartir el enlace, y adjudicarlas a la clase que corresponde — automáticamente cuando el horario coincide, o a mano." (requisitos del dueño, 2026-10-08).

**Depende de**: 013 (clases, `recording_url`, `classInstant`), 023/025 (aulas
virtuales = cuentas de Zoom; enlace por cohorte), 012 (capacidades, RLS).
**Retoma**: [018](../018-zoom-automatico/spec.md) — solo la mitad de las
grabaciones; crear reuniones queda fuera (ver Fuera de alcance).

## Por qué esta fase existe

Hoy la grabación de una clase es un **enlace pegado a mano**
(`class_session.recording_url`), por coordinación desde la lista de clases o
por el profesor desde su portal. El circuito real es: termina la clase, Zoom
procesa la grabación, alguien entra a la nube de la cuenta correcta —son 5
cuentas—, busca la reunión por fecha, copia el enlace, busca la cohorte en el
CRM, busca la clase y lo pega. Si nadie lo hace, el alumno que faltó no tiene
grabación, y nadie se entera.

Zoom ya sabe qué se grabó, cuándo y en qué cuenta. El CRM ya sabe qué clase
se dictaba en cada aula a cada hora (023). Cruzar las dos cosas es lo que esta
fase hace — y para lo que no se puede cruzar con certeza, dar una pantalla
donde se resuelve en un clic en vez de en cinco pestañas.

**Lo que NO cambia**: el CRM sigue sin descargar, almacenar ni retransmitir
video (decisión marco de archivos; mismo principio que Vimeo). Una grabación
es un ENLACE a la nube de Zoom. Y sin Zoom configurado, todo el flujo manual
de 013 sigue funcionando exactamente igual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ver todas las grabaciones en un solo lugar (Priority: P1)

Como coordinación quiero ver en una tabla todas las grabaciones en la nube de
todas las cuentas de Zoom de la academia —con aula, fecha, hora, duración,
tema y a qué clase están adjudicadas— y filtrarlas por cuenta/aula y por rango
de fechas, para dejar de entrar a cinco cuentas de Zoom a buscar.

**Why this priority**: es el valor mínimo y autónomo. Aunque la adjudicación
no existiera, tener las grabaciones de las 5 cuentas en una tabla con el
enlace a mano ya elimina la búsqueda manual.

**Independent Test**: con una conexión de Zoom contra el mock con grabaciones
sembradas en dos usuarios, sincronizar y verificar que la tabla las muestra
todas, que los filtros por aula y por fechas recortan la lista correctamente
y que "Copiar enlace" deja en el portapapeles el enlace compartible.

**Acceptance Scenarios**:

1. **Given** dos aulas vinculadas a usuarios de Zoom con 3 y 2 grabaciones, **When** coordinación abre Grabaciones tras una sincronización, **Then** ve 5 filas, más recientes primero, cada una con aula, cuenta, inicio en la zona de la academia, duración, tema de Zoom, estado de adjudicación y acciones.
2. **Given** la tabla con grabaciones de varias aulas, **When** filtra por "Zoom 2" y por la semana pasada, **Then** solo ve las grabaciones de esa aula cuyo inicio cae en ese rango (inclusive, en la zona de la academia).
3. **Given** una grabación, **When** aprieta "Copiar enlace", **Then** el portapapeles contiene el enlace compartible que abre la grabación en Zoom (con el código de acceso embebido cuando Zoom lo provee), y la pantalla confirma la copia.
4. **Given** una grabación, **When** aprieta "Ver", **Then** se abre el enlace de Zoom en una pestaña nueva; el CRM no reproduce ni intermedia el video.
5. **Given** una grabación cuyo enlace requiere código de acceso que Zoom no embebió en el enlace, **When** se muestra la fila, **Then** el código se ve junto al enlace con su propio botón de copiar.
6. **Given** un usuario sin la capacidad de ver grabaciones, **When** navega, **Then** no ve el ítem del menú y la ruta responde 403.

---

### User Story 2 — Adjudicación automática a la clase (Priority: P1)

Como coordinación quiero que, al sincronizar, cada grabación quede adjudicada
sola a la clase que se dictaba en esa aula a esa hora, y que el enlace
aparezca en la clase —para el staff, el profesor y los alumnos— sin que nadie
lo pegue.

**Why this priority**: es lo que elimina el trabajo repetido. Con 41 cohortes
y varias clases por semana, cada grabación pegada a mano es tiempo y un
olvido posible.

**Independent Test**: sembrar en el mock una grabación cuya reunión es la de
una cohorte con una clase real a las 18:30 (zona de la academia) que empezó
a las 18:34; sincronizar; verificar que la clase muestra la grabación en la
lista de clases del staff, en el portal del profesor y en el del alumno.

**Acceptance Scenarios**:

1. **Given** una clase real no cancelada de la cohorte A, con horario 18:30–21:30 y la reunión de la cohorte cuyo número coincide con el de la grabación, **When** llega una grabación que empezó 4 minutos tarde, **Then** queda adjudicada a esa clase, marcada "automática", y la clase ofrece la grabación.
2. **Given** una grabación de la sala personal (PMI) de un aula sin número de reunión de cohorte que coincida, **When** hay exactamente una clase real no cancelada en esa aula dentro de la ventana de tolerancia, **Then** se adjudica a esa clase.
3. **Given** dos clases candidatas igual de válidas (p. ej. dos cohortes chocadas en la misma aula), **When** se sincroniza, **Then** NO se adjudica a ninguna, queda marcada "ambigua" con las candidatas listadas, y aparece destacada para resolver a mano.
4. **Given** ninguna clase candidata (reunión fuera de horario, aula no vinculada, clase solo proyectada), **When** se sincroniza, **Then** queda "sin clase" y no se inventa una adjudicación.
5. **Given** una clase cancelada a esa hora, **When** se sincroniza, **Then** la clase cancelada no es candidata.
6. **Given** una clase que ya tiene un enlace de grabación pegado a mano, **When** llega una grabación que coincide, **Then** la adjudicación automática NO pisa el enlace manual; la grabación queda marcada "en conflicto" con esa clase para que coordinación decida.
7. **Given** la misma sincronización corrida dos veces, **When** termina la segunda, **Then** no hay filas duplicadas ni cambios en las adjudicaciones.

---

### User Story 3 — Adjudicar y desadjudicar a mano (Priority: P1)

Como coordinación quiero asignar una grabación a cualquier clase de cualquier
cohorte, o quitarle la asignación, y que esa decisión no la deshaga ninguna
sincronización posterior.

**Why this priority**: la automática nunca va a acertar el 100% (clases
movidas, reuniones de recuperación, cuentas prestadas). Sin la manual, los
casos ambiguos quedan sin salida y la sección pierde confianza.

**Independent Test**: tomar una grabación "ambigua", elegir una de las
candidatas, sincronizar de nuevo y verificar que sigue en la clase elegida;
después desadjudicarla, sincronizar y verificar que sigue sin clase.

**Acceptance Scenarios**:

1. **Given** una grabación sin clase, **When** coordinación elige "Asignar a clase", **Then** ve primero las clases sugeridas (las candidatas y las clases reales de ese día en cualquier aula) y puede buscar cualquier clase de cualquier cohorte por cohorte y fecha.
2. **Given** una asignación manual, **When** corre cualquier sincronización posterior, **Then** la asignación se conserva tal cual.
3. **Given** una grabación adjudicada (automática o manual), **When** coordinación la desadjudica, **Then** la clase deja de ofrecer esa grabación y la grabación queda "sin clase (manual)": ninguna sincronización la vuelve a adjudicar.
4. **Given** una grabación desadjudicada a mano, **When** coordinación elige "Volver a automático", **Then** la próxima sincronización (o la inmediata, si se pide) vuelve a aplicar la regla automática.
5. **Given** asignar a una clase que ya tiene un enlace pegado a mano u otra grabación, **When** confirma, **Then** la pantalla advierte qué se va a reemplazar y, al confirmar, la clase pasa a ofrecer la grabación elegida; la grabación anterior queda "sin clase (manual)".
6. **Given** asignar a una clase cancelada o a una fila proyectada, **When** se intenta, **Then** el sistema lo rechaza: una cancelada no ofrece grabación (FR-005e de 013) y una proyección no existe.

---

### User Story 4 — Conectar las cuentas de Zoom y vincular las aulas (Priority: P1)

Como dirección quiero cargar una o más conexiones de Zoom (Account ID, Client
ID, Client Secret de una app Server-to-Server OAuth), probarlas, y vincular
cada aula virtual con el usuario de Zoom que la hospeda, sin saber de antemano
si las 5 cuentas son una sola organización de Zoom o cinco cuentas separadas.

**Why this priority**: sin conexión no hay datos; es prerequisito de US1–US3
(se lista P1 porque bloquea, no porque sea el valor).

**Independent Test**: cargar una conexión contra el mock, apretar "Probar",
ver la lista de usuarios de esa cuenta, vincular un aula a uno; verificar que
el secreto nunca vuelve completo en ninguna respuesta (solo los últimos 4).

**Acceptance Scenarios**:

1. **Given** una sola organización de Zoom con 5 usuarios, **When** dirección carga UNA conexión y la prueba, **Then** ve los 5 usuarios y puede vincular cada aula a uno de ellos.
2. **Given** 5 cuentas de Zoom separadas, **When** carga 5 conexiones, **Then** cada una lista su único usuario y cada aula se vincula al suyo. Ningún cambio de código distingue los dos casos.
3. **Given** credenciales inválidas, **When** prueba la conexión, **Then** ve un error legible ("Zoom rechazó las credenciales") sin el secreto ni la respuesta cruda, y la conexión queda en estado "con error".
4. **Given** una conexión guardada, **When** se vuelve a abrir la pantalla, **Then** el secreto se muestra como `••••1234`; dejar el campo vacío al editar conserva el anterior.
5. **Given** una conexión dada de baja, **When** se sincroniza, **Then** no se consulta, y sus grabaciones ya traídas se conservan (con su adjudicación) pero se marcan de una conexión inactiva.
6. **Given** la instancia sin ninguna conexión, **When** se navega el CRM, **Then** todo funciona igual que antes: la sección Grabaciones explica cómo conectar Zoom y el enlace manual de grabación sigue disponible en las clases.

---

### User Story 5 — Sincronización a demanda y periódica (Priority: P2)

Como coordinación quiero un botón "Sincronizar" que traiga ya las grabaciones
nuevas, y que además el sistema sincronice solo cada cierto tiempo, para que
la grabación de la clase de anoche aparezca a la mañana sin que nadie toque
nada.

**Why this priority**: el botón alcanza para operar (P1 funciona con él); la
periódica es la comodidad que completa la promesa "sin que nadie lo pegue".

**Independent Test**: con la sincronización periódica a 1 minuto en local,
sembrar una grabación nueva en el mock y verificar que aparece sin apretar
nada; con dos procesos de la app simultáneos, verificar que corre una sola
sincronización a la vez.

**Acceptance Scenarios**:

1. **Given** una sincronización en curso, **When** alguien aprieta "Sincronizar", **Then** no arranca otra: la pantalla dice que ya hay una corriendo y desde cuándo.
2. **Given** el servidor apagado durante 3 días, **When** vuelve, **Then** la siguiente sincronización recupera las grabaciones de esos 3 días (ventana de recuperación) sin huecos.
3. **Given** Zoom responde con límite de tasa o caída momentánea, **When** se sincroniza, **Then** reintenta con espera, y si no se recupera termina "con error" en esa conexión sin afectar a las otras ni al resto del CRM; lo ya traído queda.
4. **Given** la pantalla Grabaciones, **When** se abre, **Then** muestra la última sincronización de cada conexión (cuándo, resultado, cuántas nuevas).

---

### User Story 6 — Profesores y alumnos ven solo lo suyo (Priority: P2)

Como alumno quiero ver la grabación de mi clase donde siempre la vi (la lista
de clases de mi portal); como profesor, lo mismo en mi portal. Ninguno de los
dos debe ver grabaciones que no estén adjudicadas a una clase suya.

**Why this priority**: ya está construido (013/014/015 muestran
`recordingUrl`); la fase solo tiene que llenar ese dato y no abrir una puerta
nueva.

**Independent Test**: tras una adjudicación automática, el alumno de la
cohorte ve la grabación en su clase; un alumno de otra cohorte y un profesor
ajeno no la ven en ninguna ruta.

**Acceptance Scenarios**:

1. **Given** una grabación adjudicada a la clase 5 de la cohorte A, **When** un alumno de A abre su cohorte, **Then** la clase 5 ofrece la grabación; **When** un alumno de B abre la suya, **Then** no aparece en ningún lado.
2. **Given** grabaciones sin adjudicar, **When** cualquier usuario del portal recorre todas sus rutas, **Then** ninguna devuelve esas grabaciones.
3. **Given** un profesor que hoy carga la grabación a mano desde su portal, **When** sigue haciéndolo, **Then** funciona igual, y su enlace manual no es pisado por la sincronización.

---

### Edge Cases

- **La grabación tarda en procesarse** (minutos a horas): Zoom no la lista hasta que termina; la ventana de recuperación re-consulta los últimos días en cada corrida, así que aparece en la siguiente.
- **El profesor reinició la reunión** (dos grabaciones de la misma clase): la primera se adjudica; la segunda, al encontrar la clase ya con grabación automática, queda "en conflicto" con esa clase — coordinación elige. Nunca se pisa en silencio.
- **Clase sin horario cargado** (6 de 41 cohortes): no tiene instante; no es candidata (mismo criterio que los choques de 023, FR-008).
- **Clase que se movió de aula ese día** (aula propia de la clase): manda el aula efectiva de la clase (clase → cohorte), igual que la agenda de aulas.
- **Reunión recurrente de la cohorte usada desde otra cuenta** (alguien prestó la cuenta): coincide por número de reunión aunque el anfitrión sea otro usuario; el número de reunión gana sobre el aula.
- **Cambio de hora**: la comparación se hace en instantes; los horarios de clase se componen solo con `classInstant()`.
- **La grabación se borra o vence en Zoom**: si la sincronización deja de verla dentro de la ventana consultada, se marca "ya no está en Zoom" y la clase sigue con el enlace (que dejará de funcionar) hasta que coordinación decida; se muestra la fecha de vencimiento automático cuando Zoom la informa.
- **Conexión cuyo usuario de Zoom dejó de existir**: la sincronización de esa aula falla con un error legible; las otras aulas siguen.
- **Aula vinculada a un usuario de otra conexión**: imposible: el aula guarda conexión + usuario juntos, y el usuario se elige de la lista de esa conexión.
- **Grabación de un usuario de Zoom no vinculado a ningún aula**: no se trae (ver Assumptions); vincular el aula y sincronizar la recupera dentro de la ventana de recuperación configurada.
- **Clase cancelada después de adjudicada**: la clase deja de ofrecer la grabación (regla vigente de 013); la adjudicación se conserva por si se des-cancela.
- **Grabación de solo audio o sin video compartible**: se lista igual con lo que Zoom informe; el enlace compartible es el de la reunión, no de un archivo.
- **Zoom sin `share_url`** (grabación aún procesándose o configuración de la cuenta): se lista sin enlace, con el estado, y no se adjudica hasta tener enlace.

## Requirements *(mandatory)*

### Conexiones y aulas

- **FR-001**: El sistema DEBE permitir declarar cero o más **conexiones de Zoom**, cada una con nombre, Account ID, Client ID y Client Secret (app Server-to-Server OAuth). Una conexión puede cubrir uno o muchos usuarios de Zoom.
- **FR-002**: El Client Secret DEBE guardarse cifrado en reposo, nunca viajar al navegador ni a logs ni a mensajes de error, y mostrarse solo como sus últimos 4 caracteres.
- **FR-003**: Una conexión DEBE poder probarse: el resultado es el listado de usuarios de Zoom de esa cuenta o un error legible sin datos sensibles.
- **FR-004**: Cada aula virtual DEBE poder vincularse a una conexión y a un usuario de Zoom de esa conexión (opcional; un aula sin vínculo sigue funcionando como hoy).
- **FR-005**: El sistema DEBE funcionar igual que antes cuando no hay ninguna conexión configurada.

### Sincronización

- **FR-006**: El sistema DEBE traer de Zoom las grabaciones en la nube de los usuarios vinculados a aulas activas, de todas las conexiones activas.
- **FR-007**: Traer la misma grabación dos o más veces NO DEBE duplicarla ni alterar su adjudicación; cada grabación se identifica por la instancia de reunión de Zoom dentro de su conexión.
- **FR-008**: DEBE existir una sincronización a demanda (botón) y una periódica en segundo plano, sin colas ni servicios externos, con a lo sumo una sincronización activa por organización a la vez.
- **FR-009**: Cada corrida DEBE re-consultar una ventana de recuperación hacia atrás desde la última sincronización exitosa, para no perder grabaciones que se procesaron tarde ni las de períodos con el servidor apagado.
- **FR-010**: La sincronización DEBE respetar los límites de tasa y la paginación de Zoom, reintentar fallas transitorias con espera, y aislar el fallo de una conexión o aula de las demás.
- **FR-011**: Cada corrida DEBE dejar registro visible (cuándo, quién o qué la disparó, resultado, nuevas, adjudicadas, errores) por conexión.

### Sección Grabaciones

- **FR-012**: La sección Grabaciones DEBE listar todas las grabaciones traídas con: aula, conexión/cuenta, inicio (zona de la academia), duración, tema, estado de adjudicación (automática, manual, ambigua, en conflicto, sin clase, sin clase-manual), clase/cohorte adjudicada y vencimiento si Zoom lo informa.
- **FR-013**: DEBE poder filtrarse por conexión, por aula, por rango de fechas y por estado de adjudicación, con paginación.
- **FR-014**: DEBE ofrecer copiar el enlace compartible y abrirlo en Zoom; el CRM NO DEBE descargar, almacenar, ni retransmitir el video.
- **FR-015**: Cuando Zoom exija un código de acceso que no esté embebido en el enlace, el código DEBE mostrarse junto al enlace para el staff; el enlace que llega a la clase DEBE ser uno que el alumno pueda abrir (ver research DV-008).

### Adjudicación

- **FR-016**: Una grabación DEBE adjudicarse automáticamente a una clase solo si existe **exactamente una** clase candidata: real (no proyectada), no cancelada, con horario, cuya reunión efectiva (clase → cohorte) tenga el mismo número que la grabación, o —si no hay coincidencia por número— cuya aula efectiva (clase → cohorte) esté vinculada al usuario de Zoom anfitrión, y cuyo inicio esté dentro de la ventana de tolerancia respecto del inicio de la grabación.
- **FR-017**: Los horarios de clase DEBEN componerse exclusivamente con el mecanismo único de horarios con zona horaria del sistema.
- **FR-018**: Con dos o más candidatas, la grabación DEBE quedar sin adjudicar, marcada ambigua y con sus candidatas visibles.
- **FR-019**: La adjudicación automática NO DEBE pisar un enlace de grabación cargado a mano en la clase ni otra grabación ya adjudicada a ella; en ese caso queda "en conflicto".
- **FR-020**: El staff con permiso DEBE poder asignar una grabación a cualquier clase real no cancelada de cualquier cohorte, desasignarla, y devolverla al modo automático.
- **FR-021**: Una asignación o desasignación manual NO DEBE ser modificada por ninguna sincronización posterior.
- **FR-022**: Al adjudicar (automática o manual), la clase DEBE ofrecer la grabación por los mismos canales que hoy ofrecen `recordingUrl` (lista de clases del staff, portal del profesor, portal del alumno); al desadjudicar, deja de ofrecerla.
- **FR-023**: Cada adjudicación manual DEBE registrar quién y cuándo.

### Permisos y exposición

- **FR-024**: Ver la sección Grabaciones, gestionar adjudicaciones/sincronizar, y configurar conexiones DEBEN requerir capacidades de la lista cerrada (ver plan: `grabaciones.ver`, `grabaciones.gestionar`; conexiones con `configuracion.editar`).
- **FR-025**: Profesores y alumnos NO DEBEN recibir ninguna grabación que no esté adjudicada a una clase de su alcance; no se crea ninguna ruta de portal nueva.
- **FR-026**: Todas las tablas nuevas DEBEN estar aisladas por organización (Principio III, RLS).

### Gobernanza

- **FR-027**: Zoom DEBE incorporarse a la lista cerrada de dependencias de runtime mediante enmienda constitucional antes de cualquier código que llame a Zoom; los entornos de prueba y los mocks JAMÁS llaman a Zoom real.

### Key Entities

- **Conexión de Zoom**: credenciales de una app Server-to-Server de UNA cuenta de Zoom; cubre los usuarios de esa cuenta. Estado, último error, última sincronización y hasta qué fecha está al día.
- **Aula virtual** (existente): gana vínculo opcional a conexión + usuario de Zoom.
- **Grabación**: una instancia de reunión grabada en la nube de Zoom: número de reunión, instancia, anfitrión, inicio, duración, tema, enlace compartible, código de acceso, vencimiento, presencia en Zoom, y su adjudicación (clase, modo automático/manual, estado, candidatas, quién/cuándo).
- **Corrida de sincronización**: registro de cada sincronización por conexión.
- **Clase** (existente): sigue exponiendo UN enlace de grabación; gana de dónde vino (pegado a mano o Zoom).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con las aulas vinculadas y cohortes con su reunión cargada, al menos el 90% de las grabaciones de clases regulares quedan adjudicadas sin intervención humana (medido sobre las 4 semanas siguientes al encendido).
- **SC-002**: Ninguna grabación se adjudica a una clase equivocada en forma automática: 0 casos reportados de grabación de otra cohorte (la ambigüedad se deja sin adjudicar, no se adivina).
- **SC-003**: Coordinación encuentra y copia el enlace de cualquier grabación de los últimos 3 meses en menos de 30 segundos, sin entrar a Zoom.
- **SC-004**: La grabación de una clase aparece ofrecida al alumno, sin acción humana, a más tardar en el siguiente ciclo de sincronización periódica después de que Zoom la termina de procesar.
- **SC-005**: Re-sincronizar cualquier número de veces produce 0 duplicados y 0 cambios sobre adjudicaciones manuales.
- **SC-006**: Con Zoom caído o sin configurar, el 100% de los flujos existentes (clases, portales, enlace manual) siguen funcionando.

## Assumptions

- **Topología desconocida, diseño neutro**: las 5 cuentas pueden ser una organización de Zoom (1 conexión, 5 usuarios) o 5 cuentas (5 conexiones, 1 usuario cada una). El modelo conexión → usuarios → aulas cubre ambas sin cambios de código.
- **Solo usuarios vinculados a un aula**: no se traen grabaciones de usuarios de Zoom que no hospedan un aula (en una organización compartida podrían ser personales). Default informado; se revisa si el dueño quiere "todo lo de la cuenta".
- **Ventana de recuperación**: la primera sincronización de una conexión trae los últimos 90 días; las siguientes re-consultan desde 3 días antes de la última exitosa. Configurable por entorno.
- **Sincronización periódica**: cada 60 minutos por defecto, configurable; 0 la apaga (queda solo el botón).
- **Tolerancia**: una grabación es candidata de una clase si empezó entre 30 minutos antes del inicio de la clase y su fin (o inicio + 3 h si no tiene fin). Configurable.
- **Adjudicar = publicar**: una grabación adjudicada se ofrece a los alumnos de inmediato, igual que un enlace pegado hoy. No se agrega un paso de "publicar".
- **Polling, no webhook** en esta fase (research DV-005): el webhook `recording.completed` queda como mejora futura.
- **Plan de Zoom**: las cuentas son Pro o superior (requisito de Zoom para grabación en la nube y su API).

## Fuera de alcance

- Crear reuniones de Zoom desde el CRM al generar el cronograma (la otra mitad de 018).
- Descargar, alojar o reproducir dentro del CRM las grabaciones; transcripciones, resúmenes de IA o chat de la reunión.
- Asistencia a partir de participantes de Zoom (cambia el criterio de aprobación de 010; ver 018).
- Avisos de vencimiento por correo o WhatsApp (se MUESTRA el vencimiento; avisar es otra fase).
- Google Meet, Teams u otros proveedores.
- Borrar o modificar grabaciones en Zoom (scope de solo lectura).
