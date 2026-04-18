import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-bold tracking-tight transition-[background,color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-[0.82rem]",
};

const variants: Record<Variant, string> = {
  primary:
    "text-on-primary bg-[linear-gradient(135deg,#3c608a_0%,#2f547d_100%)] hover:bg-primary-dim",
  secondary:
    "bg-primary-container text-on-primary-container hover:brightness-95",
  tertiary:
    "bg-transparent text-on-primary-container hover:text-primary p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
