/** Configuración › WhatsApp: credenciales ficticias, prueba sin guardar y webhook. */

export const rol = "direccion";
export const ruta = "/settings/whatsapp";

export async function guion(g) {
  const { page } = g;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const conexion = tarjeta(page.getByRole("heading", { name: /Conectar tu número|Reconectar/ }));
  const webhook = tarjeta(page.getByRole("heading", { name: "Webhook de WhatsApp" }));

  await g.paso("Aquí se conecta el número de WhatsApp Business mediante la Cloud API", conexion, { sostener: 3.6 });

  await g.paso("El token sale de un usuario del sistema (modo directo) o lo entrega la agencia", page.getByText("¿De dónde sale el token?").locator("xpath=.."), {
    sostener: 4,
  });

  await g.paso("Se completan el WABA ID, el Phone Number ID y el token de acceso", page.locator("#waba-id").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), {
    despues: async () => {
      // Valores de demostración: no son credenciales reales.
      await g.escribir(page.locator("#waba-id"), "100000000000001", { retardo: 35 });
      await g.escribir(page.locator("#phone-number-id"), "100000000000002", { retardo: 35 });
      await g.escribir(page.locator("#token"), "EAAG-demo-no-real", { retardo: 35 });
    },
    sostener: 5,
  });

  await g.paso("«Probar conexión» valida el token contra Meta antes de guardar nada", page.getByRole("button", { name: "Probar conexión" }), {
    sostener: 4,
  });

  await g.paso("«Guardar conexión» solo se habilita tras una prueba exitosa", page.getByRole("button", { name: "Guardar conexión" }), {
    sostener: 3.6,
  });

  await g.paso("El webhook entrega la URL y el verify token para pegar en el panel de Meta", webhook, {
    despues: async () => {
      // La URL lleva un segmento secreto: se enmascara en pantalla.
      await page.evaluate(() => {
        for (const c of document.querySelectorAll("code")) {
          c.textContent = c.textContent.replace(/[A-Za-z0-9_-]{16,}/g, "••••••••••••");
        }
      });
    },
    sostener: 4.2,
  });
}
