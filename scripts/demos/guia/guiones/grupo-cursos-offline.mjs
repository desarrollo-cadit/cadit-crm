/** Cursos offline de un grupo: qué hereda cada alumno y dónde están las excepciones. */

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
const g = await armarGrupo(api, { nombre: `Grupo offline ${sello}`, inicio: -14, fin: 14, alumnos: 3, pasarLista: false });

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=cursos-offline`;

export async function guion(g2) {
  const { page } = g2;
  const seccion = page.locator("section[aria-labelledby='offline-asignados']");
  const primera = seccion.locator("li").first();

  await g2.paso(
    "La pestaña Cursos offline lista la biblioteca de cursos grabados disponible",
    seccion,
    { sostener: 3.4 }
  );
  await g2.paso(
    "Al marcar un curso, todos los alumnos del grupo lo heredan",
    primera,
    { accion: "clic", sostener: 3, despues: () => primera.getByRole("checkbox").check() }
  );
  await g2.paso(
    "Los cambios se aplican al seleccionar «Guardar»",
    seccion.getByRole("button", { name: "Guardar", exact: true }),
    { accion: "clic", sostener: 3, despues: () => page.getByText("Cambios guardados.").first().waitFor({ timeout: 15000 }) }
  );
  await g2.paso(
    "«Ver contenido» abre el curso para revisar sus temas",
    primera.getByRole("link", { name: "Ver contenido" }),
    { sostener: 2.6 }
  );
  await g2.paso(
    "Más abajo figuran los intentos de cuestionarios de los alumnos del grupo",
    page.locator("section[aria-labelledby='offline-intentos']"),
    { sostener: 3.2 }
  );
  await g2.paso(
    "Las excepciones por alumno se manejan desde la pestaña Alumnos",
    page.getByRole("button", { name: "Alumnos", exact: true }),
    { accion: "clic", sostener: 2.8, despues: () => page.getByRole("button", { name: "Ver detalle" }).first().waitFor({ timeout: 20000 }) }
  );
  await g2.paso("Se abre la fila de la persona", page.getByRole("button", { name: "Ver detalle" }).first(), {
    accion: "clic",
    sostener: 2,
    despues: () => page.locator("p.font-medium", { hasText: /^Cursos offline$/ }).first().waitFor({ timeout: 15000 }),
  });
  await g2.paso(
    "Allí se ve qué cursos hereda del grupo y se le puede dar o quitar alguno",
    page.locator("p.font-medium", { hasText: /^Cursos offline$/ }).first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"),
    { sostener: 4 }
  );
  await g2.paso("El acceso vence junto con el del grupo, un mes después de su fin", null, { sostener: 3.4 });
}
