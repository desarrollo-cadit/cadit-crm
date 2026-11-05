/**
 * Launch screen for the installed app. It is rendered by the server on every
 * full load and removed by CSS alone (see `.pwa-splash` in globals.css): it
 * only exists under `display-mode: standalone`, so in a normal browser tab it
 * is `display: none`. No JS means it can never get stuck over the portal.
 */
export function PwaSplash({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="pwa-splash barra-marca fixed inset-0 z-[100] flex-col items-center justify-center gap-6 bg-subtle text-foreground"
    >
      {/* Bare asset, no plate: the isotipo is blue, so brightness-0 + invert makes it
          pure white like the app icon. (IsotipoCadIT has a white plate that would turn into a blob.) */}
      <div className="pwa-splash-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-cadit-isotipo.webp"
          alt=""
          width={512}
          height={512}
          className="h-20 w-20 object-contain brightness-0 invert"
        />
      </div>
      <span className="text-lg font-[650] tracking-tight">{name}</span>
      <div className="pwa-splash-barra" />
    </div>
  );
}
