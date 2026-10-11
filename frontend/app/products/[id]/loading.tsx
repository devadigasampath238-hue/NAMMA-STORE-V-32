// Shown the instant a product link is clicked, before the page code/data arrive,
// so navigation always feels immediate.
export default function Loading() {
  return (
    <div className="grid gap-8 md:grid-cols-2" aria-busy="true" aria-label="Loading product">
      <div className="aspect-square animate-pulse rounded-2xl bg-brand-50" />
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-brand-50" />
        <div className="h-8 w-3/4 animate-pulse rounded bg-brand-50" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-brand-50" />
        <div className="h-10 w-1/2 animate-pulse rounded bg-brand-100" />
        <div className="h-24 w-full animate-pulse rounded bg-brand-50" />
        <div className="flex gap-3">
          <div className="h-12 w-40 animate-pulse rounded-lg bg-brand-100" />
          <div className="h-12 w-40 animate-pulse rounded-lg bg-brand-50" />
        </div>
      </div>
    </div>
  );
}
