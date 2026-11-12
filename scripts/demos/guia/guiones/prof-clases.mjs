/** Portal del profesor: clases, asistencia (solo lectura) y grabaciones. */
import { armarGrupo, calentar, grabacionDeClase, pasarLista, para } from "./prof-ingreso.mjs";

export const rol = "profesor";
export const ruta = "/portal/dictado"; // se reemplaza abajo por el grupo propio

const d = await para("prof-clases", async () => {
  const g = await armarGrupo({ etiqueta: "Planos de clase", conSantiago: false, companeros: 4, inicio: -21, fin: 21 });
  await pasarLista(g, 3);
  await grabacionDeClase(g, 1, `https://zoom.us/rec/share/guia-${g.s}`);
  await calentar("profesor", [`/portal/cohortes/${g.cohortId}`, `/api/portal/cohorts/${g.cohortId}/classes`, `/api/portal/classes/${g.clases[0].id}/attendance`]);
  return g;
});

export async function guion(g) {
  const { page } = g;
  await page.goto(`http://localhost:3006/portal/cohortes/${d.cohortId}`, { waitUntil: "load" });
  const lista = page.locator("ul.divide-y").first();
  await lista.waitFor({ state: "visible", timeout: 60000 });

  await g.paso("La pestaña Clases lista el cronograma del grupo, con la fecha y la hora de cada clase", lista, { sostener: 4.5 });

  const fila = page.locator("li").filter({ hasText: "Clase 1" }).filter({ has: page.getByRole("button", { name: /Ver grabación/ }) }).first();
  await g.paso("Seleccione una clase para consultar su asistencia", fila.getByRole("button").first(), {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.getByRole("button", { name: "Volver a las clases" }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso("La asistencia es de solo lectura: la registra la coordinación", page.getByText("La asistencia la registra la coordinación").first(), { sostener: 4.5 });

  await g.paso("Cada alumno muestra su estado y quién dejó la marca", page.locator("ul.divide-y").first(), { sostener: 4.5 });

  await g.paso("«Volver a las clases» regresa al cronograma", page.getByRole("button", { name: "Volver a las clases" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("button", { name: /Ver grabación/ }).first().waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso("Si la clase tiene grabación, «Ver grabación» la abre en esta misma pantalla", page.getByRole("button", { name: /Ver grabación/ }).first(), {
    accion: "clic",
    sostener: 5,
    despues: async () => {
      await page.locator('iframe[title^="Grabación de la clase"]').first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("Debajo del reproductor, «Abrir en Zoom» ofrece la grabación en una pestaña nueva", page.getByRole("link", { name: /Abrir en Zoom/ }).first(), { sostener: 4 });
}
