/** Portal del alumno: una cursada con clases, grabación, material y avisos. */
import { armarGrupo, calentar, clienteDe, grabacionDeClase, ok, pasarLista, para } from "./prof-ingreso.mjs";

export const rol = "alumno";

const d = await para("alu-cursada", async () => {
  const g = await armarGrupo({ etiqueta: "Planos del alumno", conSantiago: true, companeros: 2, inicio: -21, fin: 21 });
  await pasarLista(g, 4);
  await grabacionDeClase(g, 1, `https://zoom.us/rec/share/guia-alu-${g.s}`);
  const prof = await clienteDe("profesor");
  ok("material", await prof(`/api/portal/cohorts/${g.cohortId}/resources`, { method: "POST", body: { title: "Guía de la clase 1 — Interfaz y comandos", url: "https://drive.example.com/guia-1", kind: "guia" } }));
  ok("aviso", await g.staff(`/api/cohorts/${g.cohortId}/announcements`, { method: "POST", body: { title: "Bienvenida al grupo", body: "Recuerden instalar el programa antes de la segunda clase." } }));
  await calentar("alumno", [`/portal/cursadas/${g.santiagoEnr}`, `/api/portal/me/cursadas/${g.santiagoEnr}`]);
  return g;
});
export const ruta = d ? `/portal/cursadas/${d.santiagoEnr}` : "/portal";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("tab", { name: /Clases/ }).waitFor({ state: "visible", timeout: 60000 });

  await g.paso("La cursada reúne las fechas, el avance de las clases y la asistencia del alumno", page.getByText("Mi asistencia").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 5 });

  await g.paso("«Tu recorrido» indica qué falta para finalizar el curso", page.getByText(/recorrido/i).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 4.5 });

  await g.paso("La pestaña Clases muestra cada fecha, su horario y la asistencia registrada", page.getByRole("tab", { name: /Clases/ }), {
    accion: "clic",
    sostener: 4.5,
    despues: async () => {
      await page.getByRole("button", { name: /Ver grabación/ }).first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("«Ver grabación» reproduce la clase en esta misma pantalla", page.getByRole("button", { name: /Ver grabación/ }).first(), {
    accion: "clic",
    sostener: 5,
    despues: async () => {
      await page.locator('iframe[title^="Grabación de la clase"]').first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("En Material se encuentran las guías y enlaces del grupo", page.getByRole("tab", { name: /Material/ }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByText(/Guía de la clase 1/).first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("El material se abre con un clic, en una pestaña nueva", page.getByText(/Guía de la clase 1/).first().locator("xpath=ancestor::li[1]"), { sostener: 3.5 });

  await g.paso("En Avisos figuran los comunicados de la academia", page.getByRole("tab", { name: /Avisos/ }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByText("Bienvenida al grupo").first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("Un aviso muestra su título, el texto y la fecha", page.getByText("Bienvenida al grupo").first().locator("xpath=ancestor::*[contains(@class,'rounded') or self::li][1]"), { sostener: 4 });
}
