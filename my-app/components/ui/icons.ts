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
export { Calendar16Regular, Calendar20Regular } from "@fluentui/react-icons/svg/calendar";
export { Checkmark16Regular } from "@fluentui/react-icons/svg/checkmark";
export { CheckmarkCircle16Filled, CheckmarkCircle16Regular, CheckmarkCircle20Regular } from "@fluentui/react-icons/svg/checkmark-circle";
export { ChevronDown16Regular } from "@fluentui/react-icons/svg/chevron-down";
export { ChevronLeft16Regular } from "@fluentui/react-icons/svg/chevron-left";
export { ChevronRight12Regular, ChevronRight16Regular } from "@fluentui/react-icons/svg/chevron-right";
export { Circle16Regular } from "@fluentui/react-icons/svg/circle";
export { Clock16Regular, Clock20Regular } from "@fluentui/react-icons/svg/clock";
export { CloudOff20Regular } from "@fluentui/react-icons/svg/cloud-off";
export { Copy16Regular } from "@fluentui/react-icons/svg/copy";
export { DataBarVertical20Regular } from "@fluentui/react-icons/svg/data-bar-vertical";
export { Database20Regular } from "@fluentui/react-icons/svg/database";
export { Delete16Regular } from "@fluentui/react-icons/svg/delete";
export { Dismiss16Regular, Dismiss20Regular } from "@fluentui/react-icons/svg/dismiss";
export { DismissCircle16Regular } from "@fluentui/react-icons/svg/dismiss-circle";
export { DocumentText20Regular } from "@fluentui/react-icons/svg/document-text";
export { ErrorCircle12Filled, ErrorCircle16Regular, ErrorCircle20Filled, ErrorCircle20Regular } from "@fluentui/react-icons/svg/error-circle";
export { Eye16Regular } from "@fluentui/react-icons/svg/eye";
export { EyeOff16Regular } from "@fluentui/react-icons/svg/eye-off";
export { Filter16Regular } from "@fluentui/react-icons/svg/filter";
export { FoodGrains20Regular, FoodGrains24Regular } from "@fluentui/react-icons/svg/food-grains";
export { FullScreenMaximize16Regular } from "@fluentui/react-icons/svg/full-screen-maximize";
export { FullScreenMinimize16Regular } from "@fluentui/react-icons/svg/full-screen-minimize";
export { Globe20Regular } from "@fluentui/react-icons/svg/globe";
export { Grid20Regular } from "@fluentui/react-icons/svg/grid";
export { Handshake20Regular } from "@fluentui/react-icons/svg/handshake";
export { Home20Regular } from "@fluentui/react-icons/svg/home";
export { Info20Regular } from "@fluentui/react-icons/svg/info";
export { LayerDiagonal16Regular, LayerDiagonal20Regular } from "@fluentui/react-icons/svg/layer-diagonal";
export { LeafThree20Regular, LeafThree24Regular } from "@fluentui/react-icons/svg/leaf-three";
export { Location16Regular, Location20Regular } from "@fluentui/react-icons/svg/location";
export { LockClosed16Regular } from "@fluentui/react-icons/svg/lock-closed";
export { Mail20Regular } from "@fluentui/react-icons/svg/mail";
export { Map20Regular } from "@fluentui/react-icons/svg/map";
export { Megaphone20Regular } from "@fluentui/react-icons/svg/megaphone";
export { Navigation20Regular } from "@fluentui/react-icons/svg/navigation";
export { Next16Regular } from "@fluentui/react-icons/svg/next";
export { Open16Regular } from "@fluentui/react-icons/svg/open";
export { PanelLeftContract20Regular } from "@fluentui/react-icons/svg/panel-left-contract";
export { PanelLeftExpand20Regular } from "@fluentui/react-icons/svg/panel-left-expand";
export { Person20Regular } from "@fluentui/react-icons/svg/person";
export { Play20Filled } from "@fluentui/react-icons/svg/play";
export { PlugDisconnected20Regular } from "@fluentui/react-icons/svg/plug-disconnected";
export { QuestionCircle20Regular } from "@fluentui/react-icons/svg/question-circle";
export { Search16Regular } from "@fluentui/react-icons/svg/search";
export { ShieldError20Regular } from "@fluentui/react-icons/svg/shield-error";
export { SignOut20Regular } from "@fluentui/react-icons/svg/sign-out";
export { SubtractCircle16Regular } from "@fluentui/react-icons/svg/subtract-circle";
export { Target20Regular } from "@fluentui/react-icons/svg/target";
export { Timer20Regular } from "@fluentui/react-icons/svg/timer";
export { Warning12Filled, Warning16Regular, Warning20Regular } from "@fluentui/react-icons/svg/warning";
export { WeatherRainShowersDay20Regular, WeatherRainShowersDay24Regular } from "@fluentui/react-icons/svg/weather-rain-showers-day";
export { WeatherSunny20Regular, WeatherSunny24Regular } from "@fluentui/react-icons/svg/weather-sunny";
export { Wrench20Regular } from "@fluentui/react-icons/svg/wrench";
export { ZoomFit16Regular } from "@fluentui/react-icons/svg/zoom-fit";
