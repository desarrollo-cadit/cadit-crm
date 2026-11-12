/** Emitir certificados: emisión masiva, descarga y anulación con motivo. */

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
const g = await armarGrupo(api, { nombre: `Grupo certificados ${sello}`, inicio: -28, fin: -2, alumnos: 4 });
const ev = ok("evaluación", await enviar(api, `/api/cohorts/${g.grupoId}/grading`, { name: "Trabajo final", required: true })).assessment;
ok("notas", await enviar(api, `/api/assessments/${ev.id}/results`, {
  results: g.inscripciones.map((e) => ({ enrollmentId: e.id, passed: true })),
}, "PATCH"));
// Resultado final confirmado: dos aprobados y un reprobado; el cuarto queda sin confirmar a propósito.
ok("resultado final", await enviar(api, `/api/cohorts/${g.grupoId}/final-results`, {
  entries: [
    { enrollmentId: g.inscripciones[0].id, result: "aprobado" },
    { enrollmentId: g.inscripciones[1].id, result: "aprobado" },
    { enrollmentId: g.inscripciones[2].id, result: "reprobado" },
  ],
}, "PUT"));

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=evaluacion`;

export async function guion(g2) {
  const { page } = g2;
  const emitir = page.getByRole("button", { name: "Emitir a todos los aprobados" });

  await g2.paso(
    "Un solo botón emite los certificados de todo el grupo",
    emitir,
    { sostener: 3, accion: "ver" }
  );
  await g2.paso(
    "Solo reciben certificado quienes tienen el resultado final confirmado como aprobado",
    page.getByRole("columnheader", { name: "Resultado final" }),
    { sostener: 3.6 }
  );
  await g2.paso("Al seleccionarlo, se emiten los certificados pendientes", emitir, {
    accion: "clic",
    sostener: 2.4,
    despues: () => page.getByRole("region", { name: "Resultado de la emisión" }).waitFor({ timeout: 30000 }),
  });
  await g2.paso(
    "El resultado separa emitidos, no aprobados y resultados sin confirmar, con el motivo",
    page.getByRole("region", { name: "Resultado de la emisión" }),
    { sostener: 5 }
  );
  await page.getByRole("button", { name: "Cerrar el resultado" }).click();
  const fila = page.getByRole("row").filter({ hasText: "Martina" }).filter({ has: page.getByRole("button", { name: "Anular" }) });
  await g2.paso(
    "En la columna Certificado de la planilla consta el estado de cada uno",
    fila.locator("td").last(),
    { sostener: 3 }
  );
  await g2.paso(
    "Para anular uno, seleccione «Anular»",
    fila.getByRole("button", { name: "Anular" }),
    { accion: "clic", sostener: 2.4, despues: () => page.getByPlaceholder("Se emitió sobre un grupo equivocada").waitFor({ timeout: 10000 }) }
  );
  const panel = page.getByText("Anular el certificado de").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await g2.paso("El motivo es obligatorio: queda escrito con el nombre de quien anula", panel, { sostener: 1 });
  await g2.escribir(page.getByPlaceholder("Se emitió sobre un grupo equivocada"), "Emitido por error de carga", { retardo: 40 });
  await g2.paso(
    "El certificado anulado no se borra: la verificación pública lo muestra como anulado",
    panel.getByRole("button", { name: "Anular", exact: true }),
    { accion: "clic", sostener: 3.4, despues: () => page.getByText(/Anulado el/).first().waitFor({ timeout: 15000 }) }
  );
  await g2.paso(
    "Quien no tiene el resultado final confirmado no recibe certificado",
    page.getByRole("row").filter({ hasText: "Joaquín" }).last(),
    { sostener: 3.6 }
  );
}
