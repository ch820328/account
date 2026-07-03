"use client";

import { GeneralScheduleTab } from "@/components/schedule/GeneralScheduleTab";
import { InstallmentTab } from "@/components/schedule/InstallmentTab";
import { LoanTab } from "@/components/schedule/LoanTab";
import { PayrollTab } from "@/components/schedule/PayrollTab";
import { RsuTab } from "@/components/schedule/RsuTab";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = "payroll" | "general" | "installment" | "rsu" | "loan";

const TABS: { id: Tab; label: string }[] = [
  { id: "payroll", label: "薪資單" },
  { id: "installment", label: "消費分期" },
  { id: "loan", label: "貸款還款" },
  { id: "rsu", label: "RSU" },
  { id: "general", label: "其他" },
];

export default function SchedulePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("payroll");

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>排程</h2>
        <div className="seg" style={{ marginBottom: 20 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "payroll" && <PayrollTab />}
        {tab === "installment" && <InstallmentTab />}
        {tab === "general" && <GeneralScheduleTab />}
        {tab === "rsu" && <RsuTab />}
        {tab === "loan" && <LoanTab />}
      </div>
    </>
  );
}
