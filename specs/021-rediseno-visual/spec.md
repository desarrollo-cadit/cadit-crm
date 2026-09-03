# 021 — Rediseño visual

**Estado**: en curso · **Depende de**: 020 · **Habilita**: 015

## Por qué existe

La [020](../020-identidad-visual/spec.md) dejó el cimiento —contraste, tokens,
tema oscuro, estados— pero el dueño lo dijo sin vueltas al verla:

> *"esta ok, pero no es lo que hablabamos de hacerlo mas lindo a nivel ui ni
> nada no?"*

Tenía razón. La 020 se ordenó por *"lo que más devuelve por línea tocada"* y
eso resultó ser **todo defecto**. La parte estética quedó última, acotada a los
portales… y el dueño **no usa el portal del profesor**: es el dueño, no un
profesor. El único lugar con personalidad terminó siendo el único que no mira.

Esta fase corrige eso, y con un método distinto: **una pantalla a la vez, y se
mira antes de seguir**. Nada de rediseñar 24 pantallas por spec y descubrir al
final que no era lo que se quería.

## La primera: el inicio

Se eligió porque es lo primero que ve al entrar, todos los días, y porque es de
solo lectura: el riesgo de romper algo es bajo.

**Qué tenía**: un encabezado que decía *"Inicio"* y tres tarjetas de finanzas y
licencias. Información correcta y completamente impersonal.

**Qué tiene ahora**:

- **Un saludo con el nombre y el día.** Es barato y cambia por completo cómo se
  siente entrar. Se sacó el título *"Inicio"*: el nombre de la pantalla no le
  informa nada a nadie y ocupaba la franja más valiosa.
- **Cuatro cifras grandes**, con la de cohortes en curso destacada con el color
  de la marca. Una sola destacada: si todas se destacan, ninguna se destaca.
- **Las clases de HOY primero**, antes que la facturación del mes. Lo
  financiero es importante y no es urgente; lo de las próximas horas es las dos
  cosas.
- El resto agrupado bajo rótulos (*Este mes*, *Licencias*) en vez de una grilla
  plana donde todo pesa igual.

## Hallazgo: el verde de WhatsApp en el gráfico

`finance-panel.tsx` pintaba las barras con `fill="#25D366"` **escrito a mano**
desde la 005 — el verde de WhatsApp, en el elemento más visible del inicio, sin
relación con la marca de la academia ni con el tema.

El guard de la 020 no lo veía porque solo miraba clases de Tailwind, y esto es
una **string de JavaScript**: Recharts recibe un color, no una clase. Se
resolvió con `useCssVar`, que lee el token en runtime y **se vuelve a leer
cuando cambia el tema**. Lo mismo con los cinco puntitos de etapa de la bandeja.

El guard ahora también prohíbe hex en strings, con dos excepciones explícitas:
el respaldo de `useCssVar` y la pantalla de Marca, que **es** un selector de
color.

## Lo que sigue

Las pantallas que el dueño mira todos los días, en orden a acordar con él:
bandeja, académico, calendario, contactos. Una por vez.

## La segunda: Académico

Es donde el dueño pasa más tiempo después del inicio, y donde viven las 41
cohortes.

**Qué tenía**: cada cohorte era una tarjeta con **cuatro párrafos apilados**,
todos en `text-xs text-muted-foreground` — la fecha, el profesor, el costo, el
aula y el horario pesaban exactamente lo mismo. La lista se leía como un bloque
de texto gris y había que recorrerla entera para encontrar cualquier cosa.

**Qué tiene ahora**:

- **El curso manda.** Es por lo que se busca; la edición va abajo y más chica.
- **Los datos se separaron en piezas con ícono** en vez de una oración con
  puntos medios. Se escanean.
- **"Sin profesor" se pinta como aviso**, no como un dato más: le pasa a 8 de
  las 41 y es una tarea pendiente, no una característica.
- **La lista se agrupa por estado** (En curso / Planificada / Finalizada). Con
  41 elementos, lo que ayuda a recorrerlos no es pintarlos: es agruparlos.
- Las pestañas pasaron a un **control segmentado**: se ve que son opciones de
  lo mismo, y la elegida está levantada en vez de rellena de color.

### Lo que se descartó en el camino

Se probó una **franja de color a la izquierda** de cada tarjeta para marcar el
estado. Se sacó: un borde de color de más de 1px en una tarjeta es decoración,
y el estado **ya lo dice el badge**. Agrupar resolvió el mismo problema con
información en vez de con color.

### Las superficies que no dibujamos

`::selection` y el cursor venían con el azul del navegador, que no pertenece a
ningún sistema de diseño y en tema oscuro se ve prestado. Ahora salen del
acento. Y `font-variant-numeric: tabular-nums` para que los números de una
tabla no bailen al cambiar de valor.

Cuatro líneas de CSS. Es la señal más barata de que una interfaz fue diseñada
en vez de ensamblada, y la que más se saltea.

## La tercera: Alumnos

Es una **tabla**, y ahí la densidad es una virtud, no un problema: el playbook
de Operate es explícito en que una tabla con muchas filas es lo correcto cuando
la gente necesita esos datos. Así que no se tocó la densidad. Lo que se
corrigió fueron dos defectos de uso.

**El total estaba solo al pie.** Con 340 alumnos paginados, saber cuántos hay
—o cuántos encontró una búsqueda— exigía scrollear hasta el final. Ahora va
arriba, al lado del título. Y cuando hay una búsqueda activa el número dice
cuántos **encontró**, que es la pregunta que se está haciendo en ese momento.

**El encabezado de la tabla se iba con el scroll.** Media pantalla abajo y ya
no se sabía qué columna era cuál.

### El detalle que rompía en silencio

Poner `sticky top-0` en el encabezado **no alcanzaba**: el primitivo `Table`
envolvía todo en un `overflow-x-auto`, y eso convierte al div en contenedor de
scroll de los **dos** ejes. El encabezado se anclaba a ese div —que no
scrollea verticalmente— y la propiedad no hacía nada. Un `sticky` que no pega
es de los errores más difíciles de ver: la clase está, el CSS se compila, y no
pasa nada.

Se resolvió en el primitivo, con un `containerClassName` que deja poner el alto
máximo desde afuera. El scroll vertical pasa a vivir en el contenedor de la
tabla, el encabezado queda fijo de verdad, y **la paginación deja de esconderse
al final de la lista**.

## La cuarta y la quinta: Calendario y Bandeja

Las dos pasaron por lo mismo, y ninguna necesitaba un rediseño.

**El borde grueso, otra vez.** Los bloques del calendario llevaban un borde
izquierdo de 3px con el color de la cohorte. El **relleno** ya dice de qué
cohorte es la clase, así que ese borde no agregaba información: era el mismo
patrón que se descartó en Académico. Lo único que el borde tiene que comunicar
es real vs proyección, y para eso alcanza sólido contra punteado.

**Los estados de carga eran texto.** `"Cargando…"`, `"Cargando plantillas…"` —
mientras el resto de la app usa esqueleto. Un texto centrado deja la pantalla
casi vacía y después salta de golpe a la grilla o a la lista completa. Ahora el
esqueleto ocupa la forma que va a tener, y **cada fila de la bandeja usa el
mismo `--row-py` que una fila real**: la densidad no cambia.

### Lo que NO se tocó en la bandeja

La franja de 3px que marca la conversación abierta se quedó. No es decoración:
es el indicador de selección, es la convención de cualquier bandeja, y en
Operate la familiaridad es una virtud. La regla del borde grueso apunta a los
bordes que solo decoran.

### La trampa en la que volví a caer

Escribí el nombre de la clase vieja (`el borde de 3px`) dentro del comentario
que explicaba por qué se sacaba, y **Tailwind volvió a generar la regla
muerta** — exactamente el gotcha documentado en `CLAUDE.md` en la 020. Lo cazó
la verificación en vivo, no yo. El comentario ya no la nombra.

## Cierre: Pipeline y Configuración

**Estado: IMPLEMENTADA.** Gate: typecheck, lint, build, **695 tests en 75
archivos**. Verificado en vivo: las 12 pantallas responden en los dos temas.

### Consistencia de los estados de carga

Quedaban **seis pantallas** anunciando la carga con texto (`"Cargando…"`,
`"Cargando cuotas…"`, `"Cargando temario…"`) mientras el resto usaba
esqueleto. Un texto centrado deja la pantalla casi vacía y después salta de
golpe al contenido completo.

Ahora las seis usan esqueleto con **la forma de lo que viene**. No es
cosmética: es la regla del modo Operate de que el mismo elemento se vea igual
en todas las pantallas — si "cargando" se ve distinto en dos lugares, uno de
los dos está mal.

### El pipeline dice dónde actuar, no solo qué hay

El tablero mostraba la **fecha** de última actividad. Una fecha hay que
restarla mentalmente, así que un lead de hace tres semanas se leía exactamente
igual que uno de ayer: el tablero **listaba** en vez de señalar.

Ahora dice **días** —"Hace 23 días" informa; "12 ago" no— y el que pasó dos
semanas sin movimiento se pinta como pendiente. Es el mismo criterio que
"sin profesor" en Académico: lo que falta no es un dato más, es una tarea.

**Catorce días y no siete**, deliberadamente: en una academia el ciclo de
decisión es largo —la gente consulta, lo piensa, lo habla en la casa— y marcar
en alerta a quien no contestó en una semana llenaría el tablero de avisos que
nadie mira. Marcar todo urgente es igual a no marcar nada.

`diasSinActividad()` es pura y tiene test, con la distinción que evita la
alarma falsa: **`null` no es "infinitos días"**. Un lead recién creado no está
frío, está sin empezar — tratarlos igual pintaría de pendiente a todo lo que
entra al tablero justo cuando entra.

### Lo que NO se tocó

El pipeline y las pantallas de configuración no necesitaban rediseño: el
detector mecánico dio 0 hallazgos sobre las ocho. Se corrigieron defectos de
uso, no se repintó lo que ya funcionaba.
