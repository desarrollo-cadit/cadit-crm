/** Académico: alta de un profesor (costo por hora, cursos que dicta) y de un aula virtual. */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/academico?tab=profesores";

const suf = sufijo();
const PROFESOR = `Profesor Demo ${suf}`;
const AULA = `Zoom Demo ${suf}`;
const sala = `https://zoom.us/j/${String(Date.now()).slice(-10)}`;

export async function guion(g) {
  const { page } = g;
  const dialogo = page.getByRole("dialog");

  await g.paso("En la pestaña Profesores, «Nuevo profesor» abre el alta", page.getByRole("button", { name: "Nuevo profesor" }), {
    accion: "clic",
    sostener: 2.8,
    despues: () => dialogo.waitFor(),
  });

  await g.paso(
    "Se cargan el nombre, el correo y el título que se muestra en la web",
    page.locator("#teacher-name").locator("xpath=ancestor::div[1]"),
    {
      sostener: 4.6,
      despues: async () => {
        await g.escribir(page.locator("#teacher-name"), PROFESOR);
        await g.escribir(page.locator("#teacher-email"), `profesor.${suf}@ejemplo.test`);
        await g.escribir(page.locator("#teacher-title"), "Arquitecto");
      },
    }
  );

  await g.paso(
    "El costo por hora solo lo ve quien puede editar Académico o consultar cobranza",
    page.locator("#teacher-rate").locator("xpath=ancestor::div[1]"),
    { sostener: 4, despues: () => g.escribir(page.locator("#teacher-rate"), "1200") }
  );

  await g.paso("Se marcan los cursos que dicta", dialogo.getByText("Cursos que dicta").locator("xpath=ancestor::div[1]"), {
    sostener: 3,
    despues: () => dialogo.locator("input[type=checkbox]").first().check(),
  });

  await g.paso("«Guardar» crea al profesor", dialogo.getByRole("button", { name: "Guardar", exact: true }), {
    accion: "clic",
    sostener: 2.4,
    despues: () => dialogo.waitFor({ state: "hidden" }),
  });

  await g.paso(
    "La fila muestra su costo y sus cursos; «Licencias» abre los programas que tiene asignados",
    page.getByText(PROFESOR, { exact: true }).locator("xpath=ancestor::li[1]"),
    { sostener: 4.4 }
  );

  await g.paso("En la pestaña Aulas se cargan las salas de reunión", page.getByRole("button", { name: "Aulas", exact: true }), {
    accion: "clic",
    sostener: 2.6,
    despues: () => page.getByRole("button", { name: /Nueva aula/ }).waitFor(),
  });

  await g.paso("Cada aula lleva un nombre, el enlace de la sala y la cuenta que la usa", page.getByRole("button", { name: /Nueva aula/ }), {
    accion: "clic",
    sostener: 5.4,
    despues: async () => {
      await dialogo.waitFor();
      await g.escribir(page.locator("#room-name"), AULA);
      await g.escribir(page.locator("#room-url"), sala);
      await g.escribir(page.locator("#room-account"), `zoom.${suf}@ejemplo.test`);
    },
  });

  await g.paso("«Crear aula» la deja disponible para asignarla a los grupos", dialogo.getByRole("button", { name: "Crear aula" }), {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByText(AULA, { exact: true }).waitFor(),
  });
}
