# 027 — Guía por rol

**Estado**: propuesta · **Depende de**: 012 · **Habilita**: —

## Por qué esta fase existe

**El dueño es el manual.** La gente le pregunta a cada rato qué puede hacer y
dónde está cada cosa, y él contesta de memoria, una persona por vez, todos los
días. Con dos audiencias de portal (340 alumnos y 7 profesores) y tres roles de
staff, esa pregunta no deja de llegar: se multiplica.

Y el producto no tiene dónde contestarla. Verificado: **cero superficies de
ayuda** en `src/app/` y `src/components/` — no hay página de guía, ni
onboarding, ni FAQ, ni tour. Tampoco hay ninguna librería de tours en
`package.json`.

El resultado es que el sistema sabe perfectamente qué puede hacer cada persona
—lo decide en cada request, con `requireCapability`— y no se lo dice a nadie.
La información existe, está tipada, y sólo se usa para negar.

## La decisión que define la fase

**La guía se DERIVA, no se escribe a mano.**

Hay dos caminos evidentes y los dos son peores.

**El primero: una librería de tours.** driver.js, Shepherd, react-joyride,
intro.js. Todas resuelven bien un problema que no es este: **el recorrido
guiado paso a paso**, la primera vez que alguien entra. Lo que acá se pide es
otra cosa — un **manual de referencia**, que se consulta el día 40 cuando hay
que hacer algo que no se hace seguido. Un tour no se puede consultar: se
dispara, avanza y se termina. Además, cualquiera de esas librerías es una
dependencia nueva, y el proyecto tiene **15 dependencias de runtime** por
decisión, no por casualidad.

**El segundo: escribir el manual.** Una página con texto, prolija, revisada.
Se desactualiza en un ciclo, y no hay que suponerlo: **ya pasó, en este mismo
repositorio**. `specs/ROADMAP.md` se desfasó **tres ciclos** —marcaba la 023 y
la 024 como pendientes estando implementadas, y la 015 como "en pausa"
teniendo el código entero— y hubo que auditarlo spec por spec contra el código
para arreglarlo (2026-09-07). Ese documento lo lee y lo escribe el equipo que
hace el producto. Un manual que lee gente que **no** escribe el código se
desactualiza más rápido y se nota menos.

Entonces la guía **sale de las mismas fuentes que usa el servidor para
permitir o denegar**:

- **`CAPABILITIES`** (`src/lib/capabilities.ts`) — la lista cerrada y tipada de
  **17** capacidades. Responde *qué puedo hacer*.
- **`NAV_GROUPS`** (`src/components/app-nav.tsx`) — cada ítem ya declara
  `capability: string | null`. Responde *dónde está*.
- **`ITEMS_ALUMNO` / `ITEMS_PROFESOR`** (`src/components/portal/portal-nav.tsx`)
  — lo mismo para la audiencia del portal.

Si la guía sale de ahí, agregar una capacidad la hace aparecer sola. Y si
alguien agrega una capacidad y no la describe, **no compila**.

## El mecanismo: el compilador es el que mantiene la guía

Ésta es la razón de ser de la fase, y conviene decirla sin rodeos.

La descripción de las capacidades vive en un registro tipado:

```ts
const GUIA_CAPACIDADES: Record<Capability, { que: string; donde: string }>
```

`Capability` es la unión cerrada `(typeof CAPABILITIES)[number]`. Un `Record`
sobre una unión cerrada es **exhaustivo por tipo**: TypeScript exige una
entrada por cada miembro. Consecuencia directa:

> **El día que alguien agregue una capacidad 18 a `CAPABILITIES` y no la
> describa, `pnpm typecheck` falla y `pnpm build` no sale.**

No es disciplina, no es una convención, no es un `TODO` que alguien tiene que
recordar: es el compilador. La guía no se puede desactualizar respecto de la
lista de capacidades porque el código **no compila** desactualizado. Es el
mismo mecanismo que ya usa el proyecto para que no se invente una capacidad —
la lista cerrada— aplicado en la otra dirección.

Lo que el compilador no puede verificar —que el `donde` apunte a una ruta que
existe de verdad, y que ninguna descripción esté vacía— lo verifica un test
(US3). Entre los dos no queda margen.

## User Scenarios

### US1 — La guía del staff (Priority: P1)

Como miembro del staff quiero abrir una página que me diga qué puedo hacer y
dónde está cada cosa, para dejar de preguntar.

La página se arma con las capacidades **reales de la sesión** — las mismas que
`AppNav` usa para filtrar el menú, resueltas en el servidor. No con el nombre
del rol: los roles se renombran y se editan desde `/settings/roles`, y una guía
que dijera "si sos Coordinación podés…" miente en cuanto alguien toca esa
pantalla.

**Y también muestra lo que NO puede hacer, en una sección aparte.** Es la parte
discutible, así que va argumentada:

Ocultar lo que la persona no puede hacer es lo correcto en el **menú** —un
ítem que lleva a un 403 es una puerta cerrada con cartel de bienvenida, y así
está resuelto en `NAV_GROUPS`—. Pero en una guía el efecto es el contrario:
alguien que no encuentra "emitir certificados" concluye que el sistema no lo
hace, y le pregunta al dueño. Que era el problema que vinimos a resolver.

Entonces: una segunda sección, **"esto lo hace otro rol"**, que dice **qué** se
puede hacer y **qué rol** lo tiene, y nada más. Sin enlace —no se ofrece una
puerta que va a devolver 403— y **sin nombres de personas**: una guía que
nombra gente es un directorio, y un directorio se desactualiza con cada alta y
cada baja. El rol se lee de la base con `listRoles`, así que si el dueño le
mueve las capacidades a un rol, la sección lo refleja sin tocar código.

### US2 — La guía del portal (Priority: P1)

Como alumno o profesor quiero una guía escrita para mí, no una versión
recortada de la del staff.

**No reusa la superficie del staff.** Es el Principio 3 del roadmap —*cada
audiencia con su superficie*— y es la misma decisión que ya se tomó con
`PortalNav`, que no reusa `AppNav` (014/FR-008): reusarla obligaría a llenarla
de `if`, que es exactamente cómo un enlace de coordinación termina visible en
la pantalla equivocada.

Además hay una asimetría de fondo que hace que el reuso sea directamente malo:
la guía del staff tiene una sección de "esto lo hace otro rol" porque el staff
tiene un problema de **escalamiento interno** —a quién le pido—. El alumno no
lo tiene: su camino es uno solo, escribirle a la academia. Listarle las
capacidades del staff sería exponerle el organigrama interno a una audiencia
externa, sin ningún beneficio.

El lenguaje también cambia. El staff lee "registrar pagos"; el alumno lee "ver
lo que debés y lo que ya pagaste". La guía del portal **no nombra capacidades**:
un alumno no tiene ninguna, y `cobranza.ver` no significa nada para él.

**Escenarios**:
- Alumno puro → ve sólo lo suyo: inicio, cuenta, certificados y sus cursadas.
- Profesor puro → ve lo suyo: cohortes y horas.
- Alguien que es las dos cosas (`PortalAudience` contempla `isStudent` **e**
  `isTeacher` a la vez) → ve las dos secciones, rotuladas.

### US3 — Que no se pueda desactualizar (Priority: P1)

Como equipo quiero que la guía se rompa cuando queda vieja, y no que envejezca
en silencio.

**Escenarios**:
- Se agrega una capacidad a `CAPABILITIES` y no se la describe → **no compila**.
- Se describe una capacidad con un `donde` que apunta a una ruta que no existe
  → falla un test, diciendo cuál.
- Se agrega un ítem a `NAV_GROUPS` con una capacidad que la guía no menciona en
  ningún `donde` → falla un test.
- Se agrega un ítem a `ITEMS_ALUMNO` o `ITEMS_PROFESOR` y no aparece en la guía
  del portal → falla un test.

## Requirements

### El registro

- **FR-001**: DEBE existir un registro tipado
  `Record<Capability, { que: string; donde: string }>`. **Exhaustivo por tipo**:
  ni `Partial`, ni un índice `[k: string]`, ni un `as` que lo relaje. Cualquiera
  de las tres destruye la única garantía de la fase.
- **FR-002**: `que` DEBE describir la acción en lenguaje del usuario, no el
  nombre técnico. `certificados.emitir` se lee "emitir el certificado de un
  alumno que aprobó", no "certificados.emitir".
- **FR-003**: `donde` DEBE ser una ruta que existe en la aplicación.
- **FR-004**: El "dónde está" del menú DEBE derivarse de `NAV_GROUPS`, no
  copiarse. Si eso exige extraer la declaración a un módulo importable desde el
  servidor —hoy vive dentro de un componente `"use client"`, junto a los
  íconos—, esa extracción es parte de la fase. **Lo que no se admite es una
  segunda copia**: dos listas de navegación divergen, y la que diverge es
  siempre la que nadie mira.

### La guía del staff

- **FR-005**: La página DEBE renderizarse en el SERVIDOR con
  `sessionCapabilities(session)` — la misma fuente que alimenta `AppNav`. No se
  manda el mapa entero al navegador para filtrarlo ahí: el filtro tiene que
  vivir donde vive la decisión.
- **FR-006**: La sección principal DEBE listar **sólo** las capacidades de la
  sesión, agrupadas como en `CAPABILITIES` (Académico, Comercial y financiero,
  Conversaciones, Plataforma).
- **FR-007**: La sección "esto lo hace otro rol" DEBE listar las capacidades
  que la sesión NO tiene, con **el rol** que las tiene, leído de la base
  (`listRoles`). Sin enlace y sin nombres de personas.
- **FR-008**: La guía NO exige capacidad: su ítem se declara con
  `capability: null`, como el Dashboard. **Un manual que hay que tener permiso
  para leer no es un manual.**

### La guía del portal

- **FR-009**: La guía del portal DEBE vivir bajo `(portal)`, con su propia ruta
  y su propio contenido. No reusa la del staff ni ninguno de sus endpoints
  (Principio 3 del roadmap).
- **FR-010**: DEBE derivarse de `ITEMS_ALUMNO` e `ITEMS_PROFESOR`, filtrada por
  `PortalAudience`. Quien es alumno y profesor a la vez ve las dos secciones,
  rotuladas.
- **FR-011**: NO nombra capacidades, ni roles del staff, ni ninguna pantalla
  del panel.

### Navegación

- **FR-012**: El enlace a la guía DEBE vivir en la navegación de cada
  audiencia: en `AppNav`, en la zona inferior junto a Configuración —es una
  utilidad, no un módulo de trabajo—; en `PortalNav`, en la zona común a las
  dos audiencias, fuera de los grupos de alumno y de profesor.

### Restricciones

- **FR-013**: **Sin dependencias nuevas.** Se implementa con lo que ya hay:
  Next, React, Tailwind, `lucide-react` y los tokens de la 020. El proyecto
  tiene **15 dependencias de runtime** a propósito y ninguna librería de tours
  entra por esta fase.
- **FR-014**: La guía NO consulta datos de dominio. No lee alumnos, ni cuotas,
  ni cohortes. La única lectura es `listRoles` (FR-007), que ya está acotada
  por organización con `scoped()`.
- **FR-015**: Los colores salen de los tokens. Escribir un hex o un
  `bg-white` en un `.tsx` hace fallar `tests/unit/tema-oscuro.test.ts`, y esta
  fase no es la excepción.

### Tests

- **FR-016**: DEBE haber un test que verifique que todo `donde` apunta a una
  ruta que existe bajo `src/app/`. La exhaustividad la garantiza el tipo; que
  la ruta exista, no.
- **FR-017**: DEBE haber un test que verifique que ningún `que` ni ningún
  `donde` está vacío. Un `Record` exhaustivo se satisface con comillas vacías,
  y esa es la única forma de silenciar al compilador sin que se note.
- **FR-018**: DEBE haber un test que verifique que toda capacidad declarada en
  `NAV_GROUPS` aparece en la guía, y que la guía del portal cubre todos los
  ítems de `ITEMS_ALUMNO` e `ITEMS_PROFESOR`.

### Relación con la 026

- **FR-019**: Si la 026 entra antes, el rol `administracion` DEBE aparecer en
  la guía **sin una sola línea de trabajo extra**: sus cuatro capacidades ya
  están descritas (son de las 17), y el rol se lee de la base en FR-007. Si eso
  no se cumple, la derivación no funcionó y hay una copia escondida en algún
  lado. Es la prueba de fuego de la fase, y por eso queda escrita como
  requisito y no como comentario.

## Decisiones a verificar

- **DV-001**: ¿la sección "esto lo hace otro rol" se muestra siempre, o hay que
  desplegarla? *(propuesta: colapsada por default. Lo primero que la persona
  tiene que ver es lo que SÍ puede hacer; lo otro se busca cuando hace falta.)*
- **DV-002**: ¿mostrar el mapa de roles a todo el staff es aceptable?
  `/settings/roles` hoy exige `configuracion.editar` para verlo.
  *(propuesta: sí. Es el organigrama de permisos de la organización, no datos
  de nadie, y el punto entero de la fase es que la gente sepa a quién pedirle.
  Lo que sigue gateado es EDITARLO.)*
- **DV-003**: ¿la guía incluye lo que existe pero no está en el menú —el legajo
  de un alumno, el roster de una cohorte, el estado de cuenta— a las que se
  llega desde otra pantalla? *(propuesta: sí, con el `donde` en prosa
  ("Académico → la cohorte → Alumnos"). Justamente eso es lo que nadie
  encuentra; si la guía sólo repite el menú, no agrega nada.)*
- **DV-004**: ¿el `que` de cada capacidad se escribe una vez para la guía, o
  reemplaza también el rótulo de `/settings/roles`? *(propuesta: una sola
  fuente, usada en los dos lados. Dos textos para la misma capacidad es
  exactamente el desfasaje que esta fase existe para impedir.)*

## Success Criteria

- **SC-001**: Un miembro del staff entra a la guía y encuentra, sin preguntar,
  dónde se emite un certificado.
- **SC-002**: Se agrega una capacidad de prueba a `CAPABILITIES` sin
  describirla y **`pnpm typecheck` falla**, verificado a mano en el ciclo.
- **SC-003**: Un `donde` que apunta a una ruta inexistente hace fallar un test,
  y el mensaje dice cuál.
- **SC-004**: Un alumno abre su guía y no ve ninguna palabra del vocabulario
  del staff: ni capacidades, ni roles, ni pantallas del panel.
- **SC-005**: Alguien que es alumno **y** profesor ve las dos secciones,
  rotuladas.
- **SC-006**: Con la 026 aplicada, el rol `administracion` aparece en la guía
  sin haber tocado el código de la 027.
- **SC-007**: `scripts/e2e-selftest.mjs` gana un bloque para la 027: abrir la
  guía con dos sesiones de distinto rol y verificar que el contenido difiere en
  las capacidades correctas (Principio IX).

## Out of Scope

- **Tours guiados paso a paso.** Otro problema y otra dependencia. Si algún día
  se quiere, se decide aparte.
- **Videos, capturas y GIFs.** Se desactualizan igual que el texto escrito a
  mano, y además pesan.
- **Ayuda contextual dentro de cada pantalla** (tooltips, "?" por campo). Es un
  esfuerzo mucho mayor y no ataca la pregunta que hoy le llega al dueño, que es
  *qué puedo hacer* y *dónde está*.
- **Buscador dentro de la guía.** Con 17 capacidades y dos audiencias, la lista
  entra en una pantalla; un buscador sobre veinte líneas es decoración.
- **Documentación para quien despliega o mantiene el sistema.** Eso vive en
  `docs/` y en `CLAUDE.md`, y tiene otro lector.
- **Traducir la guía.** El producto está en español y no hay pedido de otro
  idioma.
