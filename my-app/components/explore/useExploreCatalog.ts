"use client";

/**
 * Every layer the data explorer offers: the KSA GeoServer's, read live from
 * the backend's catalogue, and NASA GIBS's, from the verified registry.
 *
 * The GIBS half is synchronous and always there; the KSA half arrives when the
 * backend answers, one request per workspace in KSA_WORKSPACES. A backend that
 * is down, or a GeoServer it cannot reach, costs the KSA layers only. GIBS
 * keeps working, and the panel says in words what is missing and why, rather
 * than showing a shorter list as though it were the whole one.
 */

import { useEffect, useMemo, useState } from "react";

import {
  createBackendClient,
  failureMessage,
  featuresUrl,
  legendUrl,
  tileTemplate,
} from "@/services/backend-api";
import {
  KSA_WORKSPACES,
  fromCatalogLayer,
  fromWmsSource,
  type ExploreLayer,
} from "@/services/explore";
import { SOURCES, type WmsDateWindow } from "@/services/wms";

export type CatalogStatus =
  | { kind: "loading" }
  | { kind: "ready"; stale: boolean }
  | { kind: "error"; message: string };

export interface ExploreCatalog {
  layers: readonly ExploreLayer[];
  /** The KSA half only; GIBS cannot fail to load. */
  ksaStatus: CatalogStatus;
}

export function useExploreCatalog(dateWindow: WmsDateWindow): ExploreCatalog {
  const [ksaLayers, setKsaLayers] = useState<readonly ExploreLayer[]>([]);
  const [ksaStatus, setKsaStatus] = useState<CatalogStatus>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const client = createBackendClient();

    Promise.all(KSA_WORKSPACES.map((workspace) => client.layerCatalog(workspace))).then(
      (results) => {
        if (cancelled) return;
        const failed = results.find((r) => !r.ok);
        if (failed !== undefined && !failed.ok) {
          setKsaStatus({
            kind: "error",
            message: `The KSA GeoServer layers could not be listed: ${failureMessage(failed.failure)}`,
          });
          return;
        }
        const layers: ExploreLayer[] = [];
        let stale = false;
        for (const result of results) {
          if (!result.ok) continue;
          stale ||= result.data.stale;
          for (const layer of result.data.layers) {
            layers.push(fromCatalogLayer(layer, { tileTemplate, legendUrl, featuresUrl }));
          }
        }
        setKsaLayers(layers);
        setKsaStatus({ kind: "ready", stale });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  // The window is a fresh object each render (it ends today), so key the memo
  // on its two strings rather than its identity.
  const { start, end } = dateWindow;
  const gibsLayers = useMemo(() => {
    const gibs = SOURCES.find((s) => s.id === "gibs");
    return gibs === undefined ? [] : fromWmsSource(gibs, { start, end });
  }, [start, end]);

  const layers = useMemo(() => [...ksaLayers, ...gibsLayers], [ksaLayers, gibsLayers]);

  return { layers, ksaStatus };
}
