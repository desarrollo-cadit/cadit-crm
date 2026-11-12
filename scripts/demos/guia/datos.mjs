/**
 * Datos y API para los guiones: un cliente HTTP ya autenticado como un rol del
 * staff, para CREAR datos de apoyo antes de grabar (sin grabarlo).
 *
 *   import { apiComo } from "../datos.mjs";
 *   const { api, exigir } = await apiComo("direccion");
 *   const r = exigir("alta", await api("/api/contacts", { method: "POST", body: JSON.stringify({...}) }));
 *
 * Regla: todo lo que un guion cree lleva un sufijo único (`Date.now().toString(36)`)
 * para poder volver a grabarse sin chocar con la corrida anterior, y un guion
 * NUNCA actúa sobre datos que no creó él mismo cuando la acción es irreversible
 * (unificar, dar de baja, anular, borrar).
 */

import { crearCliente, exigir } from "../lib.mjs";
import { BASE } from "./grabador.mjs";
import { cabeceraDeCookies, cookiesDeRol } from "./sesiones.mjs";

export { exigir };

export async function apiComo(rol = "direccion") {
  const cliente = crearCliente(BASE);
  // Sesión guardada en disco (sesiones.mjs): no se llama a /api/auth/sign-in, que tiene cupo.
  cliente.jar.cookie = cabeceraDeCookies(await cookiesDeRol(rol));
  return { api: cliente.api, exigir };
}

/** Sufijo único y corto para nombres de datos creados por un guion. */
export const sufijo = () => Date.now().toString(36).slice(-5);
