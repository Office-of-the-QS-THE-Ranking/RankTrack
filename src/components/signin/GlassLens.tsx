"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The displacement map for the sidebar's edge: red shifts the backdrop across, strongest just inside the seam
 * and easing off inward (0.5 is no shift), so the scene behind the edge bends as through the thick rim of a
 * pane. The first few pixels stay unbent, so the gilt seam and the lit lip on it keep their place.
 */
const MAP = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>" +
    "<linearGradient id='g'><stop offset='0' stop-color='rgb(128,128,0)'/><stop offset='0.05' stop-color='rgb(128,128,0)'/>" +
    "<stop offset='0.1' stop-color='rgb(255,128,0)'/><stop offset='0.3' stop-color='rgb(214,128,0)'/>" +
    "<stop offset='0.55' stop-color='rgb(158,128,0)'/><stop offset='1' stop-color='rgb(128,128,0)'/></linearGradient>" +
    "<rect width='100' height='100' fill='url(#g)'/></svg>",
)}`;

/**
 * The lens along the sign-in sidebar's seam (signin.css, "liquid glass"): a strip over the sidebar's left edge
 * whose backdrop is bent by an SVG filter. Only Chromium draws SVG filters in a backdrop, so the strip turns on
 * there alone (data-on); elsewhere the glass keeps its fill and its light without the bending. The map is sized
 * to the strip in pixels, as it measures: where a backdrop's filter falls outside its map, red reads as nought
 * and bends the scene the other way.
 */
export function GlassLens() {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 56, h: 1000 });

  useEffect(() => {
    const lens = ref.current;
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
    if (!lens || !brands?.some((b) => b.brand === "Chromium")) return;
    lens.dataset.on = "";
    const measure = () => setSize({ w: Math.max(1, Math.ceil(lens.offsetWidth)), h: Math.max(1, Math.ceil(lens.offsetHeight)) });
    const resized = new ResizeObserver(measure);
    resized.observe(lens);
    measure();
    return () => resized.disconnect();
  }, []);

  return (
    <>
      <svg className="signin__lens-defs" aria-hidden="true" focusable="false">
        <filter id="si-lens" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={size.w} height={size.h} colorInterpolationFilters="sRGB">
          <feImage href={MAP} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span ref={ref} className="signin__lens" aria-hidden="true" />
    </>
  );
}
