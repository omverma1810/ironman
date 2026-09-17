import { CustomerAuthProvider } from "@/lib/customer-auth";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <CustomerAuthProvider>{children}</CustomerAuthProvider>;
}
