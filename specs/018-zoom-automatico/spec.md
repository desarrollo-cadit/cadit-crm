# 018 — Integración automática con Zoom

**Estado**: idea, sin comprometer · **Depende de**: 013

## Qué resolvería

Hoy —y también después de [013](../013-legajo-y-cursada/spec.md)— cargar una
reunión y su grabación es trabajo manual: alguien crea el Zoom, pega el
enlace en la clase, espera a que termine, busca la grabación en la nube de
Zoom y pega el segundo enlace.

Con la integración, eso desaparece: al generar el cronograma se crean las
reuniones, y cuando Zoom avisa que la grabación está lista, se adjudica sola
a la clase que corresponde.

## Por qué está separada y no dentro de 013

**Es una cuarta dependencia de runtime.** La constitución (principio II) tiene
una lista CERRADA de servicios externos, hoy de tres:

1. WhatsApp Cloud API
2. Proveedor LLM (opcional)
3. Microsoft Graph — agregado en la versión 1.3.0, con enmienda explícita

Sumar Zoom exige **una tercera enmienda constitucional**. No es un detalle
burocrático: cada dependencia es una credencial más en el instalador, un
punto de fallo más, y se aleja de la promesa "un VPS, un dominio y nada más".

Por eso 013 se diseña **sin** Zoom: el enlace se pega a mano y funciona. Esta
fase es una mejora de comodidad sobre algo que ya anda, no un requisito para
que ande.

## Lo que habría que resolver antes de comprometerla

- **DV-001**: ¿Se enmienda la constitución por cuarta vez, o Zoom queda como
  integración opcional que degrada (si no hay credenciales, se carga a mano)?
  *(propuesta: opcional con degradación, la fórmula del LLM. Es la que no
  rompe la promesa del instalador.)*
- **DV-002**: ¿Server-to-Server OAuth de Zoom, o app de marketplace? El
  primero es más simple y no necesita que cada usuario autorice.
- **DV-003**: Zoom avisa la grabación por webhook. ¿Cómo se valida esa firma y
  cómo se adjudica el evento a la clase correcta? Una reunión recurrente
  genera una grabación por ocurrencia.
- **DV-004**: ¿Qué pasa si la grabación tarda horas —o nunca llega— porque el
  profesor no la habilitó?
- **DV-005**: Las grabaciones de Zoom **caducan** según el plan contratado.
  ¿Se avisa antes de que se pierdan? Es la trampa más común de esta
  integración: el enlace queda guardado y un día deja de funcionar sin que
  nadie se entere.
- **DV-006**: ¿Aplica a Google Meet o Teams también, o Zoom nada más?

## Requisitos candidatos

- Crear la reunión al generar el cronograma de la cohorte.
- Adjudicar la grabación a su clase por webhook.
- Degradar sin credenciales: si no hay Zoom configurado, todo el flujo manual
  de 013 sigue funcionando igual.
- Nunca perder el enlace manual: si alguien lo cargó a mano, la automatización
  no lo pisa.

## Out of Scope

- Descargar y alojar las grabaciones (decisión marco: no se almacenan
  archivos; y un video de dos horas es exactamente el caso que se evitó).
- Control de asistencia a partir de la participación en Zoom. Es tentador y es
  otra fase: la asistencia hoy la toma el profesor, y cruzarla con datos de
  Zoom cambia el criterio de aprobación de
  [010](../010-evaluacion-y-certificados/spec.md).
