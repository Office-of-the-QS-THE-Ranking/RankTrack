"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";

type TypedField = HTMLInputElement | HTMLTextAreaElement;
const TYPES = new Set(["text", "email", "tel", "url", "search", "number"]);

function editable(target: EventTarget | null): target is TypedField {
  return (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement && TYPES.has(target.type))
    && !!target.closest(".site.fr, .fr-share") && !target.closest(".fm-person__email, .fr-people__add")
    && !target.disabled && !target.readOnly && !target.classList.contains("pick-proxy")
    && !target.classList.contains("sr-only") && target.getAttribute("aria-hidden") !== "true";
}

/** One clear control follows the focused typed field without changing the form's grid or native constraints. */
export function ClearableFields() {
  const [field, setField] = useState<TypedField | null>(null);
  const [visible, setVisible] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focus = (event: FocusEvent) => {
      if (editable(event.target)) setField(event.target);
      else if (event.target !== button.current) setField(null);
    };
    const blur = () => {
      // Focus may move from the field to its clear button in the same browser event.
      queueMicrotask(() => {
        if (document.activeElement !== button.current && !editable(document.activeElement)) setField(null);
      });
    };
    if (editable(document.activeElement)) setField(document.activeElement);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
    };
  }, []);

  useLayoutEffect(() => {
    if (!field) {
      setVisible(false);
      return;
    }
    const refresh = () => {
      const show = field.isConnected && !field.disabled && !field.readOnly && !!field.value && !field.hasAttribute("data-invalid");
      field.toggleAttribute("data-clearable-active", show);
      setVisible(show);
    };
    refresh();
    const keydown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const control = button.current;
      if (event.key === "Tab" && !event.defaultPrevented && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && control?.matches(":popover-open") && control.style.visibility !== "hidden") {
        event.preventDefault();
        control.focus();
      }
    };
    field.addEventListener("input", refresh);
    field.addEventListener("change", refresh);
    field.addEventListener("keydown", keydown);
    const observer = new MutationObserver(refresh);
    observer.observe(field, { attributes: true, attributeFilter: ["value", "data-invalid", "disabled", "readonly"] });
    return () => {
      observer.disconnect();
      field.removeEventListener("input", refresh);
      field.removeEventListener("change", refresh);
      field.removeEventListener("keydown", keydown);
      field.removeAttribute("data-clearable-active");
    };
  }, [field]);

  useLayoutEffect(() => {
    const control = button.current;
    if (!field || !visible || !control) return;
    control.showPopover();
    let frame: number;
    const follow = () => {
      const box = (field.closest(".input-group, .pick-num") ?? field).getBoundingClientRect();
      if (!field.isConnected || !box.width || !box.height) {
        setField(null);
        return;
      }
      const shown = field.isConnected && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && !field.hasAttribute("data-invalid");
      control.style.visibility = shown ? "visible" : "hidden";
      control.style.left = `${box.right - 38}px`;
      control.style.top = `${field instanceof HTMLTextAreaElement ? box.top + 8 : box.top + (box.height - 30) / 2}px`;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(frame);
      if (control.isConnected) control.hidePopover();
    };
  }, [field, visible]);

  if (!field?.parentElement || !visible) return null;
  const label = field.getAttribute("aria-label") || field.labels?.[0]?.textContent?.trim() || field.closest(".fm-field")?.querySelector(".fm-field__label")?.textContent || "field";
  return createPortal(
    <button
      ref={button}
      type="button"
      popover="manual"
      className="form-field-clear"
      aria-label={`Clear ${label}`}
      onPointerDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Tab" && event.shiftKey) {
          event.preventDefault();
          field.focus({ preventScroll: true });
        }
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // Use the native setter so React's controlled onChange handlers receive the edit as usual.
        const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, "");
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.focus({ preventScroll: true });
        setVisible(false);
        field.removeAttribute("data-clearable-active");
      }}
    >
      <Icon name="close" size={14} />
    </button>,
    field.parentElement,
  );
}
