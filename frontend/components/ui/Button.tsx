import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "blue" | "red" | "ghost" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  small?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "",
  blue: "btn-blue",
  red: "btn-red",
  ghost: "btn-ghost",
  link: "btn-link",
};

export function Button({ variant = "primary", block, small, className = "", type = "button", ...rest }: Props) {
  const classes = ["btn", VARIANT_CLASS[variant], block ? "btn-block" : "", small ? "btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
