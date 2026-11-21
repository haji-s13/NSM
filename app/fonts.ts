import localFont from "next/font/local";

// Self-hosted variable fonts (from @fontsource-variable), so builds need no network.
export const display = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display",
  display: "swap",
  fallback: ["Helvetica Neue", "sans-serif"],
});

export const body = localFont({
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-body",
  display: "swap",
  fallback: ["Helvetica Neue", "sans-serif"],
});

export const mono = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
