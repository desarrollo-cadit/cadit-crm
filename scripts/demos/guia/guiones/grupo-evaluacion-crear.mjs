/** Crear evaluaciones. */

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
const origen = await armarGrupo(api, { nombre: `Grupo origen ${sello}`, inicio: -60, fin: -30, alumnos: 0, pasarLista: false });
for (const n of ["Examen parcial", "Proyecto integrador"]) {
  ok("evaluación de origen", await enviar(api, `/api/cohorts/${origen.grupoId}/grading`, { name: n, required: true }));
}
const g = await armarGrupo(api, { cursoId: origen.cursoId, nombre: `Grupo nuevo ${sello}`, inicio: -7, fin: 21, alumnos: 2, pasarLista: false });

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=evaluacion`;

export async function guion(g2) {
  const { page } = g2;
  await g2.paso("Un grupo nuevo no tiene evaluaciones: se crean desde esta pestaña", page.getByText("Sin evaluaciones todavía", { exact: false }), { sostener: 3.2 });
  await g2.paso("Para crear una, escriba su nombre", page.getByPlaceholder("Nueva evaluación…"), { sostener: 1 });
  await g2.escribir(page.getByPlaceholder("Nueva evaluación…"), "Trabajo práctico 1", { retardo: 45 });
  await g2.paso("Seleccione «Agregar»", page.getByRole("button", { name: "Agregar", exact: true }), {
    accion: "clic", sostener: 2.4, despues: () => page.getByText("Trabajo práctico 1").first().waitFor({ timeout: 15000 }),
  });
  const copiar = page.getByLabel("Copiar evaluaciones de otro grupo");
  await g2.paso("También se copian las evaluaciones de otro grupo del mismo curso", copiar, {
    sostener: 2.6,
    despues: () => copiar.selectOption({ index: 1 }),
  });
  await g2.paso("Al seleccionar «Copiar», quedan independientes del grupo de origen", page.getByRole("button", { name: "Copiar", exact: true }), {
    accion: "clic", sostener: 2.6, despues: () => page.getByText("Examen parcial").first().waitFor({ timeout: 15000 }),
  });
  const bloque = page.getByText("Qué se pide y cómo se corrige cada evaluación").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await g2.paso("«Consigna» y «Plantilla» definen qué se pide y cómo se corrige", bloque, { sostener: 3.2 });
  const fila = bloque.locator("li").filter({ hasText: "Trabajo práctico 1" });
  await g2.paso("La consigna admite texto y enlaces adjuntos", fila.getByRole("button", { name: "Consigna" }), {
    accion: "clic", sostener: 2, despues: () => bloque.locator("textarea").first().waitFor({ timeout: 15000 }),
  });
  await g2.escribir(bloque.locator("textarea").first(), "Resuelva los ejercicios del plano adjunto y entregue el archivo.", { retardo: 25 });
  await g2.paso("Se guarda con «Guardar consigna»", bloque.getByRole("button", { name: "Guardar consigna" }), {
    accion: "clic", sostener: 2.4, despues: () => page.getByText("Consigna guardada.").first().waitFor({ timeout: 15000 }),
  });
  await g2.paso("La plantilla define la escala, la nota mínima y los ejercicios", fila.getByRole("button", { name: "Plantilla" }), {
    accion: "clic", sostener: 2, despues: () => page.getByLabel("Escala").waitFor({ timeout: 15000 }),
  });
  await page.getByLabel("Escala").selectOption("numeric");
  await bloque.getByRole("button", { name: "Agregar ejercicio" }).click();
  await g2.escribir(page.getByLabel("Nombre del ejercicio 1"), "Ejercicio 1", { retardo: 40 });
  await g2.paso("Los puntajes de los ejercicios deben sumar 100", page.getByText(/^Suman/).first(), { sostener: 3.2 });
  await g2.paso("Cada ejercicio admite una frase por nivel, la rúbrica que ve el alumno", page.getByLabel("Excelente — Ejercicio 1"), { sostener: 3.2 });
}
