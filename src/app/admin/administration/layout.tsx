import { AdministrationLayout } from "@/components/admin/routes";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AdministrationLayout base="/admin/administration" home="/admin">
      {children}
    </AdministrationLayout>
  );
}
