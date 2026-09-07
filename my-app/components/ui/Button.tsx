import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "./tone";

/**
 * `scarlet`  the one most important action on a screen. Never two on one screen.
 * `solid`    the ordinary confirming action, in the tone's own contrast colour.
 * `outline`  a real alternative to the primary action.
 * `ghost`    navigation and dismissal, no chrome until hovered.
 */
export type ButtonVariant = "scarlet" | "solid" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-semibold " +
  "transition-[background-color,color,border-color,transform] duration-150 " +
  "ease-[var(--ease-out-soft)] active:translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-45 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-45";

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-caption",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

/**
 * Scarlet is tone-independent: its fill is dark enough to carry a white label
 * (5.24:1) and it reads as the accent on both grounds. Every other variant
 * has to know its ground.
 */
const variants: Record<ButtonVariant, Record<Tone, string>> = {
  scarlet: {
    dark: "bg-scarlet-fill text-white hover:bg-scarlet-fill-deep",
    light: "bg-scarlet-fill text-white hover:bg-scarlet-fill-deep",
  },
  solid: {
    dark: "bg-white text-navy-900 hover:bg-edge",
    light: "bg-navy-900 text-white hover:bg-navy-800",
  },
  outline: {
    dark: "border border-ink-dark-secondary/55 text-white hover:border-white hover:bg-white/10",
    light: "border border-navy-900/30 text-navy-900 hover:border-navy-900 hover:bg-navy-900/5",
  },
  ghost: {
    dark: "text-ink-dark-secondary hover:text-white hover:bg-white/10",
    light: "text-ink-light-secondary hover:text-navy-900 hover:bg-navy-900/5",
  },
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: Tone;
  /** Stretches to the container width, for stacked mobile actions. */
  block?: boolean;
  children: ReactNode;
  className?: string;
}

function classes({
  variant = "solid",
  size = "md",
  tone = "light",
  block,
  className = "",
}: CommonProps): string {
  return [base, sizes[size], variants[variant][tone], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = CommonProps & Omit<ComponentProps<"button">, "className" | "children">;

export function Button({ variant, size, tone, block, children, className, ...rest }: ButtonProps) {
  return (
    <button className={classes({ variant, size, tone, block, children, className })} {...rest}>
      {children}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & Omit<ComponentProps<typeof Link>, "className" | "children">;

/**
 * Same skin, real navigation. A link that looks like a button must still be a
 * link, so it opens in a new tab on a middle click and is announced correctly.
 */
export function ButtonLink({
  variant,
  size,
  tone,
  block,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, tone, block, children, className })} {...rest}>
      {children}
    </Link>
  );
}
