/** Confirmar que un grupo sale. El grupo lo crea el guion (sufijo único). */

import { apiComo, exigir, sufijo } from "../datos.mjs";

const suf = sufijo();
const { api } = await apiComo("coordinacion");
const curso = exigir("curso", await api("/api/courses", { method: "POST", body: JSON.stringify({ name: `AutoCAD Demo ${suf}`, classCount: 6, hoursPerClass: 2, totalHours: 12, published: false }) }));
const profes = exigir("profesores", await api("/api/teachers")).teachers ?? [];
const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const grupo = exigir("grupo", await api("/api/cohorts", { method: "POST", body: JSON.stringify({
  courseId: curso.course?.id ?? curso.id, name: `Grupo Confirmar ${suf}`, startDate: dia(20), endDate: dia(60),
  daysOfWeek: "0,2", startTime: "18:30", endTime: "20:30", teacherId: profes[0]?.id ?? null, capacity: 12,
}) }));

export const rol = "coordinacion";
export const ruta = `/cohorts/${grupo.cohort.id}`;

export async function guion(g) {
  const { page } = g;
  const d = page.getByRole("dialog");
  const estado = page.getByText("Sin confirmar", { exact: true }).first();

  await g.paso("Un grupo nuevo queda «Sin confirmar» hasta que se decide que sale", estado.locator("xpath=ancestor::div[1]"), { sostener: 4 });

  await g.paso("«Confirmar grupo» abre el diálogo de confirmación", page.getByRole("button", { name: "Confirmar grupo" }), {
    accion: "clic", sostener: 3, despues: () => d.waitFor(),
  });

  await g.paso("Se puede avisar a Soporte por correo con la lista de alumnos y las licencias necesarias", d, { sostener: 5.2 });

  await g.paso("Al confirmar, si el grupo tiene todos los datos, el cronograma de clases se genera solo", d.getByRole("button", { name: "Confirmar grupo" }), {
    accion: "clic", sostener: 4.4,
    despues: () => page.getByText("Confirmado", { exact: true }).first().waitFor(),
  });

  await g.paso("El encabezado muestra quién confirmó y cuándo, y, si hubo avisos internos, su estado", page.getByText("Confirmado", { exact: true }).first().locator("xpath=ancestor::div[1]"), { sostener: 4.6 });

  await g.paso("«Quitar confirmación» la revierte; los avisos de facturación que no salieron se cancelan", page.getByRole("button", { name: "Quitar confirmación" }), { sostener: 4.4 });
}
