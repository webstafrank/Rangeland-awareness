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
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {/*
          Skip link: the topic page puts a large interactive map high in the
          tab order, so a keyboard user needs a way past the header straight
          into content.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
        >
          Skip to content
        </a>

        <header className="border-b border-edge bg-surface">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-md text-sm font-semibold tracking-tight"
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-md bg-teal-600 text-[13px] font-bold text-white dark:bg-teal-500 dark:text-teal-950"
              >
                RA
              </span>
              Rangeland Awareness
            </Link>
          </div>
        </header>

        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>

        <footer className="border-t border-edge bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-foreground-faint sm:px-6">
            Earth observation analysis for Kenya&apos;s rangelands. Model
            outputs are decision support, not a forecast of record.
          </div>
        </footer>
      </body>
    </html>
  );
}
