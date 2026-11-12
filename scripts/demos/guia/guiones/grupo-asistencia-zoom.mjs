/**
 * Asistencia sugerida desde Zoom. Usa una sugerencia YA sembrada (sin confirmar) y solo la
 * revisa: no se confirma, para no escribir asistencia ni «aprendizaje» sobre datos sembrados.
 */

import { execFileSync } from "node:child_process";
import { apiComo } from "../datos.mjs";

/** De las sugerencias sembradas sin confirmar, la que más alumnos reconoce (la mejor para mostrar). */
async function buscar() {
  const sql =
    "select cs.cohort_id||'|'||cs.id from zoom_attendance_fetch f join class_session cs on cs.id=f.class_session_id " +
    "where f.status='lista' and f.reviewed_at is null order by cs.date desc limit 30";
  const filas = execFileSync("psql", ["-h", "localhost", "-p", "5433", "-U", "postgres", "-d", "cadit_demo", "-Atc", sql], {
    env: { ...process.env, PGPASSWORD: "postgres" },
  }).toString().trim().split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean);
  const { api } = await apiComo("coordinacion");
  let mejor = null;
  for (const fila of filas) {
    const [grupo, clase] = fila.split("|");
    const s = (await api(`/api/class-sessions/${clase}/zoom-attendance`)).json?.sugerencia;
    if (!s) continue;
    const vistos = s.alumnos.filter((a) => a.personas.length > 0).length;
    const puntos = vistos * 10 + Math.min(s.sinIdentificar.length, 2);
    if (!mejor || puntos > mejor.puntos) mejor = { grupo, clase, puntos };
  }
  if (!mejor) throw new Error("no hay una sugerencia de Zoom sembrada sin confirmar");
  return mejor;
}
const { grupo, clase } = await buscar();

export const rol = "coordinacion";
export const ruta = `/cohorts/${grupo}?tab=asistencia&clase=${clase}`;

export async function guion(g) {
  const { page } = g;
  const marco = page.locator("section[aria-label^='Sugerencia de Zoom']");
  await g.paso("En la pestaña Asistencia, «Sugerencia de Zoom» propone la lista de una clase ya dictada", marco, { sostener: 3.6 });
  await g.paso(
    "Resume cuántas personas vio Zoom y cuánto tiempo hacía falta para figurar presente",
    marco.getByText(/Zoom vio a/),
    { sostener: 3.8 }
  );
  const tabla = marco.locator("table");
  await g.paso("La tabla enumera a cada alumno con su conexión de Zoom, el tiempo y la asistencia propuesta", tabla, { sostener: 4 });
  const badge = marco.getByText(/^(Alta|Media) ·/).first();
  if (await badge.count()) {
    await g.paso("Cuando hay coincidencia, se indica si fue por correo, por nombre o por una asignación anterior", badge, { sostener: 3.4 });
  }
  const sin = marco.getByRole("heading", { name: "Sin identificar" });
  if (await sin.count()) {
    await g.paso(
      "Quien se conectó sin ser reconocido queda en «Sin identificar» para asignarlo a un alumno",
      sin.locator("xpath=ancestor::div[1]"),
      { sostener: 4 }
    );
    await g.paso(
      "Lo que se asigna aquí se recuerda para las próximas clases",
      marco.getByRole("button", { name: "Es del equipo o un dispositivo" }).first(),
      { sostener: 3.4 }
    );
  }
  await g.paso(
    "Nada se guarda hasta seleccionar «Confirmar asistencia». Zoom propone y una persona decide",
    marco.getByRole("button", { name: "Confirmar asistencia" }),
    { sostener: 4.2 }
  );
}
