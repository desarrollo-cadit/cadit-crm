/** Portal del profesor: evaluaciones, entregas y correcciones. */
import { CONSIGNA, PLANTILLA_RUBRICA, armarGrupo, calentar, crearEvaluacion, entregaDeSantiago, para } from "./prof-ingreso.mjs";

export const rol = "profesor";

const d = await para("prof-evaluaciones", async () => {
  const g = await armarGrupo({ etiqueta: "Planos con entregas", conSantiago: true, companeros: 3, inicio: -14, fin: 28 });
  g.rubrica = await crearEvaluacion(g, "Plano de planta", { plantilla: PLANTILLA_RUBRICA(true), consigna: CONSIGNA });
  g.practico = await crearEvaluacion(g, "Ejercicio de comandos");
  await entregaDeSantiago(g, g.rubrica, "Planta del departamento");
  await calentar("profesor", [`/portal/cohortes/${g.cohortId}`, `/api/portal/cohorts/${g.cohortId}/grading`, `/api/portal/cohorts/${g.cohortId}/entregas`]);
  return g;
});
export const ruta = d ? `/portal/cohortes/${d.cohortId}?tab=evaluaciones` : "/portal/dictado";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("combobox", { name: /Ejercicio de comandos/ }).first().waitFor({ state: "visible", timeout: 60000 });

  await g.paso("La pestaña Evaluaciones lista a cada alumno con las evaluaciones que define la academia", page.locator("ul.divide-y").first(), { sostener: 4.5 });

  const sel = page.getByRole("combobox", { name: /Lucía Ferrero, Ejercicio de comandos/ });
  await g.paso("En una evaluación simple se elige Aprobado o No aprobado, y se guarda al elegir", sel, {
    sostener: 4.5,
    despues: async () => {
      await sel.selectOption("si");
      await page.waitForTimeout(1200);
    },
  });

  await g.paso(
    "En una evaluación con rúbrica, el botón abre el formulario de corrección",
    page.getByRole("button", { name: /Corregir: Santiago Rodríguez, Plano de planta/ }),
    { sostener: 3.5 }
  );

  await g.paso("En Entregas se ven los trabajos que enviaron los alumnos", page.getByRole("button", { name: "Entregas" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("heading", { name: "Plano de planta" }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  const bloque = page.locator("section").filter({ has: page.getByRole("heading", { name: "Plano de planta" }) }).first();
  await g.paso("Cada entrega es un enlace que se abre fuera de la plataforma", bloque.getByRole("link", { name: "Planta del departamento" }), { sostener: 4 });

  await g.paso("«Corregir» abre la corrección de esa entrega", bloque.locator("li").filter({ hasText: "Santiago" }).getByRole("button", { name: "Corregir" }).first(), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("group", { name: /Nivel de Organización del plano/ }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  const niveles = ["Organización del plano:Excelente", "Acotación y cotas:Bueno", "Presentación final:Excelente"];
  await g.paso("Cada criterio se califica por nivel y el nivel pone los puntos", page.getByRole("group", { name: /Nivel de Organización del plano/ }), {
    sostener: 5,
    despues: async () => {
      for (const n of niveles) {
        const [crit, nivel] = n.split(":");
        await page.getByRole("group", { name: `Nivel de ${crit}` }).getByRole("button", { name: new RegExp(nivel) }).click();
        await page.waitForTimeout(500);
      }
    },
  });

  await g.paso("La devolución escrita es lo que leerá el alumno", page.getByPlaceholder("Qué está bien, qué hay que corregir y con qué criterio."), {
    sostener: 4,
    despues: async () => {
      await g.escribir(page.getByPlaceholder("Qué está bien, qué hay que corregir y con qué criterio."), "Buen trabajo. Revise las cotas del baño.");
    },
  });

  await g.paso("Esta evaluación requiere aprobación: «Enviar a aprobación» la deriva a coordinación", page.getByRole("button", { name: "Enviar a aprobación" }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByText("Corrección enviada a aprobación.").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    },
  });
}
