import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone es para la imagen Docker (Linux). En Windows el trazado crea
  // symlinks que requieren permisos elevados, así que ahí se omite.
  output: process.platform === "win32" ? undefined : "standalone",
  // El paquete `postgres` usa APIs de Node que no deben empaquetarse en el bundle.
  serverExternalPackages: ["postgres"],
  /**
   * 008 (T028) — Directorio de build alternativo, para poder levantar una
   * segunda instancia (el self-test E2E contra su base efímera) sin pelear
   * por `.next` con el dev server que ya esté corriendo.
   *
   * Dos procesos de Next escribiendo el MISMO `.next` se corrompen el grafo
   * de módulos entre sí, y el síntoma —`__webpack_modules__[moduleId] is not
   * a function` en rutas al azar— no dice nada sobre la causa.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
