# 028 (seguimiento) — La especialización explícita, armada desde su pestaña

Automatizado en `scripts/e2e-selftest.mjs`, sección
`== 028+: especialización explícita, armada desde la pestaña ==` (API + Chromium).

1. Académico → Cohortes → Nueva cohorte → elegir **Especialización** arriba de
   todo. El formulario no pide profesor, horario, días, aulas, enlace ni software.
2. Abrir la cohorte: aparece la pestaña **Especialización** aunque no tenga
   módulos, con un estado vacío que explica qué es y el botón **Agregar módulo**.
3. Agregar dos módulos desde la pestaña: el formulario dice "Nuevo módulo de …",
   no ofrece madre ni número de orden y propone las fechas de la especialización.
   El servidor les asigna el lugar al final (10, 20).
4. **↑** sobre el segundo: pasa a ser "Módulo 1 — …".
5. Académico → Cohortes: la madre muestra "Especialización · 2 módulos", plegada;
   al desplegar, los módulos aparecen adentro con su ordinal y nunca como filas sueltas.
6. Camino infeliz: colgar un módulo de una cohorte común → 422; marcar un módulo
   como especialización → 422; desmarcar la especialización con módulos → 422 y la
   marca queda; una especialización vacía no genera cronograma (422) y sí se desmarca.
