import { Plus } from "lucide-react";
import { useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Chips } from "@/components/ui";

import { AccountsTab } from "./AccountsTab";
import { BudgetsTab } from "./BudgetsTab";
import { GoalsTab } from "./GoalsTab";
import { OverviewTab } from "./OverviewTab";
import { RecurringTab } from "./RecurringTab";
import { TransactionSheet } from "./TransactionSheet";
import { TransactionsTab } from "./TransactionsTab";

const TABS = [
  { value: "", label: "Обзор" },
  { value: "transactions", label: "Операции" },
  { value: "budgets", label: "Бюджет" },
  { value: "recurring", label: "Платежи" },
  { value: "goals", label: "Накопления" },
  { value: "accounts", label: "Счета" },
];

export function FinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [txOpen, setTxOpen] = useState(false);
  const current = location.pathname.split("/")[2] ?? "";
  return (
    <div>
      <PageHeader
        art="jar"
        title="Финансы"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setTxOpen(true)}>
            Операция
          </Button>
        }
      />
      <Chips value={current} onChange={(v) => navigate(v ? `/finance/${v}` : "/finance")} options={TABS} />
      <div className="animate-tab-in mt-4" key={current}>
        <Routes>
          <Route index element={<OverviewTab />} />
          <Route path="transactions" element={<TransactionsTab />} />
          <Route path="budgets" element={<BudgetsTab />} />
          <Route path="recurring" element={<RecurringTab />} />
          <Route path="goals" element={<GoalsTab />} />
          <Route path="accounts" element={<AccountsTab />} />
        </Routes>
      </div>
      <TransactionSheet open={txOpen} onOpenChange={setTxOpen} />
    </div>
  );
}
