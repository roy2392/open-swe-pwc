import { cn } from "@/lib/utils";
import Image from "next/image";

export function PwCLogo({
  className,
  width = 120,
  height = 80,
  style,
}: {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Image
      src="/pwc-logo.png"
      alt="PwC"
      width={width}
      height={height}
      className={cn(className)}
      style={style}
      priority
    />
  );
}