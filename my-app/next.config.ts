import type { NextConfig } from "next";

/**
 * Headers applied to every response.
 *
 * Deliberately the three that cannot break a working page, plus one CSP
 * directive that also cannot. Everything here is verifiable by reading it; see
 * the note on Content-Security-Policy below for what is left out and why.
 */
const securityHeaders = [
  {
    // Stops a browser second-guessing a Content-Type. The GeoTIFF and CSV
    // downloads this app serves are exactly the case where sniffing turns a
    // data file into something the browser decides to execute.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Same-origin requests keep the full URL, cross-origin ones send only the
    // origin, and an https -> http downgrade sends nothing. A run URL carries
    // `?run=<id>`, and a run id is not something to hand to a tile CDN.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Nothing in this app is meant to be embedded. Clickjacking an analyst into
    // starting a run or signing out is cheap to prevent and costs nothing here.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // The modern spelling of the line above, kept alongside it because
    // X-Frame-Options is what older browsers and some proxies still read.
    //
    // This is the ONLY Content-Security-Policy directive that ships. A full CSP
    // is not added blind: the map pulls tiles from tile.openstreetmap.org,
    // server.arcgisonline.com and gibs.earthdata.nasa.gov, legends and proxied
    // tiles from whatever `NEXT_PUBLIC_BACKEND_URL` is set to at BUILD time,
    // and Next's own hydration needs a script-src that either allows inline or
    // carries a per-request nonce from middleware. Get any one of those wrong
    // and the map goes blank with the reason only visible in a console the
    // analyst will never open. `frame-ancestors` has no such failure mode: it
    // governs who may embed this page and nothing about what the page loads.
    // docs/deploy.md has the full source list ready to promote once there is a
    // deployment to test an enforcing policy against.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  {
    // No code here asks for any of these, so denying them turns a future
    // dependency that quietly does into a visible failure rather than a prompt
    // in front of an analyst.
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Generates the PageProps / LayoutProps helper types and typed Link hrefs,
  // so a topic route added to services/analysis/topics.ts but never linked, or a
  // link to a route that does not exist, is a build error rather than a 404.
  typedRoutes: true,

  // Emits .next/standalone: a server.js plus only the node_modules the traced
  // import graph actually reaches. It is what lets the runtime image ship
  // without a package.json install step and without the source tree, and the
  // runtime stage of Dockerfile.web copies nothing else.
  output: "standalone",

  // "X-Powered-By: Next.js" on every response tells an attacker which
  // framework's advisories to read and tells a user nothing.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Everything, including /api/health and the static assets. `:path*`
        // matches the empty path too, so "/" is covered.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
