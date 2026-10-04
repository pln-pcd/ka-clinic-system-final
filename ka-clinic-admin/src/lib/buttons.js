// One button look for modal footers, confirmations and card action rows,
// so every action has the same height, radius and icon size. Order rule:
// the secondary / negative action sits on the LEFT, the primary action on
// the RIGHT (Cancel · Save, Decline · Confirm, Keep · Approve).
const base = 'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed outline-none';
const md = 'h-10 px-4 rounded-xl text-sm';
const sm = 'h-8 px-3 rounded-lg text-xs';

const tone = {
  primary: 'bg-[#3B50DF] hover:bg-[#2F40B5] text-white',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  // Negative but not destructive (Decline): outline, red icon, red on hover.
  decline: 'border border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 [&_svg]:text-rose-600',
  // Red: deletes, and actions that end a visit or discard work
  // (Approve cancellation, Discard dose).
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  // Consequential but reversible (e.g. Undo dose): amber.
  warning: 'bg-amber-600 hover:bg-amber-700 text-white',
  dark: 'bg-[#0F172A] hover:bg-[#1E293B] text-white',
};

export const BTN = Object.fromEntries(Object.entries(tone).map(([k, v]) => [k, `${base} ${md} ${v}`]));
export const BTN_SM = Object.fromEntries(Object.entries(tone).map(([k, v]) => [k, `${base} ${sm} ${v}`]));
// Icon sizes that go with them.
export const BTN_ICON = 16;
export const BTN_SM_ICON = 14;
