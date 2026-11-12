/** Académico: crear un grupo en pantalla (curso propio del guion, sufijo único). */

import { apiComo, exigir, sufijo } from "../datos.mjs";

const suf = sufijo();
const CURSO = `Revit Arquitectura Demo ${suf}`;
const { api } = await apiComo("coordinacion");
exigir("curso", await api("/api/courses", { method: "POST", body: JSON.stringify({ name: CURSO, classCount: 8, hoursPerClass: 2, totalHours: 16, published: false }) }));
const profes = exigir("profesores", await api("/api/teachers")).teachers ?? [];
const PROFESOR = profes[0]?.name;

export const rol = "coordinacion";
export const ruta = "/academico?tab=grupos";

const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export async function guion(g) {
  const { page } = g;
  const d = page.getByRole("dialog");

  await g.paso("En la pestaña Grupos, «Nuevo grupo» abre el formulario", page.getByRole("button", { name: "Nuevo grupo" }), {
    accion: "clic", sostener: 2.8, despues: () => d.waitFor(),
  });

  await g.paso("Se elige el curso del que sale el grupo", page.locator("#cohort-course").locator("xpath=ancestor::div[1]"), {
    sostener: 3.4,
    despues: () => page.locator("#cohort-course").selectOption({ label: CURSO }),
  });

  await g.paso("Se indica el inicio; el fin se calcula con los días de cursada y las clases del curso", page.locator("#cohort-start").locator("xpath=ancestor::div[2]"), {
    sostener: 5,
    despues: async () => {
      await page.locator("#cohort-start").fill(dia(14));
      await page.locator("#cohort-start").blur();
    },
  });

  await g.paso("«Entrega final» es opcional y posterior al fin; las evaluaciones sin plazo vencen ese día", page.locator("#cohort-delivery").locator("xpath=ancestor::div[1]"), {
    sostener: 4.4,
    despues: () => page.locator("#cohort-delivery").fill(dia(80)),
  });

  if (PROFESOR) {
    await g.paso("Se asigna el profesor", page.locator("#cohort-teacher").locator("xpath=ancestor::div[2]"), {
      sostener: 3,
      despues: () => page.locator("#cohort-teacher").selectOption({ label: PROFESOR }),
    });
  }

  await g.paso("Los días y el horario de cada clase definen el cronograma", page.getByText("Días de la semana").locator("xpath=ancestor::div[1]"), {
    sostener: 4.6,
    despues: async () => {
      await page.locator("#cohort-start-time").fill("18:30");
      await page.locator("#cohort-end-time").fill("20:30");
      await d.getByRole("button", { name: "Lun", exact: true }).click();
      await d.getByRole("button", { name: "Mié", exact: true }).click();
    },
  });

  await g.paso("El aula virtual indica la cuenta de Zoom y avisa si dos grupos se superponen", page.locator("#cohort-room").locator("xpath=ancestor::div[1]"), { sostener: 4 });

  await g.paso("«Guardar» crea el grupo", d.getByRole("button", { name: "Guardar", exact: true }), {
    accion: "clic", sostener: 3,
    despues: async () => {
      await Promise.race([d.waitFor({ state: "hidden" }), d.getByRole("button", { name: "Entendido" }).click().catch(() => {})]);
    },
  });
}
