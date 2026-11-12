/** Configuración › Conexión con Claude: crear un token, verlo una sola vez y revocarlo. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/settings/mcp";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Claude demo ${s}`;
  const item = page.locator("li").filter({ hasText: nombre });

  await g.paso(
    "Con un token, Claude consulta esta instancia en lenguaje natural, solo en lectura",
    page.getByRole("heading", { name: "Conexión con Claude" }).locator("xpath=.."),
    { sostener: 3.8 }
  );

  await g.paso("Se escribe un nombre que identifique quién lo usa", page.locator("#mcp-nombre"), {
    despues: async () => {
      await g.escribir(page.locator("#mcp-nombre"), nombre, { retardo: 50 });
    },
    sostener: 3,
  });

  await g.paso("El perfil limita lo que Claude puede ver: nunca más que ese rol", page.locator("#mcp-perfil"), {
    despues: async () => {
      const opciones = await page.locator("#mcp-perfil option").allTextContents();
      const ventas = opciones.find((o) => o.trim() === "Ventas");
      if (ventas) await page.locator("#mcp-perfil").selectOption({ label: ventas });
    },
    sostener: 3.6,
  });

  await g.paso("«Crear token» lo genera", page.getByRole("button", { name: "Crear token" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("no se vuelve a mostrar").waitFor({ timeout: 15000 });
    },
    sostener: 2.4,
  });

  await g.paso("El valor aparece una sola vez: debe copiarse en este momento", page.getByText("no se vuelve a mostrar").locator("xpath=ancestor::section[1]"), {
    sostener: 3.8,
  });

  await g.paso("Junto al token se ofrece el comando listo para pegar en Claude Code", page.locator("#mcp-comando"), {
    sostener: 3.6,
  });

  await g.paso("«Ya lo guardé» oculta el valor, que no vuelve a consultarse", page.getByRole("button", { name: "Ya lo guardé" }), {
    accion: "clic",
    sostener: 2.8,
  });

  await g.paso("La lista conserva solo los últimos caracteres, el perfil y el último uso", item, { sostener: 3.6 });

  page.once("dialog", (d) => d.accept());
  await g.paso("«Revocar» corta el acceso desde el próximo pedido", item.getByRole("button", { name: "Revocar" }), {
    accion: "clic",
    despues: async () => {
      await item.getByText("Revocado").waitFor({ timeout: 15000 });
    },
    sostener: 3.4,
  });
}
