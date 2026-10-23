import { AdministrationLayout } from "@/components/admin/routes";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AdministrationLayout base="/portal/administration" home="/portal">
      {children}
    </AdministrationLayout>
  );
}
