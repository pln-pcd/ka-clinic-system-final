// When the clinic takes appointments: Saturdays and Sundays only. Shared by
// the appointments calendar, its date field and the registration schedule
// preview (which flags doses that fall on a weekday).
export const CLINIC_DAYS_LABEL = 'Saturdays and Sundays';

const dayOfWeek = (dateStr) => {
  const [y, m, d] = String(dateStr || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return -1;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const isWeekendDate = (dateStr) => {
  const day = dayOfWeek(dateStr);
  return day === 0 || day === 6;
};

export const weekdayName = (dateStr) => {
  const day = dayOfWeek(dateStr);
  return day < 0 ? '' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
};
