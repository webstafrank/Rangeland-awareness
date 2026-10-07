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
 *
 * Each icon comes from its own file, `@fluentui/react-icons/svg/<kebab-name>`,
 * never the package root. The root resolves to 60 `sizedIcons/chunk-N.js`
 * files that hold every icon in every size, and `optimizePackageImports` in
 * next.config.ts only narrows that to the chunks a name lives in: the dev
 * build was compiling 30 of them, 22 MB, to draw 41 icons. Per-icon files
 * took that to 2 chunks and the dev output from 67 MB to 29 MB. The file name
 * is the icon name without its size and variant, so `ArrowRight16Regular`
 * comes from `arrow-right`. __tests__/icons.test.ts fails a root import.
 */
export { Add16Regular } from "@fluentui/react-icons/svg/add";
export { ArrowClockwise20Regular } from "@fluentui/react-icons/svg/arrow-clockwise";
export { ArrowCounterclockwise16Regular, ArrowCounterclockwise20Regular } from "@fluentui/react-icons/svg/arrow-counterclockwise";
export { ArrowDown16Regular } from "@fluentui/react-icons/svg/arrow-down";
export { ArrowDownload20Regular } from "@fluentui/react-icons/svg/arrow-download";
export { ArrowLeft20Regular } from "@fluentui/react-icons/svg/arrow-left";
export { ArrowRepeatAll20Regular } from "@fluentui/react-icons/svg/arrow-repeat-all";
export { ArrowRight16Regular, ArrowRight20Regular } from "@fluentui/react-icons/svg/arrow-right";
export { ArrowSync16Regular } from "@fluentui/react-icons/svg/arrow-sync";
export { ArrowUp16Regular } from "@fluentui/react-icons/svg/arrow-up";
export { ArrowUpload20Regular } from "@fluentui/react-icons/svg/arrow-upload";
export { Checkmark16Regular } from "@fluentui/react-icons/svg/checkmark";
export { CheckmarkCircle16Filled, CheckmarkCircle16Regular } from "@fluentui/react-icons/svg/checkmark-circle";
export { ChevronDown16Regular } from "@fluentui/react-icons/svg/chevron-down";
export { ChevronRight12Regular, ChevronRight16Regular } from "@fluentui/react-icons/svg/chevron-right";
export { Circle16Regular } from "@fluentui/react-icons/svg/circle";
export { Clock16Regular } from "@fluentui/react-icons/svg/clock";
export { Copy16Regular } from "@fluentui/react-icons/svg/copy";
export { Delete16Regular } from "@fluentui/react-icons/svg/delete";
export { Dismiss16Regular } from "@fluentui/react-icons/svg/dismiss";
export { DismissCircle16Regular } from "@fluentui/react-icons/svg/dismiss-circle";
export { ErrorCircle12Filled, ErrorCircle16Regular, ErrorCircle20Filled, ErrorCircle20Regular } from "@fluentui/react-icons/svg/error-circle";
export { Eye16Regular } from "@fluentui/react-icons/svg/eye";
export { EyeOff16Regular } from "@fluentui/react-icons/svg/eye-off";
export { FoodGrains20Regular, FoodGrains24Regular } from "@fluentui/react-icons/svg/food-grains";
export { LeafThree20Regular, LeafThree24Regular } from "@fluentui/react-icons/svg/leaf-three";
export { Location16Regular } from "@fluentui/react-icons/svg/location";
export { LockClosed16Regular } from "@fluentui/react-icons/svg/lock-closed";
export { Mail20Regular } from "@fluentui/react-icons/svg/mail";
export { Play20Filled } from "@fluentui/react-icons/svg/play";
export { PlugDisconnected20Regular } from "@fluentui/react-icons/svg/plug-disconnected";
export { Search16Regular } from "@fluentui/react-icons/svg/search";
export { SubtractCircle16Regular } from "@fluentui/react-icons/svg/subtract-circle";
export { Warning12Filled } from "@fluentui/react-icons/svg/warning";
export { WeatherRainShowersDay20Regular, WeatherRainShowersDay24Regular } from "@fluentui/react-icons/svg/weather-rain-showers-day";
export { WeatherSunny20Regular, WeatherSunny24Regular } from "@fluentui/react-icons/svg/weather-sunny";
export { ZoomFit16Regular } from "@fluentui/react-icons/svg/zoom-fit";
