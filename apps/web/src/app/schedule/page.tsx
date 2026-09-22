"use client";

import { GeneralScheduleTab } from "@/components/schedule/GeneralScheduleTab";
import { SummaryTab } from "@/components/schedule/SummaryTab";
import { LoanTab } from "@/components/schedule/LoanTab";
import { PayrollTab } from "@/components/schedule/PayrollTab";
import { RsuTab } from "@/components/schedule/RsuTab";
import { DcaTab } from "@/components/schedule/DcaTab";
import { TopBar } from "@/components/TopBar";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePersistentTab } from "@/lib/use-persistent-tab";

type Tab = "payroll" | "general" | "rsu" | "loan" | "dca" | "summary";

const VALID_TABS = ["payroll", "loan", "rsu", "dca", "general", "summary"] as const;

const TABS: { id: Tab; label: string }[] = [
  { id: "payroll", label: "薪資單" },
  { id: "loan", label: "貸款還款" },
  { id: "rsu", label: "RSU" },
  { id: "dca", label: "定期定額" },
  { id: "general", label: "其他" },
  { id: "summary", label: "年度統整" },
];

export default function SchedulePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [tab, setTab] = usePersistentTab<Tab>("tab:schedule", VALID_TABS, "payroll");

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} />
        </div>
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
        {tab === "general" && <GeneralScheduleTab />}
        {tab === "rsu" && <RsuTab />}
        {tab === "loan" && <LoanTab />}
        {tab === "dca" && <DcaTab />}
        {tab === "summary" && <SummaryTab />}
      </div>
    </>
  );
}
