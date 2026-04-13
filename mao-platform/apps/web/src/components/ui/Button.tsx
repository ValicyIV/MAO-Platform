// Button.tsx — Unified button component.
//
// Convention:
//   variant: primary | secondary | danger | ghost | close
//   size:    sm | md | lg
//
// All buttons use rounded-md, transition-colors, and consistent disabled states.
// Node-internal expand toggles (nodrag) and selection chips are NOT buttons —
// they stay as inline elements in their respective components.

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "close";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white shadow-sm hover:bg-blue-500 active:bg-blue-400 " +
    "disabled:bg-neutral-800 disabled:text-neutral-500",
  secondary:
    "border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 hover:border-neutral-600 active:bg-neutral-700/80 " +
    "disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600",
  danger:
    "border border-red-500/35 bg-red-950/20 text-red-300 hover:bg-red-500/12 hover:border-red-400/40 active:bg-red-500/18 " +
    "disabled:border-red-900/40 disabled:bg-red-950/10 disabled:text-red-900/80",
  ghost:
    "text-neutral-300 hover:bg-neutral-800/80 hover:text-neutral-100 active:bg-neutral-800 " +
    "disabled:text-neutral-600",
  close:
    "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 active:bg-neutral-700/80 text-lg leading-none " +
    "disabled:text-neutral-700",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className = "", children, ...rest }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium select-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed";
    // close variant ignores size padding — it's a minimal icon button
    const sizeClass = variant === "close" ? "h-8 w-8 p-0" : SIZE_CLASSES[size];

    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        className={`${base} ${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`.trim()}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
