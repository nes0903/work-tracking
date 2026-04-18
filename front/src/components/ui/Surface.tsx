import type { HTMLAttributes, ReactNode } from "react";

type Tone =
  | "base"
  | "container-lowest"
  | "container-low"
  | "container"
  | "container-high"
  | "container-highest";

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  as?: "div" | "section" | "article" | "aside" | "header";
  children: ReactNode;
}

const tones: Record<Tone, string> = {
  "base": "bg-surface",
  "container-lowest": "bg-surface-container-lowest",
  "container-low": "bg-surface-container-low",
  "container": "bg-surface-container",
  "container-high": "bg-surface-container-high",
  "container-highest": "bg-surface-container-highest",
};

export function Surface({
  tone = "container",
  as: Tag = "section",
  className = "",
  children,
  ...rest
}: SurfaceProps) {
  return (
    <Tag {...rest} className={`${tones[tone]} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
