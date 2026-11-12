/** Bandeja de correcciones: revisar y aprobar o devolver. Las correcciones pendientes las arma el guion por API (sufijo único). */

import { apiComo, exigir, sufijo } from "../datos.mjs";

const suf = sufijo();
const EVAL = `Entrega final ${suf}`;
const { api } = await apiComo("coordinacion");
const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const curso = exigir("curso", await api("/api/courses", { method: "POST", body: JSON.stringify({ name: `Revit Demo ${suf}`, published: false }) }));
const grupo = exigir("grupo", await api("/api/cohorts", { method: "POST", body: JSON.stringify({ courseId: curso.course?.id ?? curso.id, name: `Grupo Correcciones ${suf}`, startDate: dia(-30), endDate: dia(30) }) }));
const gid = grupo.cohort.id;
const ev = exigir("evaluación", await api(`/api/cohorts/${gid}/grading`, { method: "POST", body: JSON.stringify({ name: EVAL }) }));
const aid = ev.assessment.id;
exigir("plantilla", await api(`/api/assessments/${aid}/template`, { method: "PUT", body: JSON.stringify({ scale: "pass_fail", minScore: null, requiresApproval: true, criteria: [], textFields: [] }) }));
const vend = (exigir("vendedores", await api("/api/sellers")).sellers ?? [])[0];
for (const [nombre, aprobado] of [["Camila", true], ["Joaquin", false]]) {
  const en = exigir("inscripción", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: gid, sellerId: vend.id, contact: { firstName: nombre, lastName: `Demo${suf}`, email: `${nombre}.${suf}@ejemplo.test`.toLowerCase() } }) }));
  exigir("corrección", await api(`/api/assessments/${aid}/corrections/${en.enrollment.id}`, { method: "PUT", body: JSON.stringify({ action: "submit", passed: aprobado, feedback: aprobado ? "Buen trabajo, cumple lo pedido." : "Faltan las vistas de planta." }) }));
}

export const rol = "coordinacion";
export const ruta = "/correcciones";

export async function guion(g) {
  const { page } = g;
  const buscador = page.getByPlaceholder("Buscar por alumno, evaluación o grupo…");
  const pendientes = page.getByRole("region", { name: "Pendientes" });
  const detalle = page.getByRole("region", { name: "Detalle" });

  await g.escribir(buscador, suf);
  await pendientes.getByText(`Camila Demo${suf}`).waitFor();

  await g.paso("La bandeja reúne las correcciones que esperan aprobación; el alumno no ve nada hasta que se aprueban", pendientes, { sostener: 5 });

  await g.paso("El buscador y los filtros de grupo y evaluación acotan la lista", page.getByText(/^Mostrando/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), { sostener: 3.6 });

  await g.paso("Al elegir una corrección se abre su detalle", pendientes.getByText(`Camila Demo${suf}`), {
    accion: "clic", sostener: 3, despues: () => detalle.getByRole("heading", { name: `Camila Demo${suf}` }).waitFor(),
  });

  await g.paso("Se revisan el resultado, la entrega y la devolución escrita por quien corrigió", detalle, { sostener: 4.4 });

  await g.paso("«Aprobar y publicar» hace visible la corrección para el alumno", detalle.getByRole("button", { name: "Aprobar y publicar" }), {
    accion: "clic", sostener: 3.8, despues: () => page.getByText("Corrección aprobada y publicada.").waitFor(),
  });

  await g.paso("Otra corrección se puede devolver", pendientes.getByText(`Joaquin Demo${suf}`), {
    accion: "clic", sostener: 3, despues: () => detalle.getByRole("button", { name: "Devolver", exact: true }).waitFor(),
  });

  await g.paso("«Devolver» pide un comentario, que lee quien corrigió y no el alumno", detalle.getByRole("button", { name: "Devolver", exact: true }), {
    accion: "clic", sostener: 4.6,
    despues: async () => g.escribir(detalle.getByRole("textbox"), "Falta completar las vistas de planta."),
  });
}
