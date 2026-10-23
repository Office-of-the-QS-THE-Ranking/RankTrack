import type { ReactNode } from "react";

export default function UnitsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return <>{children}{modal}</>;
}
