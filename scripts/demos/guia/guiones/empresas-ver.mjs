/** Empresas: listado, búsqueda y reporte de avance. */
export const rol = "coordinacion";
export const ruta = "/empresas";

export async function guion(g) {
  const { page } = g;
  const buscador = page.getByRole("searchbox");
  await buscador.waitFor();
  const fila = page.getByRole("listitem").filter({ hasText: "Servicios Aurora S.A." }).first();

  await g.paso("Empresas reúne las empresas clientes, sus datos de facturación y el avance de su gente", page.getByRole("heading", { name: "Empresas" }).locator("xpath=ancestor::header[1]"), { sostener: 4 });
  await g.paso("Se busca por razón social, nombre comercial o RUT", buscador, {
    sostener: 4,
    despues: async () => {
      await g.escribir(buscador, "aurora");
      await fila.waitFor();
    },
  });
  await g.paso("Cada fila indica el RUT y cuántas personas tiene la empresa", fila, { sostener: 3.8 });
  await g.paso("Al abrir una empresa se ven sus datos de facturación", fila.getByRole("button").first(), {
    accion: "clic",
    sostener: 3.6,
    despues: () => page.getByText("Condición de pago").first().waitFor({ timeout: 60000 }),
  });
  await g.paso(
    "El reporte lista a cada empleado con su grupo, su asistencia y su resultado",
    page.getByText(/Asistió a|sin asistencia registrada/).first().locator("xpath=ancestor::ul[1]"),
    { sostener: 5 }
  );
  await g.paso("El resultado solo es «Aprobado» o «No aprobado» cuando el profesor lo confirmó", page.getByText(/Resultado pendiente|En curso/).first(), { sostener: 4 });
  await g.paso("El ícono de descarga exporta el reporte de la empresa en CSV", fila.getByRole("link", { name: /Exportar CSV/ }), { sostener: 3.6 });
}
