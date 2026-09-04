import ProductTable from "@/components/ProductTable";

export default function CataloguePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Catalogue</h1>
        <p className="text-sm text-slate-500">
          All 300 product ideas. Fill in the ten yellow score fields (1–5, 5 =
          most favorable) — Priority Score averages them live. Hover a column
          header for its full meaning.
        </p>
      </div>
      <ProductTable />
    </div>
  );
}
