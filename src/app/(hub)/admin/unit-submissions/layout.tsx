import type { ReactNode } from "react";

export default function UnitSubmissionsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return <>{children}{modal}</>;
}
