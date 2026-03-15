import "./Card.css";

interface CardProps {
  children: React.ReactNode;
  padded?: boolean | "sm";
  callout?: boolean;
  calloutColor?: "teal" | "amber" | "rose" | "violet";
  className?: string;
}

export default function Card({
  children,
  padded = true,
  callout = false,
  calloutColor = "teal",
  className = "",
}: CardProps) {
  const classes = [
    "card",
    padded === true ? "card--padded" : padded === "sm" ? "card--padded-sm" : "",
    callout ? "card--callout" : "",
    callout && calloutColor !== "teal" ? `card--callout-${calloutColor}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
