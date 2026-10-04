// Inline loading placeholders: grey bars shaped like the content that is on
// its way, used inside the card or table that is still loading (never a
// full-page spinner).
export function SkeletonRows({ rows = 6, className = '' }) {
  return (
    <div className={`px-6 py-4 space-y-4 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <span className="h-3 w-20 rounded bg-slate-100" />
          <span className="h-3 flex-1 max-w-[220px] rounded bg-slate-100" />
          <span className="h-3 w-24 rounded bg-slate-100" />
          <span className="h-3 w-16 rounded bg-slate-100 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// Page-shaped placeholder shown while a section's code chunk loads.
export function PageSkeleton() {
  return (
    <div className="px-6 py-6 space-y-4 animate-pulse" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200" />)}
      </div>
      <div className="h-[420px] rounded-2xl bg-white border border-slate-200" />
    </div>
  );
}
