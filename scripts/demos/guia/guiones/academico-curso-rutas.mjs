/** Académico: «Cursos siguientes» y «Evaluaciones modelo» de un curso (cursos propios del guion). */

import { apiComo, exigir, sufijo } from "../datos.mjs";

const suf = sufijo();
const BASE_ = `Revit Básico Demo ${suf}`;
const SIGUIENTE = `Revit Avanzado Demo ${suf}`;
const { api } = await apiComo("coordinacion");
for (const name of [BASE_, SIGUIENTE]) exigir("curso", await api("/api/courses", { method: "POST", body: JSON.stringify({ name, published: false }) }));

export const rol = "coordinacion";
export const ruta = "/academico?tab=cursos";

export async function guion(g) {
  const { page } = g;
  const d = page.getByRole("dialog");
  const buscador = page.getByPlaceholder("Buscar curso por nombre…");

  await g.escribir(buscador, suf);
  await page.getByText(BASE_).first().waitFor();

  await g.paso("Cada curso tiene dos accesos: «Cursos siguientes» y «Evaluaciones modelo»", page.getByText(BASE_).first().locator("xpath=ancestor::li[1]"), { sostener: 3.6 });

  await g.paso("«Cursos siguientes» abre la ruta sugerida para quien termina el curso", page.getByRole("button", { name: `Cursos siguientes de ${BASE_}` }), {
    accion: "clic", sostener: 3.4, despues: () => d.waitFor(),
  });

  await g.paso("Se agregan cursos, que se sugieren en ese orden salvo los ya cursados", d.getByLabel("Agregar un curso"), {
    sostener: 4.4,
    despues: async () => {
      await d.getByLabel("Agregar un curso").selectOption({ label: SIGUIENTE });
      await d.getByRole("button", { name: "Agregar", exact: true }).click();
    },
  });

  await g.paso("Las flechas cambian el orden y «Guardar» deja la ruta", d.getByRole("button", { name: "Guardar", exact: true }), {
    accion: "clic", sostener: 3.4, despues: () => d.waitFor({ state: "hidden" }),
  });

  await g.paso("«Evaluaciones modelo» guarda evaluaciones que cada grupo del curso puede copiar", page.getByRole("button", { name: `Evaluaciones modelo de ${BASE_}` }), {
    accion: "clic", sostener: 3.6, despues: () => d.waitFor(),
  });

  await g.paso("Se carga un modelo con su nombre, consigna y plantilla de corrección", d.getByRole("button", { name: /Nueva evaluación modelo/ }), {
    accion: "clic", sostener: 3.4, despues: () => d.getByLabel("Nombre").waitFor(),
  });

  await g.paso("Al guardarlo, los grupos lo toman con «Tomar del curso»; la copia no cambia si el modelo se edita después", d.getByLabel("Nombre"), {
    sostener: 5.4,
    despues: async () => {
      await g.escribir(d.getByLabel("Nombre"), "Trabajo final");
      await d.getByRole("button", { name: "Guardar evaluación modelo" }).click();
      await d.getByText("Trabajo final").first().waitFor();
    },
  });
}
