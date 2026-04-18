import type { ReactNode } from "react";

interface SectionHeadingProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  size?: "display" | "section";
}

export function SectionHeading({
  title,
  description,
  actions,
  size = "section",
}: SectionHeadingProps) {
  const titleClass =
    size === "display"
      ? "font-display text-[2.25rem] font-extrabold tracking-[-0.03em] text-on-surface leading-tight"
      : "font-display text-[1.15rem] font-bold tracking-[-0.02em] text-on-surface";

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className={titleClass}>{title}</h2>
        {description ? (
          <p className="mt-2 text-[0.85rem] font-normal leading-[1.55] text-on-surface-variant">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
