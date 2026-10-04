// Rules every seed/demo generator applies to a vaccination record before it
// is written, so sample data never claims something that cannot have happened:
//   - no dose is "done" with a date after today (it becomes pending),
//   - a record is "completed" only when every dose is done and dated on or
//     before today,
//   - completedAt is never in the future (the last dose date when missing).
// `todayIso` is the clinic date (YYYY-MM-DD) the generator runs on.

const isDone = d => d && (d.status === 'done' || d.s === 'done');
const dateOf = d => String(d?.date || '').slice(0, 10);

export function enforceDoseTimeline(vax, todayIso) {
  const doses = (vax.doses || []).map(d => (
    isDone(d) && dateOf(d) > todayIso
      ? { ...d, status: 'pending', s: 'pending', note: '', ...(d.brand !== undefined ? { brand: '' } : {}) }
      : d
  ));
  const allDone = doses.length > 0 && doses.every(d => isDone(d) && dateOf(d) && dateOf(d) <= todayIso);
  const out = { ...vax, doses };
  if (allDone) {
    out.status = 'completed';
    const last = doses.map(dateOf).sort().pop();
    const stamped = String(vax.completedAt || '').slice(0, 10);
    out.completedAt = stamped && stamped <= todayIso ? vax.completedAt : last;
  } else {
    if (out.status === 'completed') out.status = 'ongoing';
    delete out.completedAt;
  }
  if (vax.dose !== undefined) out.dose = `${doses.filter(isDone).length}/${doses.length}`;
  return out;
}
