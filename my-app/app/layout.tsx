import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { token } from "@/lib/theme/palette";
import { getSession } from "@/services/auth";
import { FluentRoot } from "@/components/shell/FluentRoot";
import { AppShell } from "@/components/shell/AppShell";
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
  // The top bar's own ground, so the browser's bar and the app header read
  // as one continuous strip.
  themeColor: token("--color-surface"),
  colorScheme: "light",
};

/*
 * The session is read here, once, and handed to the shell so the sidebar can
 * show who is signed in and offer sign out. Reading the cookie makes every
 * route dynamic; nearly every route already was (the topic steps read
 * searchParams, the run screens fetch), and the handful of static pages are
 * cheap to render per request.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
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
          <AppShell session={session}>{children}</AppShell>
        </FluentRoot>
      </body>
    </html>
  );
}
