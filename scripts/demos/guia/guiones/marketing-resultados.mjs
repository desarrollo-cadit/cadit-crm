/** Marketing: resultados de una campaña ya enviada (campaña sembrada en la demo). */

export const rol = "coordinacion";
export const ruta = "/marketing/campanas/mc_demo_enviada";

export async function guion(g) {
  const { page } = g;
  await page.getByText("Destinatarios", { exact: true }).first().waitFor();
  await page.getByRole("table").first().waitFor();
  const cifras = page.getByText("Destinatarios", { exact: true }).first().locator("xpath=../../..");

  await g.paso("Una campaña enviada abre con sus resultados arriba", cifras, { sostener: 3.4 });

  await g.paso(
    "Los totales: enviados, pendientes, fallidos, omitidos, cancelados, bajas y clics",
    cifras,
    { sostener: 4.6 }
  );

  await g.paso("Cada destinatario aparece con su estado: enviado, falló u otro", page.getByRole("table").first(), {
    sostener: 4,
  });

  await g.paso("Para ver los fallos, filtre por estado", page.getByLabel("Filtrar por estado"), {
    sostener: 4,
    despues: async () => {
      await page.getByLabel("Filtrar por estado").selectOption({ label: "Falló" });
      await page.getByRole("cell", { name: "Falló" }).first().waitFor();
    },
  });

  await g.paso("La columna Detalle indica el motivo de cada fallo", page.getByRole("table").first(), { sostener: 4.4 });

  await g.paso("También se puede buscar por nombre o correo, o ver solo a quienes hicieron clic", page.getByPlaceholder("Buscar nombre o correo").locator("xpath=.."), {
    sostener: 4,
  });
}
