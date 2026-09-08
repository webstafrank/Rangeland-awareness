import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generates the PageProps / LayoutProps helper types and typed Link hrefs,
  // so a topic route added to lib/analysis/topics.ts but never linked, or a
  // link to a route that does not exist, is a build error rather than a 404.
  typedRoutes: true,
};

export default nextConfig;
