import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { token } from "@/lib/theme/palette";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rangeland Awareness",
    template: "%s | Rangeland Awareness",
  },
  description:
    "Earth observation analysis for flood risk, drought, rangeland condition " +
    "and food security across Kenya's rangelands.",
  applicationName: "Rangeland Awareness",
};

/*
 * Declared for the browser chrome, not for the page.
 *
 * `themeColor` is what paints the address bar on mobile Chrome and the status
 * bar on iOS; left unset, the browser picks its own and the app appears to end
 * at a seam above the header.
 *
 * It is read from the palette rather than written as a hex. This is the one
 * colour in the app that CANNOT be a Tailwind class or a var() — Next
 * serialises it into a <meta> tag at build time, where no stylesheet has run —
 * so it is also the one colour that would silently drift out of step with the
 * page the day someone retunes the ground. `token()` throws on an unknown
 * name, so a renamed token breaks the build instead of the address bar.
 *
 * `colorScheme` here and `color-scheme: light` in globals.css are not
 * redundant. The CSS declaration governs native controls, scrollbars and
 * autofill inside the document; this one is read before any stylesheet loads
 * and is what stops a dark-mode browser painting a dark canvas for the instant
 * before first paint.
 */
export const viewport: Viewport = {
  themeColor: token("--color-page"),
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /* Next 16 stopped overriding scroll-behavior during SPA navigation by
         default. This attribute opts back in, so an in-page anchor scrolls
         smoothly while a route change still jumps instantly to the top. */
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page font-sans text-ink">
        {/*
          Skip link: the topic page puts a large interactive map in the tab
          order, so a keyboard user needs a way past the header into content.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-skip-link focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-raised"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-header border-b border-edge bg-surface">
          <div className="mx-auto flex h-16 w-full max-w-band items-center gap-4 px-gutter lg:px-gutter-lg">
            <Link href="/" className="flex items-center gap-3 rounded-lg">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[13px] font-bold tracking-tight text-white"
              >
                RA
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[15px] font-semibold tracking-tight">
                  Rangeland Awareness
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                  Kenya Space Agency
                </span>
              </span>
            </Link>

            <span className="ml-auto hidden text-xs text-ink-faint sm:block">
              Earth observation decision support
            </span>
          </div>
        </header>

        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>

        <footer className="mt-auto border-t border-edge bg-surface">
          <div className="mx-auto flex w-full max-w-band flex-col gap-1 px-gutter py-6 text-xs leading-relaxed text-ink-faint lg:px-gutter-lg">
            <p>
              Earth observation analysis for Kenya&apos;s rangelands. Model
              outputs are decision support, not a forecast of record.
            </p>
            <p>
              Basemaps &copy; OpenStreetMap contributors. Imagery &copy; Esri,
              Maxar, Earthstar Geographics.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
