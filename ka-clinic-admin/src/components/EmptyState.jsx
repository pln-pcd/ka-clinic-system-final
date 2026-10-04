// Centred "nothing here" block for empty tables and panels. It fills the
// space it is given (flex-1, plus a minimum height) with the icon and text
// centred both ways, so a short empty panel never looks like a stub.
export default function EmptyState({ icon: Icon, title, text, action, tone = 'text-slate-400', minHeight = 220, className = '' }) {
  return (
    <div className={`flex-1 w-full flex flex-col items-center justify-center text-center px-6 py-10 ${className}`} style={{ minHeight }}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
          <Icon size={22} className={tone} style={{ display: 'block' }} />
        </div>
      )}
      {title && <p className="text-sm font-bold text-slate-800">{title}</p>}
      {text && <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
