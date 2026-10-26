/**
 * 2026-10-26 — Las pestañas viven en la URL (`?tab=<clave>`).
 *
 * Toda página con pestañas toma la activa de `?tab=`, así un enlace puede
 * abrirla directo donde hay que actuar (`/academico?tab=grupos`). El servidor
 * lee el parámetro con `leerPestana` y baja la pestaña inicial; el cliente,
 * al cambiar de pestaña, reescribe la URL con `urlConPestana` (sin scroll y
 * sin perder los demás parámetros), para que recargar o volver atrás la
 * conserve.
 *
 * Puro: ni Next ni el navegador. Quien llama pasa SOLO las pestañas que la
 * persona puede ver: una pestaña oculta por capacidad es, para esta función,
 * una clave desconocida, y cae al default sin revelar nada.
 */

/**
 * La pestaña pedida si es válida; si falta, viene repetida (`?tab=a&tab=b`)
 * o no se conoce, el default. Los `alias` traducen claves viejas a las
 * actuales para que los enlaces que ya circulan sigan andando.
 */
export function leerPestana<K extends string>(
  raw: string | string[] | null | undefined,
  permitidas: readonly K[],
  porDefecto: K,
  alias: Readonly<Record<string, K>> = {}
): K {
  if (typeof raw !== "string" || raw === "") return porDefecto;
  const traducida = Object.hasOwn(alias, raw) ? alias[raw] : raw;
  return (permitidas as readonly string[]).includes(traducida as string)
    ? (traducida as K)
    : porDefecto;
}

/** `pathname` + el query actual con `tab` reemplazado (o agregado). */
export function urlConPestana(pathname: string, search: string, clave: string): string {
  const params = new URLSearchParams(search);
  params.set("tab", clave);
  return `${pathname}?${params.toString()}`;
}
