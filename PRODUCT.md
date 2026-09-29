# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos audiencias con el mismo peso en las decisiones de producto:

- **Staff de la academia** (coordinación, cobranza, administración): usa el
  panel durante toda la jornada para gestionar inscripciones, cohortes, clases,
  asistencia, cobranza y conversaciones de WhatsApp. Su trabajo es operativo,
  repetitivo y de alto volumen.
- **Alumnos**: personas que cursan en CadIT, muchas fuera de Uruguay y en otras
  zonas horarias. Usan el portal para ver su cursada, sus clases, sus
  evaluaciones, su material y los cursos offline.

Audiencia secundaria confirmada en el código: **profesores**, que entran al
portal para ver sus cohortes, registrar asistencia (incluidas las suplencias)
y cargar horas.

## Product Purpose

Sistema de gestión de la academia CadIT (Autodesk Training Center, cursos de
Revit, AutoCAD y afines). Acompaña el recorrido completo de una persona: se
inscribe, cursa, aprende, se evalúa, se recibe y vuelve por el siguiente curso.
La unidad del producto no es la venta, es ese recorrido.

El éxito es que el staff opere la academia desde un solo lugar sin planillas
paralelas y que cada alumno sepa en todo momento dónde está parado en su
cursada.

El proyecto nació como un CRM de WhatsApp genérico y open source (CadIT CRM /
Vocero). Ese origen es historia: las decisiones de producto se toman para la
academia CadIT.

## Positioning

Una sola plataforma que une la conversación comercial por WhatsApp con la
cursada real: la persona que escribe por WhatsApp es la misma que se inscribe,
paga cuotas, asiste a clase y recibe su certificado. Hay tres audiencias (staff,
profesor y alumno) con puertas separadas estructuralmente, y lo que una
audiencia no debe ver no se consulta ni viaja.

## Operating Context

- El staff trabaja en escritorio y mira el panel muchas horas seguidas, así que
  la densidad importa.
- El portal se usa en celular y en escritorio. El profesor puede estar de pie en
  el aula.
- Las clases se dictan con horarios en zona horaria de Uruguay, para alumnos
  distribuidos en varios países.
- La comunicación con alumnos y prospectos pasa por WhatsApp (Cloud API) y por
  correo transaccional (Microsoft 365).
- Los videos de los cursos offline ya están alojados en Vimeo y se muestran
  embebidos.
- Hay datos reales en uso: 34 cursos, 41 cohortes, 340 alumnos y 383
  inscripciones (a 2026-09-07).

## Capabilities and Constraints

- Módulos: bandeja de WhatsApp en tiempo real con agente de IA y Laboratorio,
  contactos y pipeline, catálogo de cursos, cohortes, inscripciones, cobranza
  (cuotas, pagos, morosidad, cobro en bloque), clases y asistencia, calendario,
  evaluaciones y certificados, entregas, material y avisos, legajo del alumno,
  reporte por empresa, aulas virtuales, cursos offline, portal del profesor y
  portal del alumno.
- Permisos por capacidad, no por rol. Los roles se editan desde la aplicación.
- Soberanía: self-hosted. Las únicas dependencias externas en runtime son
  WhatsApp Cloud API, un proveedor LLM compatible con OpenRouter (opcional),
  Microsoft Graph para el correo y el reproductor embebido de Vimeo. Stripe,
  S3/R2 y Google están prohibidos.
- Un dato ausente no se presenta como un dato: "sin datos" no es "aprobado" y
  "nadie pasó lista" no es "0 % de asistencia".
- Para una audiencia ajena, que algo no exista se responde como 404 y nunca como
  403.
- La interfaz está en español.

## Brand Commitments

- Nombre: CadIT. Los recursos están en `public/`: `logo-cadit.png`,
  `logo-cadit-completo.webp`, `logo-cadit-isotipo.webp`,
  `favicon-cadit-32.png` y `apple-icon-cadit-180.png`.
- Tema claro y oscuro obligatorios. La preferencia se guarda en una cookie.
- El acento de marca es configurable (white-label) y se ajusta automáticamente
  para cumplir el contraste.

## Evidence on Hand

- Datos operativos reales de la academia (cursos, cohortes, alumnos,
  inscripciones).
- Capturas en `docs/screenshots/`.
- No hay testimonios, métricas publicadas ni casos de estudio registrados. Ningún
  trabajo futuro debe inventarlos.

## Product Principles

1. **El recorrido, no la venta.** Cada pantalla ayuda a que una persona avance en
   su cursada o a que el staff la acompañe.
2. **Lo que no se debe ver no viaja.** La separación entre audiencias es
   estructural y no depende de ocultar cosas en la interfaz.
3. **La verdad antes que el default optimista.** Un estado sin datos se muestra
   como tal.
4. **La densidad para quien opera, la presencia para quien cursa.** El panel del
   staff prioriza la eficiencia y el portal prioriza la orientación y la marca.
5. **Soberanía.** Cada dependencia externa nueva es una decisión de
   constitución, no un detalle de implementación.

## Accessibility & Inclusion

- Contraste mínimo de 4.5:1 para texto y de 3:1 para íconos y bordes de
  control, en los dos temas. Se calcula y se verifica con tests.
- Áreas táctiles de 44 px en el portal.
- Todas las fechas y horas de clase se muestran según la zona horaria, porque hay
  alumnos en varios países.
