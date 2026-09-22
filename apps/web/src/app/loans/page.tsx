import { redirect } from "next/navigation";

export default function LoansPage() {
  redirect("/schedule?tab=loan");
}
