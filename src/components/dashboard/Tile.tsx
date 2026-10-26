import Link from "next/link";
import type { ReactNode } from "react";
import { GlowingEffect } from "@/components/ui/GlowingEffect";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

/**
 * A dashboard tile: a glass bezel whose rim lights toward the pointer, round a solid core. With `href` the
 * whole core is one link; otherwise `aside` holds the tile's own control. Without `title` the content draws
 * its own header, whose heading carries `id`.
 */
export function Tile({
  id,
  title,
  className,
  href,
  aside,
  children,
}: {
  id: string;
  title?: ReactNode;
  className?: string;
  href?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const head = title && (
    <header className="ov-tile__head">
      <h2 id={id} className="ov-tile__title">
        {title}
      </h2>
      {href ? <Icon name="chevron" size={16} className="ov-tile__go" /> : aside}
    </header>
  );
  return (
    <section className={cx("ov-tile", className)} aria-labelledby={id}>
      <GlowingEffect />
      {href ? (
        <Link href={href} className="ov-tile__core">
          {head}
          {children}
        </Link>
      ) : (
        <div className="ov-tile__core">
          {head}
          {children}
        </div>
      )}
    </section>
  );
}
