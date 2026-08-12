export function getSlotData(year, month, day) {
  const seed = year * 10000 + month * 100 + day;
  const d = new Date(year, month, day); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  
  if (d < today) return { status: 'past', slots: 0, isWeekend: false };
  
  // Appointments are ONLY available on Saturdays (6) and Sundays (0)
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  if (!isWeekend) {
    return { status: 'closed', slots: 0, isWeekend: false };
  }

  // Scramble the seed for weekend slot generation
  const hashed = Math.sin(seed) * 43758.5453;
  const rand = hashed - Math.floor(hashed);
  const maxSlots = 12, booked = Math.floor(rand * (maxSlots + 1)), remaining = maxSlots - booked;
  if (remaining === 0) return { status: 'full', slots: 0, isWeekend: true };
  if (remaining <= 3) return { status: 'limited', slots: remaining, isWeekend: true };
  return { status: 'available', slots: remaining, isWeekend: true };
}

export function getNextWeekendSlots() {
  const today = new Date();
  let nearest = null;
  // Scan 8 weekends out and surface the first one that's actually bookable,
  // rather than reporting a dead-end "Full" just because the very next Saturday happens to be booked out.
  for (let i = 0; i <= 56; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay() !== 6) continue;
    const data = getSlotData(d.getFullYear(), d.getMonth(), d.getDate());
    const label = `Saturday ${d.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`;
    const result = { ...data, label };
    if (!nearest) nearest = result;
    if (data.status === 'available' || data.status === 'limited') return result;
  }
  return nearest || { status:'full', slots:0, label:'This Saturday' };
}
