import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Rangeland Awareness",
    template: "%s | Rangeland Awareness",
  },
  description:
    "Earth observation analysis for flood risk, drought, rangeland condition " +
    "and food security across Kenya's rangelands.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page font-sans text-ink">
        {/*
          Skip link: the topic page puts a large interactive map in the tab
          order, so a keyboard user needs a way past the header into content.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-raised"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-[900] border-b border-edge bg-surface">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-6 lg:px-10">
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
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1 px-6 py-6 text-xs leading-relaxed text-ink-faint lg:px-10">
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
