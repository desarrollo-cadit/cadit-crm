/** Configuración › Bienvenida: quién figura como Soporte y Coordinación en el correo. */

export const rol = "direccion";
export const ruta = "/settings/bienvenida";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const original = await (await page.request.get(new URL("/api/settings/welcome-team", page.url()).href)).json();
  const soporte = page.locator("fieldset").filter({ has: page.getByText("Soporte técnico", { exact: true }) });
  const coord = page.locator("fieldset").filter({ has: page.getByText("Coordinación", { exact: true }) });

  await g.paso(
    "Este correo lo recibe cada alumno al inscribirse; aquí se elige su equipo de contacto",
    tarjeta(page.getByRole("heading", { name: "Correo de bienvenida" })),
    { sostener: 3.8 }
  );

  await g.paso("Soporte técnico figura con un enlace para escribirle y va en copia", soporte, { sostener: 3.8 });

  await g.paso("Coordinación figura en el correo, pero no va en copia", coord, { sostener: 3.6 });

  const libre = coord.locator("label").filter({ hasNot: page.locator("input:checked") }).first();
  await g.paso("Se tilda a quien corresponda, de entre las cuentas del equipo", libre, {
    accion: "clic",
    sostener: 3.4,
  });

  await g.paso("«Guardar» aplica la elección a toda la academia", page.getByRole("button", { name: "Guardar" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Equipo del correo de bienvenida guardado").waitFor({ timeout: 15000 });
    },
    sostener: 3.4,
  });

  await g.paso("El docente no se elige aquí: sale del grupo de cada inscripción", page.getByText("El docente sale del grupo"), {
    sostener: 3.4,
  });

  // Se devuelve la configuración original (sin que se vea en el video).
  await page.request.put(new URL("/api/settings/welcome-team", page.url()).href, { data: original.elegido });
}
