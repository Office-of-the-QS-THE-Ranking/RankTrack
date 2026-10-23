"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The small amount of script the motion layer needs (site.css, "Motion"):
 * - removes the loader once its fade has run, and lets later heroes start without waiting for it;
 * - reveals [data-reveal] elements once, as they enter the viewport, on every page the visitor opens.
 * Content is only hidden under html.js, so nothing stays invisible if this never runs.
 */
export function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const site = document.querySelector<HTMLElement>(".site");
    const loader = document.querySelector<HTMLElement>(".w-loader");
    if (!site) return;
    const finish = () => {
      if (loader) loader.hidden = true;
      site.dataset.intro = "done";
    };
    if (!loader || loader.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    const style = getComputedStyle(loader);
    // Hydration can arrive after the CSS animation has already finished.
    if (style.visibility === "hidden") return finish();
    const onEnd = (e: AnimationEvent) => {
      if (e.target === loader && e.animationName.includes("loader-out")) finish();
    };
    loader.addEventListener("animationend", onEnd);
    const animationMs = (parseFloat(style.animationDelay) + parseFloat(style.animationDuration)) * 1000;
    const fallback = window.setTimeout(finish, animationMs + 250);
    return () => {
      loader.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById("main");
    if (!root) return;
    // The footer sits outside <main> but enters the same way.
    const footer = document.querySelector(".w-footer");
    const scopes: ParentNode[] = footer ? [root, footer] : [root];
    const reveal = (el: Element) => el.classList.add("is-in");
    if (!("IntersectionObserver" in window)) {
      scopes.forEach((scope) => scope.querySelectorAll("[data-reveal]").forEach(reveal));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    const watch = (scope: ParentNode) => scope.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    scopes.forEach(watch);
    // Streamed or filtered content arrives after the first pass.
    const mo = new MutationObserver((records) => {
      for (const rec of records)
        rec.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches("[data-reveal]:not(.is-in)")) io.observe(n);
          watch(n);
        });
    });
    mo.observe(root, { childList: true, subtree: true });
    // Safety net: anything already on screen after a moment is shown even if the observer stalls.
    const net = window.setTimeout(() => {
      scopes.forEach((scope) =>
        scope.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < innerHeight && r.bottom > 0) reveal(el);
        }),
      );
    }, 2600);
    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(net);
    };
  }, [pathname]);

  return null;
}
