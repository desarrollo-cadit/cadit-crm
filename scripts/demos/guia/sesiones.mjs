/**
 * Sesiones de los roles de demostración, guardadas en disco.
 *
 * Better Auth limita el ingreso por API (10 intentos cada 10 minutos por IP) y
 * todas las grabaciones salen de la misma IP: iniciar sesión en cada una agota
 * el cupo. Por eso se inicia sesión UNA vez por rol y se reutiliza la cookie
 * (las sesiones duran días). Nadie más llama a `/api/auth/sign-in`.
 *
 *   node scripts/demos/guia/sesiones.mjs           inicia sesión en todos los roles
 *   node scripts/demos/guia/sesiones.mjs ventas    solo en uno
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3006";
const SALIDA = path.resolve("demos-output/guia");
const CLAVE = "Demo-Guia-2026";
const ROLES = ["direccion", "coordinacion", "soporte", "administracion", "ventas", "alumno", "profesor"];
/** Las sesiones de Better Auth duran 7 días; se renueva antes. */
const VIGENCIA_MS = 5 * 86_400_000;

async function emailDe(rol) {
  if (rol === "alumno" || rol === "profesor") {
    const cuentas = JSON.parse(await readFile(path.join(SALIDA, "cuentas.json"), "utf8"));
    return cuentas[rol];
  }
  return `demo.${rol}@demo.test`;
}

async function iniciarSesion(rol) {
  const email = await emailDe(rol);
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: CLAVE }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? `ingreso de ${rol}: 429 (cupo de ingresos agotado). Espere 10 minutos o reinicie la app de demostración.`
        : `ingreso de ${rol}: ${res.status} ${await res.text()}`
    );
  }
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    return { name: par.slice(0, i), value: par.slice(i + 1), url: BASE };
  });
  await mkdir(path.join(SALIDA, "sesiones"), { recursive: true });
  await writeFile(path.join(SALIDA, "sesiones", `${rol}.json`), JSON.stringify(cookies));
  return cookies;
}

/** Cookies del rol: las guardadas si siguen vigentes; si no, inicia sesión (una vez). */
export async function cookiesDeRol(rol) {
  const archivo = path.join(SALIDA, "sesiones", `${rol}.json`);
  try {
    const edad = Date.now() - (await stat(archivo)).mtimeMs;
    if (edad < VIGENCIA_MS) return JSON.parse(await readFile(archivo, "utf8"));
  } catch {}
  return iniciarSesion(rol);
}

/** `name=value; …` para un cliente HTTP. */
export const cabeceraDeCookies = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join("; ");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pedidos = process.argv.slice(2);
  for (const rol of pedidos.length ? pedidos : ROLES) {
    await iniciarSesion(rol);
    console.log(`  ✔ sesión de ${rol}`);
  }
}
