/**
 * Cursos offline: crear un curso y editar sus temas, lecciones, cuestionarios y
 * preguntas. El curso lo crea el propio guion en pantalla, con sufijo único.
 */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/cursos-offline";

const suf = sufijo();
const CURSO = `Introducción a Revit Demo ${suf}`;
const LECCION = "Primeros pasos";
const TEMA = "La interfaz de Revit";
const CUESTIONARIO = "Repaso de la interfaz";

export async function guion(g) {
  const { page } = g;
  const dialogo = page.getByRole("dialog");
  /** Abre un diálogo con su botón, sin marcarlo como paso, y espera a que esté. */
  const abrir = async (boton) => {
    await boton.click();
    await dialogo.waitFor();
  };

  await g.paso("En la biblioteca, «Nuevo curso» crea un curso offline", page.getByRole("button", { name: "Nuevo curso" }), {
    accion: "clic",
    sostener: 2.8,
    despues: () => dialogo.waitFor(),
  });

  await g.paso("Basta con un título; se crea como borrador y los alumnos no lo ven hasta publicarlo", dialogo, {
    sostener: 5.2,
    despues: async () => {
      await g.escribir(dialogo.getByLabel("Título"), CURSO);
      await dialogo.getByRole("button", { name: "Crear y editar" }).click();
      await page.waitForURL(/\/cursos-offline\/ocrs_/);
      await page.getByRole("heading", { name: "Lecciones" }).waitFor();
    },
  });

  await abrir(page.getByRole("button", { name: "Agregar lección" }));
  await g.paso("Cada lección agrupa temas; se le pone un título y, si se quiere, una introducción", dialogo, {
    sostener: 4.2,
    despues: async () => {
      await g.escribir(dialogo.getByLabel("Título"), LECCION);
      await dialogo.getByRole("button", { name: "Guardar" }).click();
      await dialogo.waitFor({ state: "hidden" });
    },
  });

  await abrir(page.getByRole("button", { name: "Agregar tema" }).first());
  await g.paso("Cada tema puede llevar un video de Vimeo: se pega su enlace", dialogo, {
    sostener: 5.2,
    despues: async () => {
      await g.escribir(dialogo.getByLabel("Título"), TEMA);
      await g.escribir(dialogo.getByPlaceholder("https://vimeo.com/123456789"), "https://vimeo.com/76979871");
      await dialogo.getByRole("button", { name: "Guardar" }).click();
      await dialogo.waitFor({ state: "hidden" });
    },
  });

  await g.paso(
    "El ojo deshabilita un tema: los alumnos ya no lo ven y no cuenta para completar el curso",
    page.getByRole("button", { name: `Deshabilitar el tema «${TEMA}»` }),
    { accion: "clic", sostener: 4.4, despues: () => page.getByText("Deshabilitado", { exact: true }).waitFor() }
  );

  await abrir(page.getByRole("button", { name: "Agregar cuestionario" }));
  await g.paso("Un cuestionario se arma con título, porcentaje para aprobar y cantidad de intentos", dialogo, {
    sostener: 4,
    despues: async () => {
      await g.escribir(dialogo.getByLabel("Título"), CUESTIONARIO);
      await dialogo.getByRole("button", { name: "Guardar" }).click();
      await dialogo.waitFor({ state: "hidden" });
    },
  });

  await abrir(page.getByRole("button", { name: "Agregar pregunta" }).first());
  await g.paso("Cada pregunta tiene sus respuestas; se marca cuál es la correcta", dialogo, {
    sostener: 7,
    despues: async () => {
      await g.escribir(dialogo.getByRole("textbox").first(), "¿Dónde se eligen las vistas del proyecto?");
      await g.escribir(dialogo.getByLabel("Texto de la respuesta 1"), "En el Navegador de proyectos");
      await g.escribir(dialogo.getByLabel("Texto de la respuesta 2"), "En la barra de estado");
      await dialogo.getByLabel("Respuesta 1 correcta").check();
      await dialogo.getByRole("button", { name: "Guardar" }).click();
      await dialogo.waitFor({ state: "hidden" });
    },
  });
}
