"use client";

/**
 * The Fluent System Icons this app uses, re-exported from one client module.
 *
 * Every import of an icon goes through here, never straight to
 * `@fluentui/react-icons`, and the reason is a build failure rather than
 * tidiness. Each icon module evaluates Griffel's `__styles()` at import time,
 * and `__styles` is itself a client export; a server component that imports
 * an icon directly calls it during page-data collection and the build stops
 * with "Attempted to call __styles() from the server". Behind this file's
 * "use client", an icon in a server component is a client reference that
 * renders in place, which is all a server page needs from it.
 *
 * It is also the one list of what the app draws: 20px Regular in toolbars and
 * lists, 16px beside caption text, Filled for a selected or status state, as
 * the design system's iconography rule sets out.
 */
export {
  Add16Regular,
  ArrowClockwise20Regular,
  ArrowCounterclockwise16Regular,
  ArrowCounterclockwise20Regular,
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  ArrowRepeatAll20Regular,
  ArrowRight16Regular,
  ArrowRight20Regular,
  ArrowSync16Regular,
  ArrowUpload20Regular,
  Checkmark16Regular,
  CheckmarkCircle16Filled,
  CheckmarkCircle16Regular,
  ChevronRight12Regular,
  ChevronRight16Regular,
  Circle16Regular,
  Clock16Regular,
  Copy16Regular,
  Delete16Regular,
  DismissCircle16Regular,
  ErrorCircle12Filled,
  ErrorCircle16Regular,
  ErrorCircle20Filled,
  ErrorCircle20Regular,
  FoodGrains20Regular,
  FoodGrains24Regular,
  LeafThree20Regular,
  LeafThree24Regular,
  Location16Regular,
  LockClosed16Regular,
  Mail20Regular,
  Play20Filled,
  PlugDisconnected20Regular,
  SubtractCircle16Regular,
  Warning12Filled,
  WeatherRainShowersDay20Regular,
  WeatherRainShowersDay24Regular,
  WeatherSunny20Regular,
  WeatherSunny24Regular,
  ZoomFit16Regular,
} from "@fluentui/react-icons";
