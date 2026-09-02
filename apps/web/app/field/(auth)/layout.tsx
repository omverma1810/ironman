import { FieldShell } from "@/components/field/field-shell";

export default function FieldAuthLayout({ children }: { children: React.ReactNode }) {
  return <FieldShell>{children}</FieldShell>;
}
