// One status pill for the whole admin app, so a status reads the same on
// every page: Title Case wording and one colour per meaning.
//   green  – Confirmed, Completed, Administered
//   amber  – Pending, Due Today, Cancellation Requested
//   red    – Cancelled, Declined, Overdue
//   blue   – Ongoing, In Progress, Done (a finished appointment)
//   slate  – Upcoming, Scheduled, anything else
const TONES = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUSES = {
  pending: ['Pending', 'amber'],
  confirmed: ['Confirmed', 'green'],
  accepted: ['Confirmed', 'green'],
  done: ['Done', 'blue'],
  completed: ['Completed', 'green'],
  cancelled: ['Cancelled', 'red'],
  canceled: ['Cancelled', 'red'],
  declined: ['Declined', 'red'],
  cancellation_pending: ['Cancellation Requested', 'amber'],
  overdue: ['Overdue', 'red'],
  due_today: ['Due Today', 'amber'],
  administered: ['Administered', 'green'],
  ongoing: ['Ongoing', 'blue'],
  in_progress: ['In Progress', 'blue'],
  upcoming: ['Upcoming', 'slate'],
  scheduled: ['Scheduled', 'slate'],
  reschedule_by_patient: ['Can Be Rescheduled by Patient', 'amber'],
  can_be_rescheduled_by_patient: ['Can Be Rescheduled by Patient', 'amber'],
  affected_by_closure: ['Can Be Rescheduled by Patient', 'amber'],
};

const titleCase = (s) => String(s || '')
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/** Label and tone for a status value ('due today', 'Due Today' and 'due_today' all match). */
export function statusMeta(status) {
  const key = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const hit = STATUSES[key];
  return hit ? { label: hit[0], tone: hit[1] } : { label: titleCase(status) || 'Scheduled', tone: 'slate' };
}

export default function StatusBadge({ status, label, tone, size = 'sm', className = '', title }) {
  const meta = statusMeta(status);
  const sizeCls = size === 'md' ? 'text-[11px] px-2.5 py-0.5' : 'text-[10.5px] px-2 py-0.5';
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border font-bold whitespace-nowrap shrink-0 ${sizeCls} ${TONES[tone || meta.tone]} ${className}`}
    >
      {label || meta.label}
    </span>
  );
}
