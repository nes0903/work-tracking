import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "selected" | "positive" | "alert";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const tones: Record<Tone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  selected: "bg-secondary-container text-on-secondary-container",
  positive: "bg-surface-container-high text-positive",
  alert: "bg-[rgba(254,137,131,0.1)] text-error",
};

export function Chip({ tone = "neutral", className = "", children, ...rest }: ChipProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.06em] ${tones[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
