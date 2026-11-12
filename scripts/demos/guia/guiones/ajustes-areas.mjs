/** Configuración › Áreas: casilla, copias, horario e interruptor de la derivación. */

export const rol = "direccion";
export const ruta = "/settings/areas";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const ventas = tarjeta(page.getByRole("heading", { name: "Ventas", exact: true }));

  await g.paso(
    "Cada área define a qué casilla y con qué copias llegan las derivaciones y los avisos",
    page.getByRole("heading", { name: "Áreas", exact: true }).locator("xpath=.."),
    { sostener: 3.8 }
  );

  await g.paso("El interruptor enciende o apaga la derivación del asistente de WhatsApp", tarjeta(page.getByRole("heading", { name: "Derivación del asistente" })), {
    sostener: 3.8,
  });

  await g.paso("Ventas, Soporte, Administración y Nuevos interesados tienen su tarjeta", ventas, { sostener: 3.4 });

  await g.paso("La casilla recibe los avisos; las copias van separadas por coma", ventas.locator("xpath=.//div[contains(@class,'md:grid-cols-2')][1]"), {
    sostener: 4,
  });

  await g.paso("En Ventas y Nuevos interesados se puede copiar a vendedores activos", ventas.getByText("Vendedores en copia").locator("xpath=.."), {
    sostener: 3.6,
  });

  await g.paso("El texto al cliente y el horario de atención se definen por área", ventas.getByText("Horario de atención").locator("xpath=ancestor::fieldset[1]"), {
    sostener: 3.8,
  });

  await g.paso("«Guardar» aplica los cambios solo a esa área", ventas.getByRole("button", { name: /^Guardar/ }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("guardada.").first().waitFor({ timeout: 15000 });
    },
    sostener: 3.2,
  });
}
