/**
 * Las razones de aprobación que arma `grading.ts` hablan en tercera persona
 * ("Desaprobó…") porque también las lee el staff en la planilla. Cuando llegan
 * al portal del alumno se le dicen a él, en segunda persona.
 *
 * Módulo aparte y puro a propósito: `student-portal.ts` exige que toda función
 * exportada reciba `contactId`, y esta no tiene nada que ver con el alcance.
 * Lo que no reconoce pasa intacto — una razón nueva en `grading.ts` se sigue
 * mostrando, solo que con su redacción original.
 */
const REGLAS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Desaprobó una evaluación obligatoria$/, () => "No aprobaste una evaluación obligatoria"],
  [/^Desaprobó (\d+) evaluaciones obligatorias$/, (m) => `No aprobaste ${m[1]} evaluaciones obligatorias`],
  [
    /^Asistencia ([^%]+)% \(mínimo ([^%]+)%\)/,
    (m) => `Tu asistencia es del ${m[1]}%; para aprobar se pide ${m[2]}%`,
  ],
  [/^Falta corregir una evaluación$/, () => "Tu profesor todavía tiene que corregir una evaluación"],
  [/^Faltan corregir (\d+) evaluaciones$/, (m) => `Tu profesor todavía tiene que corregir ${m[1]} evaluaciones`],
  [
    /^Un módulo sin datos: nadie cargó evaluaciones ni asistencia$/,
    () => "Hay un módulo que todavía no tiene evaluaciones ni asistencia cargadas",
  ],
  [
    /^(\d+) módulos sin datos: nadie cargó evaluaciones ni asistencia$/,
    (m) => `Hay ${m[1]} módulos que todavía no tienen evaluaciones ni asistencia cargadas`,
  ],
  [/^Falta aprobar un módulo$/, () => "Te falta aprobar un módulo"],
  [/^Faltan aprobar (\d+) módulos$/, (m) => `Te faltan aprobar ${m[1]} módulos`],
  [
    /^Nadie cargó todavía evaluaciones obligatorias ni asistencia de este módulo$/,
    () => "Todavía no hay evaluaciones ni asistencia cargadas en este módulo",
  ],
];

export function reasonForStudent(reason: string): string {
  for (const [patron, decir] of REGLAS) {
    const m = reason.match(patron);
    // Solo se reescribe el tramo reconocido: lo que sigue (el motivo de una
    // dispensa, por ejemplo) queda tal cual.
    if (m) return decir(m) + reason.slice(m[0].length);
  }
  return reason;
}
