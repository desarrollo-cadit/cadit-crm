/** Constancia en PDF para una empresa. */
export const rol = "coordinacion";
export const ruta = "/empresas";

export async function guion(g) {
  const { page } = g;
  const buscador = page.getByRole("searchbox");
  await buscador.waitFor();
  await g.escribir(buscador, "servicios aurora");
  const fila = page.getByRole("listitem").filter({ hasText: "Servicios Aurora S.A." }).first();
  await fila.getByRole("button").first().click();
  const seccion = page.getByRole("heading", { name: "Constancia para la empresa" }).locator("xpath=ancestor::section[1]");
  await seccion.waitFor({ timeout: 60000 });

  await g.paso("Al abrir una empresa se encuentra la constancia: una carta en PDF para enviarle", seccion, { sostener: 4.2 });
  await g.paso("«Alcance» permite elegir el informe general o solo un grupo", seccion.getByLabel("Alcance"), { sostener: 4 });
  await g.paso("La fecha de corte fija hasta qué día se cuentan asistencia y resultados", seccion.getByLabel("Fecha de corte"), { sostener: 4 });
  await g.paso(
    "El resultado final solo se informa cuando el profesor lo confirmó; antes figura «Resultado pendiente»",
    seccion.getByText(/mientras tanto figura/).first(),
    { sostener: 4.6 }
  );
  await g.paso("Los avisos «Antes de mandarla» son solo para el equipo y nunca van al PDF", seccion.getByText("Antes de mandarla"), { sostener: 4.6 });
  await g.paso("«Descargar constancia» genera el PDF con el alcance y la fecha elegidos", seccion.getByRole("link", { name: "Descargar constancia" }), { sostener: 4 });
}
