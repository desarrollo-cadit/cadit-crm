/** Configuración › Plantillas: el formulario de una plantilla de WhatsApp (sin enviarla a Meta). */

export const rol = "direccion";
export const ruta = "/settings/templates";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const nueva = tarjeta(page.getByRole("heading", { name: "Nueva plantilla" }));

  await g.paso(
    "Las plantillas permiten reabrir una conversación cuando la ventana de 24 horas se cerró",
    page.getByText("Las plantillas permiten reabrir conversaciones"),
    { sostener: 4 }
  );

  await g.paso("Meta debe aprobar cada plantilla; su estado se ve junto a ella", page.getByRole("button", { name: "Sincronizar" }), {
    sostener: 3.6,
  });

  await g.paso("Se escribe el nombre y se elige el idioma y la categoría", nueva.locator("xpath=.//div[contains(@class,'grid')][1]"), {
    despues: async () => {
      await g.escribir(page.locator("#tpl-name"), "seguimiento_demo", { retardo: 45 });
      await page.locator("#tpl-lang").selectOption("es");
    },
    sostener: 4,
  });

  await g.paso("El cuerpo admite una sola variable, escrita como {{1}}", page.locator("#tpl-body"), {
    despues: async () => {
      await g.escribir(page.locator("#tpl-body"), "Hola {{1}}, seguimos disponibles. ¿Retomamos su consulta?", { retardo: 30 });
    },
    sostener: 4.4,
  });

  await g.paso("«Crear y enviar a aprobación» la manda a Meta; requiere el número conectado", page.getByRole("button", { name: "Crear y enviar a aprobación" }), {
    sostener: 4,
  });

  await g.paso("Mientras no haya plantillas, la lista lo indica", page.getByText("Sin plantillas todavía"), { sostener: 3 });
}
