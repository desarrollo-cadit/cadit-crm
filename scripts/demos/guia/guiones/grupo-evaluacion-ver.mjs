/** Planilla de evaluación del grupo. */

import { apiComo } from "../datos.mjs";

/* ------------------------------------------------------------------ apoyo */
const sello = Date.now().toString(36).slice(-5);
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ok = (n, r) => {
  if (!r.res.ok) throw new Error(`${n}: ${r.res.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const enviar = (api, ruta, body, metodo = "POST") => api(ruta, { method: metodo, body: JSON.stringify(body) });

/** Cliente de Coordinación con la sesión guardada en disco (no se llama a sign-in: tiene cupo). */
const apiCoordinacion = async () => (await apiComo("coordinacion")).api;

const NOMBRES = [["Martina", "Rodríguez"], ["Santiago", "Pereira"], ["Valentina", "Silva"], ["Joaquín", "González"], ["Camila", "Martínez"], ["Facundo", "Suárez"]];

/** Un curso propio y un grupo con cronograma, alumnos y (si se pide) la lista tomada en todas las clases. */
async function armarGrupo(api, { curso, cursoId, nombre, inicio = -28, fin = -2, alumnos = 4, pasarLista = true }) {
  cursoId ??= ok("curso", await enviar(api, "/api/courses", { name: curso ?? `Curso demo ${sello}`, grantsCertificate: true })).course.id;
  const alta = ok("grupo", await enviar(api, "/api/cohorts", {
    courseId: cursoId, name: nombre ?? `Grupo demo ${sello}`, startDate: dia(inicio), endDate: dia(fin),
    daysOfWeek: "0,2", startTime: "18:30", endTime: "20:30",
  }));
  const grupoId = alta.cohort?.id ?? alta.id;
  ok("cronograma", await api(`/api/cohorts/${grupoId}/schedule`, { method: "POST" }));
  const sellerId = ((await api("/api/sellers")).json?.sellers ?? []).find((s) => !s.archived)?.id;
  const inscripciones = [];
  for (const [i, [n, a]] of NOMBRES.slice(0, alumnos).entries()) {
    const r = ok(`inscripción de ${n}`, await enviar(api, "/api/enrollments", {
      cohortId: grupoId, sellerId,
      contact: {
        firstName: n, lastName: `${a} ${sello}`,
        phone: `5989${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        email: `${n}.${a}.${sello}.${i}@demo.test`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      },
    }));
    inscripciones.push({ id: r.enrollment?.id, nombre: `${n} ${a} ${sello}` });
  }
  const clases = ((await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? []).filter((c) => c.id);
  if (pasarLista) {
    const E = ["presente", "presente", "presente", "tarde"];
    for (const [k, c] of clases.entries()) {
      ok("lista", await enviar(api, `/api/class-sessions/${c.id}`, {
        attendance: inscripciones.map((e, i) => ({ enrollmentId: e.id, status: i === 3 && k % 3 === 0 ? "ausente" : E[(i + k) % 4] })),
      }, "PATCH"));
    }
  }
  return { cursoId, grupoId, inscripciones, clases };
}
/* ------------------------------------------------------------------------- */

const api = await apiCoordinacion();
const g = await armarGrupo(api, { nombre: `Grupo notas ${sello}`, inicio: -28, fin: -2, alumnos: 4 });
const ev = ok("evaluación", await enviar(api, `/api/cohorts/${g.grupoId}/grading`, { name: "Trabajo final", required: true })).assessment;
ok("plazo", await enviar(api, `/api/assessments/${ev.id}/plazo`, { plazo: { fecha: dia(5), hora: "23:59" } }, "PUT"));
ok("notas", await enviar(api, `/api/assessments/${ev.id}/results`, {
  results: [
    { enrollmentId: g.inscripciones[0].id, passed: true },
    { enrollmentId: g.inscripciones[1].id, passed: true },
    { enrollmentId: g.inscripciones[2].id, passed: false },
  ],
}, "PATCH"));

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=evaluacion`;

export async function guion(g2) {
  const { page } = g2;
  const planilla = page.getByRole("columnheader", { name: /Trabajo final/ }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await g2.paso("La pestaña Evaluación tiene una planilla con las notas de cada alumno", planilla, { sostener: 3.4 });
  await g2.paso(
    "Cada columna es una evaluación. Sin corregir no equivale a desaprobado",
    planilla.getByRole("columnheader", { name: /Trabajo final/ }),
    { sostener: 4 }
  );
  await g2.paso("Junto a las notas figura el porcentaje de asistencia de cada alumno", planilla.getByRole("columnheader", { name: "Asist." }), { sostener: 3.2 });
  await g2.paso(
    "«Sugiere aprobado» es solo un cálculo con notas y asistencia",
    planilla.getByRole("columnheader", { name: "Sugerencia" }),
    { sostener: 3.4 }
  );
  await g2.paso(
    "El resultado final es el que confirma una persona",
    planilla.getByRole("columnheader", { name: "Resultado final" }),
    { sostener: 3.2 }
  );
  await g2.paso(
    "Las fechas límite de cada evaluación figuran aparte",
    page.getByText("Fechas límite de entrega").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"),
    { sostener: 3.6 }
  );
}
