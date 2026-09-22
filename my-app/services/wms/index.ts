/**
 * The public surface of the WMS unit.
 *
 * Everything the rest of the app is allowed to reach for. Importing a
 * submodule directly still works and is what the components do for types, but
 * anything outside components/map/ should come through here so the boundary
 * stays one file wide.
 */

export type {
  LegendSize,
  TemporalExtent,
  TimeInterval,
  WmsDateWindow,
  WmsLayerSpec,
  WmsSource,
} from "@/services/wms/types";

export {
  GIBS_LAYERS,
  KSA_LAYERS,
  getSourceLayer,
  layersForSource,
} from "@/services/wms/layers";

export {
  DEFAULT_SOURCE_ID,
  SOURCES,
  layersForTopic,
  resolveSource,
  resolveSourceFromEnv,
  wmsSource,
} from "@/services/wms/source";
export type { SourceResolution } from "@/services/wms/source";

export {
  coversDate,
  describeLayerTime,
  extentBounds,
  formatWmsTime,
  layerExtent,
  nearestCoveredDate,
  parseTimeDimension,
  resolveLayerTime,
} from "@/services/wms/time";
export type { LayerTimeResolution } from "@/services/wms/time";

export {
  describeTileFailure,
  getMapParams,
  isServiceExceptionBody,
  legendFor,
  paramsKey,
  parseServiceException,
} from "@/services/wms/request";
export type {
  LegendSource,
  WmsGetMapParams,
  WmsServiceException,
} from "@/services/wms/request";

export {
  DEFAULT_OPACITY,
  clampOpacity,
  failureMessages,
  initialPanelState,
  layerZIndex,
  panelNotices,
  visibleLayers,
  wmsPanelReducer,
} from "@/services/wms/state";
export type {
  WmsLayerState,
  WmsNotice,
  WmsPanelAction,
  WmsPanelState,
  WmsTileStatus,
} from "@/services/wms/state";

export {
  capabilitiesUrl,
  checkLayerNames,
  fetchCapabilities,
  parseCapabilities,
} from "@/services/wms/capabilities";
export type {
  CapabilitiesResult,
  CapabilityLayer,
} from "@/services/wms/capabilities";
