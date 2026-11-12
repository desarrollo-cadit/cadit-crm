/** Portal del alumno: consigna, rúbrica, entrega, corrección publicada y prórroga. */
import { CONSIGNA, PLANTILLA_RUBRICA, armarGrupo, calentar, crearEvaluacion, dia, entregaDeSantiago, ok, para } from "./prof-ingreso.mjs";

export const rol = "alumno";

const d = await para("alu-evaluaciones", async () => {
  const g = await armarGrupo({ etiqueta: "Evaluaciones del alumno", conSantiago: true, companeros: 1, inicio: -14, fin: 28 });
  g.entrega = await crearEvaluacion(g, "Plano de planta", { plantilla: PLANTILLA_RUBRICA(false), consigna: CONSIGNA, plazo: { fecha: dia(12), hora: "23:59" } });
  g.corregida = await crearEvaluacion(g, "Memoria descriptiva", { plantilla: PLANTILLA_RUBRICA(false), plazo: { fecha: dia(6), hora: "23:59" } });
  await entregaDeSantiago(g, g.corregida, "Memoria descriptiva");
  const c = ok("corrección", await g.staff(`/api/assessments/${g.corregida}/corrections/${g.santiagoEnr}`, {
    method: "PUT",
    body: {
      action: "publish",
      feedback: "Muy buen trabajo. Revise la numeración de las láminas.",
      criterionScores: [
        { criterionId: "c1", points: 40, level: "excelente", comment: "Capas ordenadas" },
        { criterionId: "c2", points: 30, level: "bueno" },
        { criterionId: "c3", points: 20, level: "excelente" },
      ],
    },
  }));
  await calentar("alumno", [`/portal/cursadas/${g.santiagoEnr}`, `/api/portal/me/entregas?cursada=${g.santiagoEnr}`]);
  return g;
});
export const ruta = d ? `/portal/cursadas/${d.santiagoEnr}?tab=evaluaciones` : "/portal";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("tab", { name: /Evaluaciones/ }).waitFor({ state: "visible", timeout: 60000 });
  if ((await page.getByRole("tab", { name: /Evaluaciones/ }).getAttribute("aria-selected")) !== "true") {
    await page.getByRole("tab", { name: /Evaluaciones/ }).click();
  }
  await page.getByText("Memoria descriptiva").first().waitFor({ state: "visible", timeout: 30000 });
  const item = (n) => page.getByText(n, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

  await g.paso("La pestaña Evaluaciones muestra el estado y el plazo de cada una", page.getByText("Plano de planta").first(), { sostener: 4 });

  await g.paso("La consigna y la rúbrica se leen antes de entregar", page.getByText("Dibuje la planta del departamento").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 5 });

  const url = page.getByLabel("Enlace de tu entrega").first();
  await g.paso("Se entrega con el enlace al archivo en Drive, WeTransfer o Autodesk Docs", url, {
    sostener: 5,
    despues: async () => {
      await g.escribir(url, "https://drive.example.com/entregas/mi-plano");
      await g.escribir(page.getByLabel("Título (opcional)").first(), "Planta baja");
    },
  });

  await g.paso("«Entregar» registra el trabajo y pasa a «Entregada»", page.getByRole("button", { name: "Entregar", exact: true }).first(), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByText("Entrega recibida").first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("Una corrección publicada muestra la nota, el nivel por criterio y la devolución", page.getByText("Muy buen trabajo").first().locator("xpath=ancestor::*[contains(@class,'bg-subtle')][1]"), { sostener: 6 });

  const pedir = page.getByRole("button", { name: "Solicitar prórroga" }).first();
  await g.paso("Si hace falta más tiempo, «Solicitar prórroga» abre el pedido", pedir, {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.getByLabel("Motivo").first().waitFor({ state: "visible", timeout: 15000 });
    },
  });

  await g.paso("Se indica hasta qué día se necesita y el motivo; la decide coordinación", page.getByLabel("Motivo").first().locator("xpath=ancestor::form[1]"), {
    sostener: 5,
    despues: async () => {
      const f = new Date(Date.now() + 18 * 86400000).toISOString().slice(0, 10);
      await page.getByLabel("¿Hasta qué día necesitás?").first().fill(f);
      await g.escribir(page.getByLabel("Motivo").first(), "Viaje por trabajo durante la semana de entrega.");
    },
  });

  await g.paso("«Enviar pedido» lo deja pendiente hasta que coordinación responda", page.getByRole("button", { name: "Enviar pedido" }).first(), {
    accion: "clic",
    sostener: 4,
  });
}
