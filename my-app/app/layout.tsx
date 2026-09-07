import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    default: "Rangeland Watch — Kenya flood, drought, food security and rangeland analysis",
    template: "%s · Rangeland Watch",
  },
  description:
    "Run flood risk, drought, food security and rangeland dynamics analysis over Kenya's 47 counties. Pick an area, a date range and a model, then read the result on a map and a time series.",
  applicationName: "Rangeland Watch",
};

export const viewport: Viewport = {
  themeColor: "#0b2143",
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
      <body className="flex min-h-full flex-col">
        {/* First tab stop on every page. Rubric R10: keyboard reachable. */}
        <a
          href="#main"
          className="bg-scarlet-fill sr-only rounded px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
