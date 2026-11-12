/** Académico: crear y editar un curso (formulario de alta con datos ficticios). */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/academico?tab=cursos";

const suf = sufijo();
const NOMBRE = `Revit Estructuras Demo ${suf}`;

export async function guion(g) {
  const { page } = g;
  const dialogo = page.getByRole("dialog");

  await g.paso("En la pestaña Cursos, «Nuevo curso» abre el formulario de alta", page.getByRole("button", { name: "Nuevo curso" }), {
    accion: "clic",
    sostener: 3,
    despues: () => dialogo.waitFor(),
  });

  await g.paso(
    "Se indica el nombre y el tipo: curso, módulo o taller",
    page.locator("#course-name").locator("xpath=ancestor::div[2]"),
    { sostener: 3.8, despues: () => g.escribir(page.locator("#course-name"), NOMBRE) }
  );

  await g.paso(
    "La cantidad de clases y las horas por clase calculan solas la duración total",
    page.locator("#course-classes").locator("xpath=ancestor::div[2]"),
    {
      sostener: 4.6,
      despues: async () => {
        await g.escribir(page.locator("#course-classes"), "12");
        await g.escribir(page.locator("#course-hours-per-class"), "2,5");
      },
    }
  );

  await g.paso("El nivel y la modalidad ayudan a ordenar el catálogo", page.locator("#course-level").locator("xpath=ancestor::div[2]"), {
    sostener: 3.4,
    despues: async () => {
      await page.locator("#course-level").selectOption({ label: "Inicial" });
      await page.locator("#course-modality").selectOption({ label: "En vivo" });
    },
  });

  await g.paso(
    "«Publicar en el catálogo web» decide si el curso aparece en el sitio",
    page.getByText("Publicar en el catálogo web").locator("xpath=ancestor::label[1]"),
    { sostener: 3.6 }
  );

  await g.paso(
    "«Gratuito» evita que el curso cuente como venta en los reportes",
    page.getByText("Gratuito: no cuenta como venta").locator("xpath=ancestor::label[1]"),
    { sostener: 3.2 }
  );

  await g.paso("«Guardar» crea el curso", dialogo.getByRole("button", { name: "Guardar", exact: true }), {
    accion: "clic",
    sostener: 2.8,
    despues: () => dialogo.waitFor({ state: "hidden" }),
  });

  const buscador = page.getByPlaceholder("Buscar curso por nombre…");
  await g.paso("El buscador lo encuentra en la lista de cursos", buscador, {
    sostener: 3.4,
    despues: async () => {
      await g.escribir(buscador, suf);
      await page.getByText(NOMBRE).first().waitFor();
    },
  });

  await g.paso(
    "El lápiz reabre el formulario para editar el curso o borrarlo",
    page.getByRole("button", { name: `Editar ${NOMBRE}` }),
    { accion: "clic", sostener: 3.2, despues: () => dialogo.getByRole("heading", { name: "Editar curso" }).waitFor() }
  );
}
