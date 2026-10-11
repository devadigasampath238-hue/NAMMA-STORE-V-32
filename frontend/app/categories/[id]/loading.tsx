export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading category">
      <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square animate-pulse rounded-xl bg-brand-50" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-brand-50" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
