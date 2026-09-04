import SummaryDashboard from "@/components/SummaryDashboard";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Category rollups and status counts across the idea bank.
        </p>
      </div>
      <SummaryDashboard />
    </div>
  );
}
