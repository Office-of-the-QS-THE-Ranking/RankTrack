import { CommandControlLayout } from "@/components/command-control/routes";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CommandControlLayout base="/admin/command-control" home="/admin">
      {children}
    </CommandControlLayout>
  );
}
