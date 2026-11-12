/** Configuración › Marketing: buzón, remitente y pie de las campañas. */

export const rol = "direccion";
export const ruta = "/settings/marketing";

export async function guion(g) {
  const { page } = g;

  await g.paso(
    "Las campañas salen de un buzón de Microsoft 365 propio, distinto del de los cursos",
    page.getByRole("heading", { name: "Marketing", exact: true }).locator("xpath=.."),
    { sostener: 4 }
  );

  await g.paso("Las insignias indican si el buzón está configurado, probado y listo", page.getByText(/Microsoft 365/).first().locator("xpath=.."), {
    sostener: 3.6,
  });

  await g.paso("Se carga el buzón y el nombre del remitente", page.locator("#mk-sender").locator("xpath=ancestor::form[1]"), {
    despues: async () => {
      await g.escribir(page.locator("#mk-sender"), "novedades@demo.test", { retardo: 35 });
      await g.escribir(page.locator("#mk-name"), "Academia de Demostración", { retardo: 35 });
    },
    sostener: 4.4,
  });

  await g.paso("La dirección y el contacto van al pie de cada correo, junto al enlace de baja", page.locator("#mk-address").locator("xpath=.."), {
    despues: async () => {
      await g.escribir(page.locator("#mk-address"), "Calle Ficticia 123, Montevideo", { retardo: 30 });
      await g.escribir(page.locator("#mk-contact"), "contacto@demo.test", { retardo: 30 });
    },
    sostener: 4.4,
  });

  await g.paso("«Guardar» registra los datos", page.getByRole("button", { name: "Guardar" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Ajustes de marketing guardados").waitFor({ timeout: 15000 });
    },
    sostener: 3,
  });

  await g.paso("«Probar el buzón» envía un correo de prueba; sin esa prueba no se envían campañas", page.getByRole("button", { name: "Probar el buzón" }), {
    sostener: 4,
  });
}
