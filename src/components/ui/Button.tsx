import { forwardRef, type ButtonHTMLAttributes } from "react";
import { clsx } from "./clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button(
  { variant = "primary", size = "md", className, ...rest },
  ref
) {
  const base =
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-[var(--bg)]";
  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
  };
  const variants: Record<Variant, string> = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
    secondary:
      "bg-[var(--bg-elevated)] text-[var(--fg)] border hover:bg-[var(--bg)]",
    ghost: "bg-transparent text-[var(--fg)] hover:bg-[var(--bg-elevated)]",
    danger:
      "bg-[var(--danger)] text-[var(--danger-fg)] hover:brightness-110",
  };
  return (
    <button
      ref={ref}
      className={clsx(base, sizes[size], variants[variant], className)}
      {...rest}
    />
  );
});
