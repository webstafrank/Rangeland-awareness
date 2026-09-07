import type { ReactNode } from "react";
import { getSession } from "@/services/auth";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";

/**
 * Chrome for every in-app screen. The header is compact here: the mark alone,
 * because by this point the user knows what the product is and the space is
 * better spent on the analysis itself.
 *
 * Plain `children` typing rather than `LayoutProps<"/analysis">` because this
 * layout wraps dynamic children (`[topic]`) and takes no params of its own.
 */
export default async function AnalysisLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <>
      <SiteHeader session={session} compact />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
