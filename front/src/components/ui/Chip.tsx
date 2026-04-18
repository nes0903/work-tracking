import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "primary" | "positive" | "alert";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const tones: Record<Tone, string> = {
  neutral: "bg-surface-container-highest text-on-surface-variant",
  primary: "bg-primary-container text-on-primary-container",
  positive: "bg-[rgba(47,107,74,0.1)] text-positive",
  alert: "bg-[rgba(159,64,61,0.1)] text-error",
};

export function Chip({ tone = "neutral", className = "", children, ...rest }: ChipProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.08em] ${tones[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
