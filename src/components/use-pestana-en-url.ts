"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { urlConPestana } from "@/lib/tab-param";

/**
 * 2026-10-26 — La pestaña activa, reflejada en `?tab=`.
 *
 * La inicial la decide el SERVIDOR (lee `searchParams` con `leerPestana`) y
 * baja como prop, así el primer HTML ya viene con la pestaña correcta y no hay
 * desajuste de hidratación. Al cambiar de pestaña se actualiza el estado al
 * instante y se reescribe la URL con `router.replace` (sin scroll, sin sumar
 * una entrada al historial y conservando los demás parámetros): recargar o
 * volver a esta página desde otra abre en la misma pestaña.
 *
 * Los parámetros actuales se leen de `window.location` en el clic y no con
 * `useSearchParams`, que pediría un límite de Suspense.
 *
 * `enUrl` traduce la clave interna a la de la URL cuando no coinciden.
 */
export function usePestanaEnUrl<K extends string>(
  inicial: K,
  enUrl: (clave: K) => string = (clave) => clave
): [K, (clave: K) => void] {
  const router = useRouter();
  const [tab, setTab] = useState<K>(inicial);
  // Si una navegación trae otra pestaña inicial (un enlace a la misma página
  // con otro `?tab=`), manda la del servidor.
  const [inicialPrevia, setInicialPrevia] = useState<K>(inicial);
  if (inicial !== inicialPrevia) {
    setInicialPrevia(inicial);
    setTab(inicial);
  }

  const elegir = useCallback(
    (clave: K) => {
      setTab(clave);
      const { pathname, search } = window.location;
      router.replace(urlConPestana(pathname, search, enUrl(clave)), { scroll: false });
    },
    [router, enUrl]
  );

  return [tab, elegir];
}
