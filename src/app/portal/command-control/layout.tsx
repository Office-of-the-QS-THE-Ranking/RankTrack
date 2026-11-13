import { CommandControlLayout } from "@/components/command-control/routes";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CommandControlLayout base="/portal/command-control" home="/portal">
      {children}
    </CommandControlLayout>
  );
}
