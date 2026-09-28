"use client";

import { usePathname } from "next/navigation";

/**
 * Las rutas del portal que son del PROFESOR. Todo lo demás, si la persona es
 * alumno, se pinta en el mundo "Cianotipo de obra".
 *
 * Es una lista de exclusión y no de inclusión a propósito: una pantalla nueva
 * del alumno entra al mundo sin que nadie se acuerde de sumarla, y una del
 * profesor tiene que declararse acá — el profesor es la audiencia chica y la
 * que conserva Atlas.
 */
const RUTAS_DEL_PROFESOR = ["/portal/cohortes", "/portal/dictado", "/portal/horas"];

export function isStudentWorldPath(pathname: string): boolean {
  return !RUTAS_DEL_PROFESOR.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Enciende el mundo del alumno para lo que cuelga de acá.
 *
 * Es `display: contents` para no meter una caja en el medio del caparazón:
 * los hijos siguen siendo hijos flex del contenedor del layout. Las variables
 * CSS se heredan por el árbol del DOM aunque la caja no exista, así que los
 * tokens del mundo llegan igual a la barra y al contenido.
 *
 * Una persona que es alumno Y profesor ve cada pantalla en el mundo de la
 * audiencia a la que pertenece esa pantalla.
 */
export function PortalWorld({
  isStudent,
  children,
}: {
  isStudent: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const world = isStudent && isStudentWorldPath(pathname) ? "cianotipo" : undefined;

  return (
    <div data-world={world} className="contents">
      {children}
    </div>
  );
}
