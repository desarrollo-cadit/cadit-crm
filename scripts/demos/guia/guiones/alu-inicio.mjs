/** Portal del alumno: el inicio y la guía del portal. */

export const rol = "alumno";
export const ruta = "/portal";

const seccion = (page, texto) => page.locator("section").filter({ has: page.getByText(texto, { exact: true }) }).first();

export async function guion(g) {
  const { page } = g;
  await page.getByRole("heading", { name: /^Hola,/ }).waitFor({ state: "visible", timeout: 60000 });
  await page.getByText("Mis cursos", { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });

  await g.paso("El inicio del portal saluda al alumno y resume cuántos cursos cursa", page.getByRole("heading", { name: /^Hola,/ }).locator("xpath=ancestor::*[2]"), { sostener: 4 });

  await g.paso("A la izquierda, el menú lleva al inicio, al estado de cuenta, a los certificados y a los cursos offline", page.locator("nav").first(), { sostener: 5 });

  await g.paso("«Próxima clase» muestra el día, la hora y, cuando corresponde, el botón para ingresar", page.getByText("Próxima clase").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 5 });

  await g.paso("«Mis cursos» lista cada cursada con su avance, su asistencia y sus evaluaciones", seccion(page, "Mis cursos"), { sostener: 5 });

  await g.paso("El estado de cuenta resume el saldo; «Cuotas y pagos» abre el detalle", seccion(page, "Estado de cuenta"), { sostener: 4.5 });

  await g.paso("Mi escolaridad ofrece los cursos y notas en un documento PDF", seccion(page, "Mi escolaridad"), { sostener: 4.5 });

  await g.paso("«Guía del portal» explica cada sección del menú", page.getByRole("link", { name: "Guía del portal" }).first(), {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.getByRole("heading", { name: "Guía del portal" }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso("La guía se puede consultar en cualquier momento", page.getByRole("heading", { name: "Guía del portal" }).locator("xpath=ancestor::*[2]"), { sostener: 4.5 });
}
