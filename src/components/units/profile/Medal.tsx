import { useEffect, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { ROMAN } from "@/lib/merit";

/**
 * An achievement's medal, struck in steel, gold, or onyx and gold, with a reeded rim and an engraved
 * emblem. Until it is earned it stays blank, with the progress toward it drawn round the rim.
 */
export function Medal({
  icon,
  metal,
  tier,
  progress = 0,
  size = 64,
  fresh,
}: {
  icon: IconName;
  metal?: "steel" | "gold" | "onyx";
  /** The tier numeral on the medal's plate, for achievements with several tiers. */
  tier?: number;
  /** 0–1 toward the first tier, while it is still blank. */
  progress?: number;
  size?: number;
  /** Earned in the chosen cycle: it catches the light once. */
  fresh?: boolean;
}) {
  return (
    <span
      className={cx("medal", metal ? `medal--${metal}` : "medal--blank", fresh && "is-fresh")}
      style={{ ["--m" as string]: `${size}px`, ["--p" as string]: Math.max(0, Math.min(1, progress)) } as CSSProperties}
      aria-hidden="true"
    >
      {!metal && progress > 0 && <span className="medal__track" />}
      <span className="medal__rim" />
      <span className="medal__face">
        <Icon name={icon} size={Math.round(size * 0.4)} strokeWidth={1.7} />
      </span>
      {metal && tier ? <span className="medal__tier">{ROMAN[tier]}</span> : null}
    </span>
  );
}

/** The season's honour: an onyx seal with its numeral, inside a bezel whose ticks light up toward the next honour. */
export function HonourDial({ numeral, progress, size = 136, label }: { numeral: string; progress: number; size?: number; label: string }) {
  return (
    <span className="dial" style={{ ["--size" as string]: `${size}px`, ["--fill" as string]: Math.max(0, Math.min(1, progress)) } as CSSProperties} role="img" aria-label={label}>
      <span className="dial__ticks" />
      <span className="dial__hours" />
      <span className="dial__face">
        <span className="dial__numeral">{numeral}</span>
      </span>
    </span>
  );
}

/** A figure that counts up when it first shows or changes; still for reduced motion. */
export function CountUp({ value, ms = 600 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return (
    <>
      <span aria-hidden="true">{shown.toLocaleString("en-PH")}</span>
      <span className="sr-only">{value.toLocaleString("en-PH")}</span>
    </>
  );
}
