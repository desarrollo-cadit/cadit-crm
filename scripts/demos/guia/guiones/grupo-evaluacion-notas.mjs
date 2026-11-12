/** Cargar notas: atajo, corrección con rúbrica y publicación. */

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
const g = await armarGrupo(api, { nombre: `Grupo correccion ${sello}`, inicio: -28, fin: -2, alumnos: 3 });
ok("evaluación simple", await enviar(api, `/api/cohorts/${g.grupoId}/grading`, { name: "Ejercicio práctico", required: true }));
const proyecto = ok("evaluación con rúbrica", await enviar(api, `/api/cohorts/${g.grupoId}/grading`, { name: "Proyecto final", required: true })).assessment;
ok("plantilla", await enviar(api, `/api/assessments/${proyecto.id}/template`, {
  scale: "numeric", minScore: 60, requiresApproval: false,
  criteria: [{ id: "", name: "Planos", maxPoints: 50 }, { id: "", name: "Presentación", maxPoints: 50 }],
  textFields: [],
}, "PUT"));

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=evaluacion`;

export async function guion(g2) {
  const { page } = g2;
  const alumno = g.inscripciones[0].nombre;
  const tabla = page.getByRole("columnheader", { name: /Ejercicio práctico/ }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const simple = page.getByLabel(`${alumno}, Ejercicio práctico`);
  await g2.paso("Una evaluación simple se carga con un atajo: «Aprobó» o «No»", simple, {
    sostener: 2.4,
    despues: () => simple.selectOption("si"),
  });
  await g2.paso("El resultado se guarda al seleccionarlo y la planilla se actualiza", tabla.getByRole("row").filter({ hasText: "Martina" }), { sostener: 3 });
  const celda = page.getByRole("button", { name: `Corregir: ${alumno}, Proyecto final` });
  await g2.paso("Una evaluación con ejercicios se corrige abriendo la celda del alumno", celda, {
    accion: "clic", sostener: 2.6, despues: () => page.getByRole("button", { name: "Publicar corrección" }).waitFor({ timeout: 15000 }),
  });
  const panel = page.getByRole("button", { name: "Publicar corrección" }).locator("xpath=ancestor::section[1]");
  await g2.paso("Cada ejercicio tiene cuatro niveles; elegir uno asigna sus puntos", panel.getByRole("group", { name: "Nivel de Planos" }), {
    sostener: 2.4,
    despues: () => panel.getByRole("group", { name: "Nivel de Planos" }).getByRole("button", { name: /Excelente/ }).click(),
  });
  await panel.getByRole("group", { name: "Nivel de Presentación" }).getByRole("button", { name: /Bueno/ }).click();
  await g2.paso("La nota se calcula sola como la suma de los puntos de los ejercicios", panel.getByText(/\/100/).first(), { sostener: 3.4 });
  await g2.paso("«Publicar corrección» deja la nota en la planilla y el alumno la ve", panel.getByRole("button", { name: "Publicar corrección" }), {
    accion: "clic", sostener: 3, despues: () => page.getByText("Corrección").first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {}),
  });
  await g2.paso("La nota publicada figura en la celda del alumno", page.getByRole("button", { name: `Corregir: ${alumno}, Proyecto final` }), { sostener: 3.2 });
  await g2.paso(
    "La plantilla se congela con la primera corrección publicada",
    page.getByText("Qué se pide y cómo se corrige cada evaluación"),
    { sostener: 3.4 }
  );
}
