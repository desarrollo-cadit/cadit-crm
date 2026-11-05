/**
 * PWA constants shared by the manifest, the root layout and the launch images.
 * The navy is the sidebar color (`--barra-fondo` in globals.css), identical in
 * both themes. Kept in a .ts file so no hex literal lands in a .tsx.
 */
export const PWA_NAVY = "#001b5e";

/**
 * iOS launch images (portrait). Safari picks one by device size + pixel ratio;
 * without them iOS shows a blank white screen until the first paint. Files are
 * generated into `public/splash/launch-<w>x<h>.png` (navy + isotipo).
 */
export const IOS_LAUNCH_SCREENS: ReadonlyArray<{
  w: number;
  h: number;
  cssW: number;
  cssH: number;
  ratio: number;
}> = [
  { w: 1320, h: 2868, cssW: 440, cssH: 956, ratio: 3 },
  { w: 1206, h: 2622, cssW: 402, cssH: 874, ratio: 3 },
  { w: 1290, h: 2796, cssW: 430, cssH: 932, ratio: 3 },
  { w: 1179, h: 2556, cssW: 393, cssH: 852, ratio: 3 },
  { w: 1284, h: 2778, cssW: 428, cssH: 926, ratio: 3 },
  { w: 1170, h: 2532, cssW: 390, cssH: 844, ratio: 3 },
  { w: 1125, h: 2436, cssW: 375, cssH: 812, ratio: 3 },
  { w: 1242, h: 2688, cssW: 414, cssH: 896, ratio: 3 },
  { w: 828, h: 1792, cssW: 414, cssH: 896, ratio: 2 },
  { w: 750, h: 1334, cssW: 375, cssH: 667, ratio: 2 },
];

export function launchScreenMedia(s: { cssW: number; cssH: number; ratio: number }): string {
  return `(device-width: ${s.cssW}px) and (device-height: ${s.cssH}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`;
}
