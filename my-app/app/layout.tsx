import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { token } from "@/lib/theme/palette";
import { FluentRoot } from "@/components/shell/FluentRoot";
import { Logo } from "@/components/ui/Logo";
import { PrimaryNav } from "@/components/shell/PrimaryNav";
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
    default: "Disaster Monitor",
    template: "%s | Disaster Monitor",
  },
  description:
    "Earth observation analysis for flood risk, drought, rangeland condition " +
    "and food security across Kenya's rangelands.",
  applicationName: "Disaster Monitor",
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
  // The header's own ground, so the browser's bar and the app header read as
  // one continuous strip of Fluent's light neutral chrome.
  themeColor: token("--color-sunken"),
  colorScheme: "light",
};

const FOOTER_LINKS = [
  ["About", "/about"],
  ["Help", "/help"],
  ["Contact", "/contact"],
  ["Account", "/account"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-skip-link focus:rounded-fluent-medium focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-16"
        >
          Skip to content
        </a>

        <FluentRoot>
          {/*
            Fluent's app header: 48px (layout-header-height) of light neutral
            chrome, colorNeutralBackground4 with dark ink, separated from the
            canvas by a colorNeutralStroke2 hairline rather than by a change
            of ground. The dark navy band it replaces told the eye where the
            chrome ended by contrast alone; Fluent does it with the stroke,
            which is also what keeps the header from being the loudest thing
            on a screen whose job is a map and a table.
          */}
          <header className="band-chrome sticky top-0 z-header border-b border-edge">
            <div className="mx-auto flex h-12 w-full max-w-band items-center gap-3 px-gutter lg:px-gutter-lg">
              {/*
                The wordmark needs ~180px, and at 360px the three nav links
                need the rest, so below sm the mark stands alone and the link
                is named by its aria-label instead of by the hidden text. One
                Logo either way, so the mark is preloaded once.
              */}
              <Link
                href="/"
                aria-label="Disaster Monitor home"
                className="flex min-w-0 items-center rounded-fluent-medium"
              >
                <Logo size={30} wordmarkClassName="hidden sm:flex" />
              </Link>

              <span aria-hidden="true" className="hidden h-6 w-px bg-edge-strong md:block" />
              <span className="type-caption1 hidden text-ink-faint md:block">
                Earth observation decision support
              </span>

              <PrimaryNav />
            </div>
          </header>

          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>

          <footer className="band-chrome mt-auto border-t border-edge">
            <div className="mx-auto w-full max-w-band px-gutter py-6 lg:px-gutter-lg">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="type-caption1 flex max-w-2xl flex-col gap-1 text-ink-faint">
                  <p>
                    Earth observation analysis for Kenya&apos;s rangelands. Model
                    outputs are decision support, not a forecast of record.
                  </p>
                  <p>
                    Basemaps &copy; OpenStreetMap contributors. Imagery &copy; Esri,
                    Maxar, Earthstar Geographics.
                  </p>
                </div>
                <nav
                  aria-label="Footer navigation"
                  className="type-caption1 flex flex-wrap gap-x-5 gap-y-2"
                >
                  {FOOTER_LINKS.map(([label, href]) => (
                    <Link
                      key={href}
                      href={href}
                      className="rounded-fluent-small font-semibold text-accent-link hover:underline"
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </footer>
        </FluentRoot>
      </body>
    </html>
  );
}
