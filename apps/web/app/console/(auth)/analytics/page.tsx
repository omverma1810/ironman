"use client";

import { WeeklyPanel } from "@/components/analytics/weekly-panel";
import {
  ApartmentsPanel,
  ChannelsPanel,
  CheckpointPanel,
  DataQualityPanel,
  OperationsPanel,
  UnitEconomicsPanel,
} from "@/components/analytics/report-panels";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/lib/api/hooks";
import { canManageOrders, canManageMarketing, canSeeMoney } from "@/lib/permissions";

export default function AnalyticsPage() {
  const me = useMe();
  const roles = me.data?.roles;
  const isOps = canManageOrders(roles);
  const isAdmin = canSeeMoney(roles);
  const isFounder = canManageMarketing(roles);

  if (me.data && !isOps) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Analytics" />
        <EmptyState
          icon="lock"
          title="Operations staff only"
          body="Reports are available to Operator, Admin and Founder accounts."
        />
      </div>
    );
  }

  const tabs = [
    { value: "weekly", label: "Weekly numbers", show: isAdmin },
    { value: "operations", label: "Operations today", show: isOps },
    { value: "apartments", label: "Apartments", show: isAdmin },
    { value: "channels", label: "Channels", show: isFounder },
    { value: "unit-economics", label: "Unit economics", show: isFounder },
    { value: "checkpoint", label: "Day 30/60/90", show: isFounder },
    { value: "data-quality", label: "Data quality", show: isAdmin },
  ].filter((t) => t.show);
  if (!me.data) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="The founders' weekly numbers and the reports behind them. Every figure comes from live data."
      />
      <Tabs defaultValue={tabs[0]?.value}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="weekly" className="pt-2">
          <WeeklyPanel />
        </TabsContent>
        <TabsContent value="operations" className="pt-2">
          <OperationsPanel />
        </TabsContent>
        <TabsContent value="apartments" className="pt-2">
          <ApartmentsPanel showMargin={isFounder} />
        </TabsContent>
        <TabsContent value="channels" className="pt-2">
          <ChannelsPanel />
        </TabsContent>
        <TabsContent value="unit-economics" className="pt-2">
          <UnitEconomicsPanel />
        </TabsContent>
        <TabsContent value="checkpoint" className="pt-2">
          <CheckpointPanel />
        </TabsContent>
        <TabsContent value="data-quality" className="pt-2">
          <DataQualityPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
