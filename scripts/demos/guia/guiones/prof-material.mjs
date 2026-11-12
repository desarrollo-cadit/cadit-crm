/** Portal del profesor: material y avisos del grupo. */
import { armarGrupo, calentar, ok, para } from "./prof-ingreso.mjs";

export const rol = "profesor";

const d = await para("prof-material", async () => {
  const g = await armarGrupo({ etiqueta: "Material de planos", conSantiago: false, companeros: 3, inicio: -7, fin: 35 });
  ok("aviso", await g.staff(`/api/cohorts/${g.cohortId}/announcements`, {
    method: "POST",
    body: { title: "Bienvenida al grupo", body: "Recuerden instalar el programa antes de la segunda clase." },
  }));
  await calentar("profesor", [`/portal/cohortes/${g.cohortId}`, `/api/portal/cohorts/${g.cohortId}/content`]);
  return g;
});
export const ruta = d ? `/portal/cohortes/${d.cohortId}?tab=material` : "/portal/dictado";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("button", { name: "Publicar material" }).waitFor({ state: "visible", timeout: 60000 });
  await page.getByText("Bienvenida al grupo").first().waitFor({ state: "visible", timeout: 30000 });

  await g.paso("La pestaña Material reúne los avisos de la academia y el material que se publique para el grupo", page.getByRole("button", { name: "Publicar material" }).locator("xpath=.."), { sostener: 4.5 });

  await g.paso("Los avisos los publica la academia y el profesor los consulta", page.getByText("Bienvenida al grupo").first().locator("xpath=ancestor::li[1]"), { sostener: 4 });

  await g.paso("«Publicar material» permite compartir un enlace con los alumnos del grupo", page.getByRole("button", { name: "Publicar material" }), {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.locator("#material-title").waitFor({ state: "visible", timeout: 15000 });
    },
  });

  await g.paso("Se indica el título, el enlace de Drive, WeTransfer o Autodesk Docs, y el tipo", page.getByRole("dialog"), {
    sostener: 6,
    despues: async () => {
      await g.escribir(page.locator("#material-title"), "Ejercicios de práctica — Clase 2");
      await g.escribir(page.locator("#material-url"), "https://drive.example.com/ejercicios-clase-2");
      await page.locator("#material-kind").selectOption("ejemplo");
    },
  });

  await g.paso("Al publicar, el material queda visible de inmediato para los alumnos", page.getByRole("button", { name: "Publicar", exact: true }), {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.locator("#material-title").waitFor({ state: "detached", timeout: 20000 });
      await page.getByRole("link", { name: /Ejercicios de práctica — Clase 2/ }).waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("El nuevo material aparece en la lista del grupo", page.getByRole("link", { name: /Ejercicios de práctica — Clase 2/ }), { sostener: 4 });
}
