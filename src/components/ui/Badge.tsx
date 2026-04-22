import { clsx } from "./clsx";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const tones: Record<Tone, string> = {
    neutral: "bg-[var(--bg)] text-[var(--fg-muted)] border",
    success: "bg-green-500/10 text-[var(--success)] border border-green-500/20",
    warning: "bg-amber-500/10 text-[var(--warning)] border border-amber-500/20",
    danger: "bg-red-500/10 text-[var(--danger)] border border-red-500/20",
    accent:
      "bg-blue-500/10 text-[var(--accent)] border border-blue-500/20",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
