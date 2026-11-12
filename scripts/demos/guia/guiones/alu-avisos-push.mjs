/**
 * Portal del alumno: avisos en el celular (web push, opcional).
 * En esta demostración el navegador no tiene el permiso de notificaciones
 * concedido, así que el interruptor se ve en su estado «bloqueado».
 */
export const rol = "alumno";
export const ruta = "/portal";

export async function guion(g) {
  const { page } = g;
  const aviso = page.getByText(/Los avisos están bloqueados en este dispositivo/);
  await aviso.waitFor({ state: "visible", timeout: 60000 });

  await g.paso("Al pie del menú lateral, el portal ofrece activar los avisos en el dispositivo", aviso.locator("xpath=ancestor::*[contains(@class,'rounded') or self::div][1]"), { sostener: 5 });

  await g.paso("El permiso se pide solo al tocar el botón «Activar avisos», nunca al abrir el portal", aviso, { sostener: 5 });

  await g.paso("Si el navegador bloqueó las notificaciones, el portal lo informa y se habilitan desde sus ajustes", aviso, { sostener: 5 });

  await g.paso("Una vez activos, llegan avisos breves: corrección publicada, entrega por vencer y clase por empezar", page.getByRole("heading", { name: /^Hola,/ }).locator("xpath=ancestor::*[2]"), { sostener: 5.5 });

  await g.paso("El aviso lleva solo un título y una frase; las notas y los montos no viajan", null, { sostener: 4.5 });

  await g.paso("Cada dispositivo se activa por separado y los avisos pueden desactivarse en cualquier momento", null, { sostener: 4.5 });
}
