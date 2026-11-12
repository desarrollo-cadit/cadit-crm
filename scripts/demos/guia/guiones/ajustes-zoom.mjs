/** Configuración › Zoom: credenciales (ficticias, sin guardar), estado de las conexiones y asistencia. */

export const rol = "direccion";
export const ruta = "/settings/zoom";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const formulario = tarjeta(page.getByRole("heading", { name: "Conectar una cuenta de Zoom" }));

  await g.paso("Zoom se conecta con una app Server-to-Server OAuth de solo lectura", formulario, { sostener: 4 });

  await g.paso("Se pegan el nombre, el Account ID, el Client ID y el Client Secret", formulario.locator("xpath=.//div[contains(@class,'grid')][1]"), {
    despues: async () => {
      // Valores de demostración: no corresponden a ninguna cuenta de Zoom.
      await g.escribir(page.locator("#zoom-name"), "Zoom demostración", { retardo: 40 });
      await g.escribir(page.locator("#zoom-account"), "DEMO-ACCOUNT-ID", { retardo: 30 });
      await g.escribir(page.locator("#zoom-client"), "DEMO-CLIENT-ID", { retardo: 30 });
      await g.escribir(page.locator("#zoom-secret"), "demo-no-real-secret", { retardo: 30 });
    },
    sostener: 5,
  });

  await g.paso("«Agregar conexión» guarda las credenciales cifradas; el CRM solo lee de Zoom", page.getByRole("button", { name: "Agregar conexión" }), {
    despues: async () => {
      // No se guarda: se vacía el formulario.
      for (const id of ["#zoom-name", "#zoom-account", "#zoom-client", "#zoom-secret"]) await page.locator(id).fill("");
    },
    sostener: 4,
  });

  const conexion = tarjeta(page.getByText("Conectada", { exact: true }).first());
  await g.paso("Cada conexión muestra su estado y solo los últimos cuatro caracteres del secreto", conexion.locator("xpath=.//div[contains(@class,'flex-col')][1]"), {
    sostener: 4,
  });

  await g.paso("«Probar» valida la conexión y trae los usuarios de Zoom disponibles", conexion.getByRole("button", { name: "Probar" }), {
    sostener: 3.6,
  });

  await g.paso("Cada aula se vincula a un usuario de Zoom para sincronizar sus grabaciones", conexion.getByText("Aulas", { exact: true }).locator("xpath=.."), {
    sostener: 3.8,
  });

  await g.paso("Más abajo se define cuándo Zoom sugiere «Presente» en la asistencia", tarjeta(page.getByRole("heading", { name: /Cuándo sugerir/ })), {
    sostener: 4,
  });
}
