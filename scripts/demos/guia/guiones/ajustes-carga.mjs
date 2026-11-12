/** Configuración › Carga rápida: lo que falta cargar (precios de lista y correos de profesores). */

export const rol = "direccion";
export const ruta = "/settings/carga";

export async function guion(g) {
  const { page } = g;

  await g.paso(
    "La carga rápida lista lo que falta cargar para que la gestión esté completa",
    page.getByRole("heading", { name: "Lo que falta cargar" }).locator("xpath=ancestor::div[1]"),
    { sostener: 3.8 }
  );

  await g.paso("Cada contador dice cuántos faltan y qué bloquea", page.getByText("cursos sin precio de lista").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), {
    sostener: 4,
  });

  const primerPrecio = page.getByRole("textbox", { name: /^Precio de / }).first();
  await g.paso("El precio de lista de cada curso se edita en línea", primerPrecio.locator("xpath=ancestor::li[1]"), {
    sostener: 3.6,
  });

  await g.paso("Cada curso admite su moneda: UYU, PYG o USD", page.getByRole("combobox", { name: /^Moneda de / }).first().locator("xpath=ancestor::li[1]"), {
    sostener: 3.4,
  });

  await g.paso("Los profesores sin correo no pueden entrar a su portal", page.getByText("Correo de los profesores").locator("xpath=ancestor::section[1]"), {
    sostener: 3.8,
  });

  await g.paso("Cargar el correo no invita a nadie: la invitación se envía aparte", page.getByText("Cargar el correo no invita a nadie"), {
    sostener: 3.6,
  });

  await g.paso("«Guardar todo» aplica de una vez todos los cambios pendientes", page.getByRole("button", { name: "Guardar todo" }), {
    sostener: 3.6,
  });
}
