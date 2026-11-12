/** Configuración › Vendedores: alta, cuenta del panel y archivo. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/settings/vendedores";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Vendedor Demo ${s}`;
  const correo = `vendedor.demo.${s}@demo.test`;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const fila = page.locator("div.space-y-2.rounded-lg").filter({ hasText: correo });

  await g.paso(
    "Toda inscripción lleva un vendedor, use o no el sistema",
    tarjeta(page.getByRole("heading", { name: "Agregar vendedor" })),
    { sostener: 3.4 }
  );

  await g.paso("Se cargan el nombre y, si se desea, el correo", page.locator("#seller-name").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), {
    despues: async () => {
      await g.escribir(page.locator("#seller-name"), nombre, { retardo: 45 });
      await g.escribir(page.locator("#seller-email"), correo, { retardo: 35 });
    },
    sostener: 4,
  });

  await g.paso("«Agregar vendedor» lo suma a la lista de activos", page.getByRole("button", { name: "Agregar vendedor" }), {
    accion: "clic",
    despues: async () => {
      await fila.first().waitFor({ timeout: 15000 });
    },
    sostener: 2.6,
  });

  await g.paso("El vendedor queda listado; ya puede elegirse en las inscripciones", fila, { sostener: 3 });

  await g.paso("«Dar acceso al panel» crea su cuenta con el rol Ventas", fila.getByRole("button", { name: "Dar acceso al panel" }), {
    accion: "clic",
    despues: async () => {
      await fila.getByLabel("Contraseña temporal").waitFor();
      await g.escribir(fila.getByLabel("Contraseña temporal"), `Demo-${s}-2026`, { retardo: 40 });
    },
    sostener: 4.4,
  });

  await g.paso("Esa cuenta ve cursos y grupos, sin montos ni pagos", fila, {
    despues: async () => {
      await fila.getByRole("button", { name: "Dar acceso", exact: true }).click();
      await fila.getByText("Cuenta del panel").waitFor({ timeout: 20000 });
    },
    sostener: 3.8,
  });

  await g.paso("«Archivar» lo retira de las ventas nuevas sin borrar su historial", fila.getByRole("button", { name: "Archivar" }), {
    accion: "clic",
    sostener: 3.6,
  });

  await g.paso("Los archivados siguen en las ventas hechas y pueden reactivarse", page.getByText("Archivados", { exact: true }).locator("xpath=.."), {
    sostener: 3.4,
  });
}
