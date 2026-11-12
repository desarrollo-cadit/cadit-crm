/** Configuración › Marca: nombre y acento con vista previa (sin guardar) y constancias. */

export const rol = "direccion";
export const ruta = "/settings/branding";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const marca = tarjeta(page.getByRole("heading", { name: "Marca del CRM" }));
  const original = await (await page.request.get(new URL("/api/settings/constancias", page.url()).href)).json();

  await g.paso("La marca personaliza el nombre y el color de toda la interfaz", marca, { sostener: 3.6 });

  await g.paso("El nombre se muestra en el CRM y en la pantalla de inicio de sesión", page.locator("#brand-name"), { sostener: 3.2 });

  await g.paso("El color de acento se elige entre los tonos predefinidos o uno personalizado", page.getByText("Color de acento").locator("xpath=.."), {
    sostener: 3.8,
  });

  await g.paso("La vista previa muestra cómo quedará, y el contraste se ajusta solo", marca.locator("div.rounded-md.border.p-4"), {
    despues: async () => {
      const otro = marca.getByRole("button", { name: /^(?!.*Personalizado).*$/ }).nth(1);
      await otro.click().catch(() => {});
    },
    sostener: 3.8,
  });

  await g.paso("«Guardar marca» aplica el cambio a todo el equipo", page.getByRole("button", { name: "Guardar marca" }), { sostener: 3.2 });

  const constancias = tarjeta(page.getByRole("heading", { name: "Constancias para empresas" }));
  await g.paso("Más abajo se define quién firma las constancias para empresas", constancias, { sostener: 3.6 });

  await g.paso("Se completan la firma, el cargo, la ciudad y el pie de página", constancias, {
    despues: async () => {
      await g.escribir(page.locator("#constancia-firma"), "Firmante de Demostración", { retardo: 35 });
      await g.escribir(page.locator("#constancia-cargo"), "Coordinación de cursos", { retardo: 35 });
      await g.escribir(page.locator("#constancia-ciudad"), "Montevideo", { retardo: 35 });
    },
    sostener: 5,
  });

  await g.paso("«Guardar» deja la configuración lista para las constancias", constancias.getByRole("button", { name: "Guardar" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Constancias guardadas").waitFor({ timeout: 15000 });
    },
    sostener: 3,
  });

  // Se devuelve la configuración original (fuera del video).
  const c = original.config;
  await page.request.put(new URL("/api/settings/constancias", page.url()).href, {
    data: { firmaNombre: c.firmaNombre ?? "", firmaCargo: c.firmaCargo ?? "", ciudad: c.ciudad ?? "", pie: (c.pie ?? []).join("\n") },
  });
}
