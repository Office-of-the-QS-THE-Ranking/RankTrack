import { CommandControlHome } from "@/components/command-control/routes";

export const metadata = { title: "Command & Control" };

export default function CommandControl() {
  return <CommandControlHome base="/portal/command-control" home="/portal" />;
}
