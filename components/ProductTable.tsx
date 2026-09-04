"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Product,
  SCORE_FIELDS,
  STATUS_VALUES,
  Status,
  computePriorityScore,
} from "@/lib/types";

type SortKey = "num" | "priority";

const STATUS_LABELS: Record<Status, string> = {
  idea: "Idea",
  testing: "Testing",
  ordered: "Ordered",
  launched: "Launched",
  killed: "Killed",
};

export default function ProductTable() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [testBatchOnly, setTestBatchOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("num");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products))
      .catch(() => setError("Failed to load products."));
  }, []);

  const categories = useMemo(() => {
    if (!products) return [];
    return Array.from(new Set(products.map((p) => p.category))).sort();
  }, [products]);

  const visible = useMemo(() => {
    if (!products) return [];
    let list = products;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (category !== "all") {
      list = list.filter((p) => p.category === category);
    }
    if (status !== "all") {
      list = list.filter((p) => p.status === status);
    }
    if (testBatchOnly) {
      list = list.filter((p) => p.testBatch);
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "num") return a.num - b.num;
      const pa = computePriorityScore(a) ?? -1;
      const pb = computePriorityScore(b) ?? -1;
      return pa - pb;
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [products, search, category, status, testBatchOnly, sortKey, sortDir]);

  async function patchProduct(id: number, patch: Record<string, unknown>) {
    setProducts((prev) =>
      prev
        ? prev.map((p) => (p.id === id ? ({ ...p, ...patch } as Product) : p))
        : prev
    );
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      // Don't overwrite local state with the full response object here: if
      // several fields on the same row are edited in quick succession, each
      // PATCH is an independent request and responses can arrive out of
      // order, so a stale response would clobber a newer optimistic edit.
      // The optimistic update above already reflects this patch; nothing
      // else to do on success.
    } catch {
      setError("Failed to save a change — reload to check state.");
    }
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  if (!products) {
    return <p className="text-slate-500">Loading catalogue…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search product name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={testBatchOnly}
            onChange={(e) => setTestBatchOnly(e.target.checked)}
          />
          Test batch only
        </label>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-slate-500">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="num">#</option>
            <option value="priority">Priority Score</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded-md border border-slate-300 px-2 py-1.5"
            title="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        <span className="text-sm text-slate-500">
          {visible.length} of {products.length} products
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-center">Test Batch</th>
              <th className="px-3 py-2">Status</th>
              {SCORE_FIELDS.map((f) => (
                <th
                  key={f.key}
                  className="px-1 py-2 text-center"
                  title={f.hint}
                >
                  {f.label.split(" ")[0]}
                </th>
              ))}
              <th className="px-3 py-2 text-center">Priority</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const priority = computePriorityScore(p);
              return (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-1.5 text-slate-500">{p.num}</td>
                  <td className="px-3 py-1.5 text-slate-600">{p.category}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.testBatch}
                      onChange={(e) =>
                        patchProduct(p.id, { testBatch: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={p.status}
                      onChange={(e) =>
                        patchProduct(p.id, { status: e.target.value })
                      }
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                    >
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {SCORE_FIELDS.map((f) => (
                    <td key={f.key} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={1}
                        title={f.hint}
                        value={p[f.key] ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const value =
                            raw === "" ? null : Math.max(1, Math.min(5, Number(raw)));
                          setProducts((prev) =>
                            prev
                              ? prev.map((row) =>
                                  row.id === p.id
                                    ? ({ ...row, [f.key]: value } as Product)
                                    : row
                                )
                              : prev
                          );
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          const value =
                            raw === "" ? null : Math.max(1, Math.min(5, Number(raw)));
                          patchProduct(p.id, { [f.key]: value });
                        }}
                        className="score-input w-11 rounded border border-amber-300 bg-amber-50 px-1 py-1 text-center"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-center font-semibold">
                    {priority !== null ? priority.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      placeholder="Link"
                      defaultValue={p.supplierUrl ?? ""}
                      onBlur={(e) =>
                        patchProduct(p.id, {
                          supplierUrl: e.target.value || null,
                        })
                      }
                      className="w-32 rounded border border-slate-200 px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      placeholder="Notes"
                      defaultValue={p.notes ?? ""}
                      onBlur={(e) =>
                        patchProduct(p.id, { notes: e.target.value || null })
                      }
                      className="w-36 rounded border border-slate-200 px-1.5 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
