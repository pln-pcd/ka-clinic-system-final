// Inventory item categories: what each stock item is used for. The Add /
// Edit Item form, the Inventory table and report, the Vaccination Tracker's
// brand list and its RIG dropdown all read this one list.

export const INVENTORY_CATEGORIES = [
  // label: forms, filter and report. short: the Inventory table column.
  { value: 'Anti-Rabies', label: 'Anti-Rabies Vaccine', short: 'Anti-Rabies', services: ['PEP', 'PrEP'] },
  { value: 'Anti-Tetanus', label: 'Anti-Tetanus', short: 'Anti-Tetanus', services: ['Tetanus'] },
  { value: 'RIG', label: 'RIG (Rabies Immunoglobulin)', short: 'RIG', services: [] },
  { value: 'Pneumonia', label: 'Pneumonia (Pneumococcal)', short: 'Pneumonia', services: ['Pneumonia'] },
];

const VALUES = INVENTORY_CATEGORIES.map(c => c.value);

/**
 * The item's category. Items saved before these categories existed
 * ("Vaccine", "Medicine", "Supply") are placed by their name, with
 * immunoglobulin checked before rabies so ERIG is never a rabies vaccine.
 * '' when the name says nothing (the Edit form then asks for one).
 */
export function inventoryCategoryOf(item) {
  const cat = String(item?.category || '').trim();
  if (VALUES.includes(cat)) return cat;
  const n = String(item?.name || '').toLowerCase();
  if (/immunoglobulin|\b[eh]?rig\b|equirab/.test(n)) {
    return /tetanus|\btig\b/.test(n) ? 'Anti-Tetanus' : 'RIG';
  }
  if (/rabies|rabipur|verorab|speeda|pcec|pvrv|hdcv|\barv\b/.test(n)) return 'Anti-Rabies';
  if (/tetanus|toxoid|\btt\b|\btd\b|\bats\b|\btig\b/.test(n)) return 'Anti-Tetanus';
  if (/pneumo|prevnar|pcv|ppsv/.test(n)) return 'Pneumonia';
  return '';
}

export const inventoryCategoryLabel = (item, { short = false } = {}) => {
  const c = INVENTORY_CATEGORIES.find(x => x.value === inventoryCategoryOf(item));
  return (c && (short ? c.short : c.label)) || item?.category || 'Uncategorized';
};

/** Items whose category serves a patient service (PEP / PrEP / Tetanus / Pneumonia). */
export const itemServesService = (item, service) => {
  const cat = INVENTORY_CATEGORIES.find(c => c.value === inventoryCategoryOf(item));
  return Boolean(cat && cat.services.includes(String(service || '').trim()));
};

export const isRigItem = (item) => inventoryCategoryOf(item) === 'RIG';
