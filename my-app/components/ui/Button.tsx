"use client";

import Link from "next/link";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button as FluentButton } from "@fluentui/react-components";
import { buttonClasses, type ButtonAppearance, type ButtonScale } from "./button-classes";
import type { Tone } from "./tone";

/**
 * Fluent's three appearances, plus the four names this kit shipped with.
 *
 * `primary`    the one action a view exists for. Fluent brand blue. Never two
 *              on one screen.
 * `secondary`  a real alternative to it, and every ordinary action.
 * `subtle`     navigation and dismissal, no chrome until hovered.
 *
 * The legacy names map onto them rather than being removed, because a caller
 * outside this redesign may still pass them: `scarlet` and `solid` were both
 * "the confirming action" and are `primary` now that there is one brand hue;
 * `outline` is `secondary`; `ghost` is `subtle`.
 */
export type ButtonVariant =
  | ButtonAppearance
  | "scarlet"
  | "solid"
  | "outline"
  | "ghost";
export type ButtonSize = ButtonScale;

const APPEARANCE: Record<ButtonVariant, ButtonAppearance> = {
  primary: "primary",
  secondary: "secondary",
  subtle: "subtle",
  scarlet: "primary",
  solid: "primary",
  outline: "secondary",
  ghost: "subtle",
};

const FLUENT_SIZE: Record<ButtonSize, "small" | "medium" | "large"> = {
  sm: "small",
  md: "medium",
  lg: "large",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Accepted for compatibility and ignored. There is one light theme and no
   * dark band left for a button to sit on, so a button's skin no longer
   * depends on its ground.
   */
  tone?: Tone;
  /** Stretches to the container width, for stacked mobile actions. */
  block?: boolean;
  /** A Fluent System Icon, 20px Regular. Decorative: the label names the button. */
  icon?: ReactElement;
  /** Put the icon after the label, for forward arrows. */
  iconAfter?: boolean;
  children: ReactNode;
  className?: string;
}

export type ButtonProps = CommonProps &
  Omit<ComponentProps<"button">, "className" | "children" | "color">;

/**
 * A real Fluent `Button`, behind this kit's API.
 *
 * Internals replaced rather than re-skinned: Fluent's button owns its focus
 * ring, pressed state, disabled contrast and forced-colors rendering, and a
 * Tailwind copy would have to re-derive all four. Every prop a caller already
 * passed keeps working, so no call site had to move.
 *
 * `block` is an inline style, not `w-full`: Fluent caps a button's width with
 * a Griffel rule, and Griffel's rules sit outside Tailwind's cascade layers,
 * so a utility cannot override them. An inline style can.
 */
export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  iconAfter = false,
  children,
  className,
  tone: _tone,
  ...rest
}: ButtonProps) {
  void _tone;
  return (
    <FluentButton
      appearance={APPEARANCE[variant]}
      size={FLUENT_SIZE[size]}
      icon={icon}
      iconPosition={iconAfter ? "after" : "before"}
      className={className}
      style={block ? { width: "100%", maxWidth: "none" } : undefined}
      {...rest}
    >
      {children}
    </FluentButton>
  );
}

export type ButtonLinkProps = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children">;

/**
 * Same skin, real navigation. A link that looks like a button must still be a
 * link, so it opens in a new tab on a middle click and is announced as one.
 * See button-classes.ts for why this is not a Fluent `Button as="a"`.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  icon,
  iconAfter = false,
  children,
  className,
  tone: _tone,
  ...rest
}: ButtonLinkProps) {
  void _tone;
  return (
    <Link
      className={buttonClasses({
        appearance: APPEARANCE[variant],
        size,
        block,
        className,
      })}
      {...rest}
    >
      {icon && !iconAfter ? icon : null}
      {children}
      {icon && iconAfter ? icon : null}
    </Link>
  );
}
