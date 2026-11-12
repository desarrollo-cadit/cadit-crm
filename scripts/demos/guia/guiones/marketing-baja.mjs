/**
 * Marketing: la página pública de baja (/baja/[token]).
 *
 * Salvedad: el token válido es un HMAC de un destinatario que solo existe tras
 * confirmar el envío de una campaña, y la demo no tiene buzón de marketing. Se
 * graban las dos pantallas que sí se pueden alcanzar: el enlace de un correo de
 * prueba y un enlace inválido.
 */

export const rol = "publico";
export const ruta = "/baja/prueba";

const tarjeta = (page) => page.locator("main > div").first();

export async function guion(g) {
  const { page } = g;

  await g.paso(
    "Cada correo de marketing lleva un enlace de baja que abre una página pública",
    page.locator("main"),
    { sostener: 3.8 }
  );

  await g.paso(
    "En un correo de prueba, el enlace no da de baja a nadie",
    tarjeta(page),
    { sostener: 4 }
  );

  await g.ir("/baja/enlace-alterado.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await page.getByRole("heading", { name: "Este enlace no es válido." }).waitFor();
  await g.paso("Con un enlace alterado o inexistente, la página no revela de quién era", tarjeta(page), { sostener: 4.4 });

  await g.paso(
    "Con un enlace válido se pide confirmar con un botón, y los correos de los cursos siguen llegando",
    null,
    { sostener: 5 }
  );
}
