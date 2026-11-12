/** Configuración › Roles: crear, ajustar permisos, renombrar y borrar un rol propio. */
import { sufijo } from "../datos.mjs";

export const rol = "direccion";
export const ruta = "/settings/roles";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Rol demo ${s}`;
  const nombre2 = `Rol demo ${s} B`;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const tilde = (prefijo, cap) => page.locator(`label[for="${prefijo}:${cap}"]`);

  await g.paso(
    "Cada rol agrupa los permisos de un puesto; los cambios valen para todas sus cuentas",
    tarjeta(page.getByRole("heading", { name: "Coordinación", exact: true }).first()),
    { sostener: 4 }
  );

  await g.paso("«Nuevo rol» abre el formulario de alta", page.getByRole("button", { name: "Nuevo rol" }), {
    accion: "clic",
    despues: async () => {
      await page.locator("#role-new-name").waitFor();
    },
    sostener: 2.6,
  });

  await g.paso("Se escribe un nombre que se entienda en Equipo", page.locator("#role-new-name"), {
    despues: async () => {
      await g.escribir(page.locator("#role-new-name"), nombre, { retardo: 55 });
    },
    sostener: 3,
  });

  await g.paso("Se tildan solo los permisos que ese puesto necesita", tarjeta(page.getByRole("heading", { name: "Nuevo rol" })), {
    despues: async () => {
      await tilde("nuevo", "academico.ver").click();
      await g.pausa(0.5);
      await tilde("nuevo", "contactos.ver").click();
    },
    sostener: 4,
  });

  await g.paso("«Crear rol» lo guarda", page.getByRole("button", { name: "Crear rol" }), {
    accion: "clic",
    despues: async () => {
      await page.getByRole("heading", { name: nombre }).waitFor({ timeout: 15000 });
    },
    sostener: 2.4,
  });

  const card = tarjeta(page.getByRole("heading", { name: nombre }));
  await g.paso("El rol propio figura como Personalizado, sin cuentas todavía", card.locator("xpath=.//div[contains(@class,'flex-col')][1]"), {
    sostener: 3.4,
  });

  await g.paso("Cada tilde sobre un rol existente se guarda al instante", card, {
    despues: async () => {
      await tilde(await idDe(card), "asistencia.ver").click().catch(() => {});
    },
    sostener: 3.2,
  });

  await g.paso("«Renombrar» cambia el nombre sin tocar los permisos", card.getByRole("button", { name: "Renombrar" }), {
    accion: "clic",
    despues: async () => {
      const campo = page.getByLabel("Nombre del rol");
      await g.escribir(campo, nombre2, { retardo: 45 });
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await page.getByRole("heading", { name: nombre2 }).waitFor({ timeout: 15000 });
    },
    sostener: 4,
  });

  const card2 = tarjeta(page.getByRole("heading", { name: nombre2 }));
  await g.paso("Un rol sin cuentas puede borrarse, previa confirmación", card2.getByRole("button", { name: "Borrar" }), {
    accion: "clic",
    despues: async () => {
      await card2.getByRole("button", { name: "Sí, borrar" }).waitFor();
    },
    sostener: 3,
  });

  await g.paso("Borrar es definitivo; un rol con cuentas asignadas no puede borrarse", card2.getByRole("button", { name: "Sí, borrar" }), {
    accion: "clic",
    sostener: 3.4,
  });

  /** El id del rol se lee del primer checkbox de la tarjeta (`<id>:<capacidad>`). */
  async function idDe(c) {
    const id = await c.locator("input[type=checkbox]").first().getAttribute("id");
    return id.split(":")[0];
  }
}
