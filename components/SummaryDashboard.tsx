"use client";

import { useEffect, useState } from "react";
import { CategorySummary, STATUS_VALUES, Status } from "@/lib/types";

const STATUS_LABELS: Record<Status, string> = {
  idea: "Idea",
  testing: "Testing",
  ordered: "Ordered",
  launched: "Launched",
  killed: "Killed",
};

export default function SummaryDashboard() {
  const [summary, setSummary] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((res) => res.json())
      .then((data) => setSummary(data.summary))
      .catch(() => setError("Failed to load summary."));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!summary) return <p className="text-slate-500">Loading summary…</p>;

  const totals = summary.reduce(
    (acc, s) => {
      acc.productCount += s.productCount;
      acc.testBatchCount += s.testBatchCount;
      for (const status of STATUS_VALUES) {
        acc.statusCounts[status] += s.statusCounts[status];
      }
      return acc;
    },
    {
      productCount: 0,
      testBatchCount: 0,
      statusCounts: Object.fromEntries(
        STATUS_VALUES.map((s) => [s, 0])
      ) as Record<Status, number>,
    }
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total products" value={totals.productCount} />
        <StatCard label="Test batch" value={totals.testBatchCount} />
        {STATUS_VALUES.map((s) => (
          <StatCard
            key={s}
            label={STATUS_LABELS[s]}
            value={totals.statusCounts[s]}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-center"># Products</th>
              <th className="px-3 py-2 text-center"># Test Batch</th>
              <th className="px-3 py-2 text-center">Avg Priority Score</th>
              {STATUS_VALUES.map((s) => (
                <th key={s} className="px-3 py-2 text-center">
                  {STATUS_LABELS[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr
                key={row.category}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-3 py-1.5 font-medium text-slate-900">
                  {row.category}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {row.productCount}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {row.testBatchCount}
                </td>
                <td className="px-3 py-1.5 text-center font-semibold">
                  {row.avgPriorityScore !== null
                    ? row.avgPriorityScore.toFixed(2)
                    : "—"}
                </td>
                {STATUS_VALUES.map((s) => (
                  <td key={s} className="px-3 py-1.5 text-center">
                    {row.statusCounts[s] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2 text-center">{totals.productCount}</td>
              <td className="px-3 py-2 text-center">
                {totals.testBatchCount}
              </td>
              <td className="px-3 py-2 text-center">—</td>
              {STATUS_VALUES.map((s) => (
                <td key={s} className="px-3 py-2 text-center">
                  {totals.statusCounts[s] || "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
