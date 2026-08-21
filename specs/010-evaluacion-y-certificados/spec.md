# Feature Specification: Evaluación y certificados

**Feature Branch**: `010-evaluacion-y-certificados`

**Created**: 2026-08-21

**Status**: Draft

**Depends on**: [009 — Clases y asistencia](../009-clases-y-asistencia/spec.md)
(el criterio de aprobación por presencia necesita esa data)

**Input**: El alumno entra al roster y **nunca termina**. No hay notas, no hay
aprobado/reprobado y no hay certificado. Para una academia el certificado es
el producto final: es lo que el alumno vino a buscar y lo que pone en su CV.
Hoy se emite a mano, fuera del sistema, sin registro de quién lo recibió.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Definir cómo se aprueba (Priority: P1) 🎯 MVP

Como coordinación, necesito definir las evaluaciones de una camada y con qué
criterio se aprueba, porque no todos los cursos se evalúan igual.

**Independent Test**: Definir en una camada un trabajo final que pesa 100% con
nota mínima 7 y asistencia mínima 75%, y verificar que queda guardado.

**Acceptance Scenarios**:

1. **Given** una camada, **When** coordinación define sus evaluaciones con
   nombre, peso y nota máxima, **Then** quedan asociadas a esa camada.
2. **Given** evaluaciones con pesos, **When** la suma de pesos no da 100%,
   **Then** el sistema lo rechaza explicando cuánto falta o sobra.
3. **Given** un curso que no se evalúa (solo asistencia), **When** se define
   el criterio sin evaluaciones, **Then** se permite: la aprobación depende
   solo de la presencia.

---

### User Story 2 - Cargar notas y ver quién aprueba (Priority: P1)

Como coordinación o el profesor, necesito cargar las notas y ver el resultado
de cada alumno.

**Independent Test**: Cargar notas a 10 alumnos y verificar que el estado de
aprobación de cada uno se calcula solo, cruzando nota y asistencia.

**Acceptance Scenarios**:

1. **Given** evaluaciones definidas, **When** se cargan las notas, **Then**
   cada alumno queda con su nota final ponderada.
2. **Given** un alumno con nota suficiente pero asistencia por debajo del
   mínimo, **When** se calcula su estado, **Then** figura como NO aprobado, y
   el sistema dice cuál de los dos criterios falló.
3. **Given** una nota cargada por error, **When** se corrige, **Then** queda
   registrado quién la cambió y cuándo.
4. **Given** un alumno sin nota en una evaluación, **When** se calcula su
   estado, **Then** figura como pendiente, NO como reprobado.

---

### User Story 3 - Emitir el certificado (Priority: P1)

Como coordinación, cuando un alumno aprueba necesito emitirle el certificado y
que quede registrado que se le emitió.

**Independent Test**: Emitir el certificado de un alumno aprobado, verificar
que obtiene un código único y que el sistema impide emitirlo dos veces.

**Acceptance Scenarios**:

1. **Given** un alumno aprobado, **When** coordinación emite su certificado,
   **Then** queda registrado con fecha, código único y quién lo emitió.
2. **Given** un alumno NO aprobado, **When** se intenta emitir, **Then** el
   sistema lo rechaza explicando qué criterio no cumple.
3. **Given** un certificado ya emitido, **When** se intenta emitir de nuevo,
   **Then** el sistema devuelve el existente en vez de crear un duplicado.
4. **Given** un certificado emitido por error, **When** se anula con motivo,
   **Then** queda anulado y su código deja de validar. El registro se
   conserva.

---

### User Story 4 - Verificación pública del certificado (Priority: P2)

Como empleador o como el propio alumno, necesito poder verificar que un
certificado es auténtico entrando a una URL.

**Why this priority**: Es lo que convierte al certificado en algo con valor
real. Un PDF sin verificación lo falsifica cualquiera con un editor.

**Independent Test**: Entrar a `/certificados/<código>` de un certificado
emitido y ver los datos; entrar con un código inventado y ver que no valida.

**Acceptance Scenarios**:

1. **Given** un código válido, **When** alguien lo consulta públicamente,
   **Then** ve alumno, curso, camada y fecha de emisión. **Nada más**: ni
   notas, ni datos de contacto, ni información financiera.
2. **Given** un código inexistente o anulado, **When** se consulta, **Then**
   responde que no es válido, sin filtrar si alguna vez existió.
3. **Given** el endpoint público, **When** recibe muchas consultas seguidas,
   **Then** aplica límite por IP, igual que el formulario público.

---

### User Story 5 - Entrega del certificado por correo (Priority: P3)

Como coordinación, quiero mandarle el certificado al alumno por correo sin
salir del sistema.

**Acceptance Scenarios**:

1. **Given** un certificado emitido y un alumno con correo, **When**
   coordinación lo envía, **Then** se manda por Microsoft Graph y queda la
   marca de envío.
2. **Given** un envío que falla, **When** se reintenta, **Then** la marca NO
   quedó puesta del intento anterior — mismo criterio que
   `welcome_email_sent_at`: un correo no se puede desenviar.

---

## Requirements *(mandatory)*

- **FR-001**: El sistema DEBE permitir definir evaluaciones por camada con
  nombre, peso y nota máxima.
- **FR-002**: La suma de los pesos DEBE ser 100%. El sistema DEBE rechazar una
  definición que no cierre.
- **FR-003**: El sistema DEBE calcular la nota final ponderada de cada alumno.
- **FR-004**: El estado de aprobación DEBE cruzar nota mínima Y asistencia
  mínima, e indicar cuál criterio falló.
- **FR-005**: Un alumno sin todas sus notas DEBE figurar como pendiente, nunca
  como reprobado.
- **FR-006**: El sistema DEBE emitir certificados solo a alumnos aprobados,
  con código único e irrepetible.
- **FR-007**: La emisión DEBE ser idempotente: emitir dos veces devuelve el
  mismo certificado (constitución IV).
- **FR-008**: El sistema DEBE permitir anular un certificado con motivo,
  conservando el registro.
- **FR-009**: El endpoint público de verificación DEBE exponer SOLO alumno,
  curso, camada y fecha. Nunca notas ni datos de contacto.
- **FR-010**: El código del certificado NO DEBE ser adivinable ni secuencial.
- **FR-011**: Las notas DEBEN ser visibles para acceso completo; definir en
  DV-003 qué ve `soporte`.

## Decisiones a verificar

- **DV-001**: ¿Escala de notas? (0-100, 0-12, aprobado/no aprobado). Impacta
  el tipo de la columna.
- **DV-002**: ¿El certificado se genera como PDF desde el sistema, o el
  sistema solo registra la emisión y el diseño se hace aparte? *(generar PDF
  sin dependencias externas —constitución II— acota mucho el diseño posible)*
- **DV-003**: ¿`soporte` ve las notas? No son datos financieros, pero sí son
  sensibles.
- **DV-004**: ¿Se emiten certificados a las camadas ya finalizadas que se
  importaron? Son alumnos reales que ya cursaron.
- **DV-005**: ¿El certificado lleva las horas del curso? Si sí, salen de
  `course.duration_weeks × hours_per_week`, o de las horas realmente dictadas
  de la 009 — que pueden no coincidir.

## Out of Scope

- Firma digital criptográfica del PDF.
- Integración con blockchain o registros externos de credenciales.
- Recuperatorios y mesas de examen.

## Dependencias

- **Bloqueante**: [009](../009-clases-y-asistencia/spec.md) para el criterio de
  asistencia. Sin ella, la aprobación solo puede evaluar nota (FR-004 queda a
  medias).
- Reusa el correo transaccional del ciclo 007 (`src/lib/m365`) para US5.
- Reusa el patrón de endpoint público con CORS y rate limit del ciclo 007 para
  US4.
