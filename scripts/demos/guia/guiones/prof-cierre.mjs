/** Portal del profesor: confirmar el resultado final de cada alumno. */
import { armarGrupo, calentar, crearEvaluacion, ok, pasarLista, para } from "./prof-ingreso.mjs";

export const rol = "profesor";

const d = await para("prof-cierre", async () => {
  // Un grupo ya terminado, con toda la asistencia pasada: es lo que habilita confirmar.
  const g = await armarGrupo({ etiqueta: "Cierre de planos", conSantiago: false, companeros: 5, inicio: -40, fin: -5 });
  await pasarLista(g, g.clases.length, { sinFaltas: true });
  const ev = await crearEvaluacion(g, "Trabajo final");
  ok(
    "resultados",
    await g.staff(`/api/assessments/${ev}/results`, {
      method: "PATCH",
      body: { results: g.inscripciones.map((e, i) => ({ enrollmentId: e.id, passed: i !== 2 })) },
    })
  );
  await calentar("profesor", [`/portal/cohortes/${g.cohortId}`, `/api/portal/cohorts/${g.cohortId}/final-results`]);
  return g;
});
export const ruta = d ? `/portal/cohortes/${d.cohortId}?tab=cierre` : "/portal/dictado";

export async function guion(g) {
  const { page } = g;
  await page.getByText("Cerrar cursada · Resultado final").waitFor({ state: "visible", timeout: 60000 });
  const tabla = page.locator("div.overflow-x-auto").first();
  await tabla.waitFor({ state: "visible", timeout: 30000 });

  await g.paso(
    "En Resultado final, el profesor confirma si cada alumno aprobó o reprobó",
    page.getByText("Cerrar cursada · Resultado final").locator("xpath=ancestor::*[contains(@class,'justify-between') or contains(@class,'space-y')][1]"),
    { sostener: 5 }
  );

  await g.paso("La tabla muestra la asistencia y las evaluaciones obligatorias de cada alumno", tabla, { sostener: 4.5 });

  await g.paso("La sugerencia sale de las notas y la asistencia; no aprueba a nadie por sí sola", page.getByText(/Sugiere/).first().locator("xpath=ancestor::tr[1]"), { sostener: 5 });

  await g.paso("Sin confirmar, el alumno queda «Sin confirmar» y su certificado no se emite", page.getByText("Sin confirmar").first(), { sostener: 4.5 });

  const confirmar = page.getByRole("button", { name: /Confirmar sugeridos/ });
  await g.paso("«Confirmar sugeridos» acepta de una vez las sugerencias", confirmar, {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.getByRole("button", { name: "Confirmar", exact: true }).waitFor({ state: "visible", timeout: 15000 });
    },
  });

  await g.paso("Se pide una última confirmación antes de guardar", page.getByRole("button", { name: "Confirmar", exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), {
    accion: "ver",
    sostener: 4,
  });

  await g.paso("Al confirmar, cada alumno muestra su resultado y quién lo confirmó", page.getByRole("button", { name: "Confirmar", exact: true }), {
    accion: "clic",
    sostener: 5,
    despues: async () => {
      await page.getByText(/Confirmado por/).first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("Cada resultado se puede corregir con «Aprobar» o «Reprobar»; reprobar anula el certificado", tabla, { sostener: 5 });
}
