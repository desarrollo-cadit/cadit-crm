/**
 * 2026-10-07 — El user agent, dicho como lo diría una persona: «Chrome en
 * Windows», no `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit…`.
 *
 * Deliberadamente SIMPLE: lo que se quiere saber en el legajo es «¿entró
 * desde el celular o desde la compu?», no la versión exacta del motor. Una
 * librería de detección sería una dependencia más para contestar eso.
 *
 * El ORDEN de las reglas importa: casi todos los navegadores se anuncian
 * también como los demás (Edge dice «Chrome» y «Safari»; Chrome dice
 * «Safari»), así que se pregunta primero por el más específico.
 */

const NAVEGADORES: readonly [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];

const SISTEMAS: readonly [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "Mac"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

const primero = (ua: string, reglas: readonly [RegExp, string][]) =>
  reglas.find(([re]) => re.test(ua))?.[1] ?? null;

export function describeUserAgent(ua: string | null | undefined): string {
  const texto = ua?.trim();
  if (!texto) return "Dispositivo desconocido";
  const navegador = primero(texto, NAVEGADORES) ?? "Otro navegador";
  const sistema = primero(texto, SISTEMAS);
  return sistema ? `${navegador} en ${sistema}` : navegador;
}
