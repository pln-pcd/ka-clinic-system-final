// Builds the sample data set (pure: no database access). Used by
// scripts/sample-data-reset.mjs seed. Everything is laid out relative to
// today's date in Asia/Manila, so the states below stay correct whenever the
// seed is run:
//
//   ongoing        next dose 2+ days away, nothing missed
//   due-today      next dose is today
//   due-tomorrow   next dose is tomorrow (reminder testing)
//   overdue        a dose 2–6 days past, not given
//   completed      all doses given, completed within the last year
//   archived       completed 1+ year ago; the sweep archived it at exactly
//                  completedAt + 365 days (archivedBy "auto-365")
//   restored       archived, then restored by staff this month (back on the
//                  Patients list)
//   rearchived     restored last year, then auto-archived again 365 days
//                  after the restore
//
// Rules enforced (the build throws if any is broken): no dose given after
// today, "completed" only when every dose is given on or before today,
// completedAt = last dose date, PEP categories II/III only (III always gets
// ERIG), no infants, pins only on PEP records (at most one each), and a pin
// is hidden (mapHidden, "patient-completed") once the series is complete.
import { buildInitialDoses } from '../ka-clinic-admin/src/lib/doseSchedules.js';
import { addDaysToDateString, getTodayDateString } from '../ka-clinic-admin/src/lib/formatters.js';
import { LIBON_BARANGAYS, geocodeLibonAddress } from '../ka-clinic-admin/src/lib/libonGeo.js';
import { buildSimulatedIncidents } from '../ka-clinic-admin/src/lib/simulatedIncidents.js';

export const SAMPLE_MARK = { isSeedData: true, sampleBatch: 'sample-2026-09' };

export function buildSampleData(today = getTodayDateString()) {
  const T = today;
  const day = n => addDaysToDateString(T, n);
  const ms = (d, time = '09:00') => Date.parse(`${d}T${time}:00+08:00`);
  const plus365 = d => addDaysToDateString(d, 365);

  // Deterministic pseudo-random numbers so a re-run builds the same set.
  let seed = 20260927;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  /* ── Inventory (ids are the live docs; FluQuadri and BCG are left as they are) ── */
  const INV = {
    speeda:   { id: 'fNDdZ7naxanbjLFsJKiz', name: 'Speeda (PVRV Rabies Vaccine)',  category: 'Vaccine', unit: 'Vials',   minStock: 20, final: 46, expiry: day(420) },
    rabipur:  { id: 'Jd6NpFvQHp3zd0KCG2wf', name: 'Rabipur (PCEC Rabies Vaccine)', category: 'Vaccine', unit: 'Vials',   minStock: 20, final: 14, expiry: day(300) },  // warning
    verorab:  { id: 'Ny0kyyPo1zqjzy38NgNz', name: 'Verorab (PVRV Rabies Vaccine)', category: 'Vaccine', unit: 'Vials',   minStock: 20, final: 58, expiry: day(360) },
    tt:       { id: 'dCM5gVFm0SZryr5cRaF0', name: 'Tetanus Toxoid (TT)',           category: 'Vaccine', unit: 'Ampules', minStock: 20, final: 64, expiry: day(380) },
    pcv20:    { id: 'n4OyoUEA3Vcgz8jWKk6o', name: 'Prevnar 20 (PCV20)',            category: 'Vaccine', unit: 'Vials',   minStock: 10, final: 22, expiry: day(260) },
    ppsv23:   { id: '44P4yaAbUrHXFdqtvyMg', name: 'Pneumovax 23 (PPSV23)',         category: 'Vaccine', unit: 'Vials',   minStock: 10, final: 18, expiry: day(21) },   // expiring soon
    erig:     { id: '5NtMP41ErZVVWjcwSU9P', name: 'Equirab (ERIG - Equine Rabies Immunoglobulin)', category: 'Rig', unit: 'Vials', minStock: 15, final: 32, expiry: day(330) },
    ats:      { id: 'CORzv67RYyrXxW2wb4Hc', name: 'Anti-Tetanus Serum (ATS 1500 IU)', category: 'Vaccine', unit: 'Ampules', minStock: 15, final: 40, expiry: day(310) },
    tig:      { id: 'PtVodvNDcKnwLyF9kDfl', name: 'Tetanus Immunoglobulin (TIG 250 IU)', category: 'Vaccine', unit: 'Vials', minStock: 10, final: 26, expiry: day(280) },
  };
  const RABIES = ['speeda', 'rabipur', 'verorab'];

  /* ── People ── */
  const FIRST_F = ['Maria', 'Ana', 'Rosario', 'Josephine', 'Cristina', 'Lorna', 'Marites', 'Jocelyn', 'Rowena', 'Aileen', 'Grace', 'Sheila', 'Editha', 'Nenita', 'Liza', 'Camille', 'Precious', 'Bea', 'Jessa', 'Divina', 'Teresita', 'Analyn', 'Rhea', 'Kristine'];
  const FIRST_M = ['Jose', 'Juan', 'Ramon', 'Eduardo', 'Rolando', 'Benjamin', 'Ricardo', 'Danilo', 'Ernesto', 'Noel', 'Joel', 'Arnel', 'Rodel', 'Bryan', 'Kevin', 'Paul', 'Elmer', 'Carlos', 'Gerardo', 'Alberto', 'Mark', 'Francis', 'Angelo', 'Renato'];
  const LAST = ['Almonte', 'Zamora', 'Balisacan', 'Bataller', 'Firmalo', 'Encinares', 'Tibayan', 'Loterte', 'Bonaobra', 'Bellen', 'Ojeda', 'Padua', 'Marbella', 'Rebosura', 'Quinto', 'Imperial', 'Bragais', 'Nieva', 'Bermas', 'Competente', 'Llaguno', 'Bagasbas', 'Escobar', 'Dato', 'Nuñez', 'Rañola', 'Malacas', 'Berina', 'Bordado', 'Boncodin', 'Sarte', 'Buenaflor', 'Cerillo', 'Dominguez', 'Lorenzo', 'Ulanday'];
  const MIDDLE = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.', 'T.', 'V.'];
  const usedNames = new Set();
  const person = (sex) => {
    for (;;) {
      const first = pick(sex === 'Female' ? FIRST_F : FIRST_M);
      const last = pick(LAST);
      const middle = pick(MIDDLE);
      const key = `${first} ${last}`;
      if (!usedNames.has(key)) { usedNames.add(key); return { first, middle, last }; }
    }
  };
  // Named barangays (not the Poblacion "Zone N" entries), spread round-robin.
  const BRGYS = LIBON_BARANGAYS.filter(b => !/^Zone \d+$/.test(b));
  let brgyIdx = 0;
  const nextBrgy = () => BRGYS[(brgyIdx++ * 7) % BRGYS.length];

  /* ── Specs: service, state, and for due/ongoing states which dose is next ── */
  // For each state we pick the next dose index k and its target date; the
  // registration date is then solved so that dose k lands on that date.
  const specs = [];
  const add = (service, state, extra = {}) => specs.push({ service, state, ...extra });
  const PEP_CATS = ['II', 'II', 'III'];
  // archived / restored / rearchived (old registrations)
  add('PEP', 'archived', { regTarget: '2025-02-11' });
  add('PEP', 'archived', { regTarget: '2025-04-03' });
  add('Tetanus', 'archived', { regTarget: '2025-01-20' });
  add('Pneumonia', 'archived', { regTarget: '2025-06-14' });
  add('PrEP', 'archived', { regTarget: '2025-07-22' });
  add('PEP', 'restored', { regTarget: '2025-05-17', restoredAt: day(-17) });
  add('PEP', 'rearchived', { regTarget: '2024-03-09', restoredAt: '2025-05-02' });
  // completed within the last year (still on the Patients list)
  for (let i = 0; i < 20; i++) {
    const service = i % 10 < 6 ? 'PEP' : i % 10 < 7 ? 'PrEP' : i % 10 < 9 ? 'Tetanus' : 'Pneumonia';
    add(service, 'completed', { lastDoseAgo: 3 + i * 16 });
  }
  // ongoing, on schedule
  for (let i = 0; i < 24; i++) {
    const service = i % 8 < 5 ? 'PEP' : i % 8 < 6 ? 'PrEP' : 'Tetanus';
    add(service, 'ongoing', { aheadDays: 2 + (i % 9) });
  }
  // due today / tomorrow / overdue
  ['PEP', 'PEP', 'Pneumonia', 'Tetanus'].forEach(s => add(s, 'due-today'));
  ['PEP', 'PEP', 'PrEP', 'Tetanus'].forEach(s => add(s, 'due-tomorrow'));
  ['PEP', 'PEP', 'PEP', 'Tetanus', 'PrEP'].forEach((s, i) => add(s, 'overdue', { lateDays: 2 + i }));

  // Registration date so that dose k falls on `target`.
  const regFor = (service, k, target) => {
    for (let back = 0; back <= 400; back++) {
      const reg = addDaysToDateString(target, -back);
      const sched = buildInitialDoses(service, { day0: reg });
      if (sched[k] && sched[k].date === target) return reg;
    }
    throw new Error(`No registration date puts ${service} dose ${k} on ${target}`);
  };

  const people = specs.map((spec, idx) => {
    const svc = spec.service;
    const n = buildInitialDoses(svc, { day0: T }).length;
    let reg, done;
    switch (spec.state) {
      case 'archived': case 'restored': case 'rearchived':
        reg = spec.regTarget; done = n; break;
      case 'completed': {
        reg = regFor(svc, n - 1, day(-spec.lastDoseAgo)); done = n; break;
      }
      case 'ongoing': {
        // Next dose k lands `aheadDays` from today; every earlier (given)
        // dose must be on or before today, so try each k until one fits.
        const first = between(1, n - 1);
        const ks = Array.from({ length: n - 1 }, (_, j) => ((first - 1 + j) % (n - 1)) + 1);
        for (const k of ks) {
          const r = regFor(svc, k, day(spec.aheadDays));
          const sched = buildInitialDoses(svc, { day0: r });
          if (sched[k - 1].date <= T) { reg = r; done = k; break; }
        }
        if (!reg) { reg = regFor(svc, n - 1, day(2)); done = n - 1; }
        break;
      }
      case 'due-today': {
        const k = svc === 'Pneumonia' ? 0 : Math.min(1 + (idx % (n - 1 || 1)), n - 1);
        reg = regFor(svc, k, T); done = k; break;
      }
      case 'due-tomorrow': {
        const k = Math.min(1 + (idx % (n - 1 || 1)), n - 1);
        reg = regFor(svc, k, day(1)); done = k; break;
      }
      case 'overdue': {
        const k = Math.min(1 + (idx % (n - 1 || 1)), n - 1);
        reg = regFor(svc, k, day(-spec.lateDays)); done = k; break;
      }
      default: throw new Error(spec.state);
    }
    return { spec, reg, done };
  }).filter(Boolean);

  // MRNs: sequential per registration year, in registration order.
  people.sort((a, b) => a.reg.localeCompare(b.reg));
  const seq = {};
  people.forEach(p => {
    const y = p.reg.slice(0, 4);
    seq[y] = (seq[y] || 0) + 1;
    p.mrn = `${y}-${String(seq[y]).padStart(3, '0')}`;
  });

  /* ── Records ── */
  const ANIMALS = ['Dog', 'Dog', 'Dog', 'Cat', 'Cat', 'Monkey', 'Bat'];
  const WOUNDS = ['Left Hand', 'Right Hand', 'Left Leg', 'Right Leg', 'Left Ankle', 'Right Forearm', 'Left Calf', 'Right Thigh'];
  const brandCount = {};
  const movements = [];   // { at, itemKey, patientId, doseKey, doseLabel }
  const records = [];

  people.forEach((p, i) => {
    const { spec, reg, mrn } = p;
    const svc = spec.service;
    const sex = i % 2 ? 'Female' : 'Male';
    const who = person(sex);
    const name = `${who.first} ${who.middle} ${who.last}`;
    const age = svc === 'Pneumonia' ? between(55, 78)
      : svc === 'PrEP' ? between(19, 44)
      : svc === 'Tetanus' ? between(18, 70)
      : pick([between(3, 12), between(13, 30), between(31, 72), between(31, 72)]);
    // WHO: any bat exposure is Category III (with ERIG).
    const animal = svc === 'PEP' ? pick(ANIMALS) : '';
    const cat = svc === 'PEP' ? (animal === 'Bat' ? 'III' : pick(PEP_CATS)) : '';
    const brgy = nextBrgy();
    const zone = `Purok ${between(1, 7)}`;
    const address = `${zone}, Brgy. ${brgy}, Libon, Albay`;
    const brandKey = svc === 'Tetanus' ? 'tt'
      : svc === 'Pneumonia' ? (i % 3 === 0 ? 'ppsv23' : 'pcv20')
      : RABIES[i % 3];
    const brand = INV[brandKey].name;
    const sched = buildInitialDoses(svc, { day0: reg });
    const doses = sched.map((d, k) => {
      const given = k < p.done;
      if (given && d.date > T) throw new Error(`${mrn}: dose ${d.key} would be given on a future date ${d.date}`);
      return {
        key: d.key, n: d.n, date: d.date,
        status: given ? 'done' : 'pending', s: given ? 'done' : 'pending',
        brand: given ? brand : '', note: '',
        stockItemId: given ? INV[brandKey].id : '', stockDeducted: given,
      };
    });
    const doneN = doses.filter(d => d.status === 'done').length;
    const completed = doneN === doses.length;
    // Missed doses only for the overdue state.
    const missed = doses.some(d => d.status !== 'done' && d.date < T);
    if (missed !== (spec.state === 'overdue')) throw new Error(`${mrn}: state ${spec.state} but missed=${missed}`);
    doses.filter(d => d.status === 'done').forEach(d => {
      brandCount[brandKey] = (brandCount[brandKey] || 0) + 1;
      movements.push({ at: ms(d.date, '10:00'), itemKey: brandKey, patientId: mrn, doseKey: d.key, doseLabel: d.n });
    });
    const erig = svc === 'PEP' && cat === 'III';
    if (erig && doneN > 0) {
      brandCount.erig = (brandCount.erig || 0) + 1;
      movements.push({ at: ms(reg, '10:05'), itemKey: 'erig', patientId: mrn, doseKey: 'erig', doseLabel: 'ERIG (Day 0)' });
    }

    const vax = {
      id: mrn, mrn, name,
      email: `${who.first}.${who.last}.${mrn.replace('-', '')}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      contact: `+639005${String(510000 + i).slice(-6)}`,
      age: String(age), sex, dob: '',
      height: String(age < 13 ? between(95, 150) : between(150, 178)), weight: String(age < 13 ? between(15, 40) : between(45, 85)),
      bloodPressure: age < 13 ? '' : pick(['110/70', '120/80', '130/85', '118/76']),
      barangay: brgy, zone, address, service: svc,
      vaccineBrand: doneN ? brand : '',
      placeOfExposure: svc === 'PEP' ? pick(['Own residence', 'Street / Roadside', 'Neighbor\'s house', 'Farm / Field']) : '',
      typeOfExposure: svc === 'PEP' ? (cat === 'III' ? 'Bite' : pick(['Bite', 'Scratch'])) : '',
      sourceOfExposure: svc === 'PEP' ? pick(['Domestic pet', 'Stray animal']) : '',
      woundWashed: svc === 'PEP' || svc === 'Tetanus' ? 'Yes' : '',
      rigGiven: erig ? 'Yes (ERIG)' : 'No',
      vaxGiven: doneN ? 'Yes' : 'No',
      genericName: '', route: svc === 'PEP' || svc === 'PrEP' ? 'ID' : 'IM',
      animal,
      cat,
      date: reg,
      notes: svc === 'PEP' ? (erig ? 'Category III exposure. ERIG infiltrated at the wound on Day 0.' : 'Wound washed with soap and water.') : '',
      pastVaccines: pick(['None', 'Tetanus toxoid', 'Complete childhood immunization']),
      allergies: pick(['No known allergies', 'No known allergies', 'Penicillin']),
      woundLocation: svc === 'PEP' ? pick(WOUNDS) : '',
      woundDepth: svc === 'PEP' ? (cat === 'III' ? 'Deep / Penetrating' : 'Superficial') : '',
      numberOfBites: svc === 'PEP' ? String(cat === 'III' ? between(1, 3) : 1) : '',
      woundType: svc === 'Tetanus' ? pick(['Laceration', 'Puncture', 'Abrasion']) : '',
      lastTetanus: svc === 'Tetanus' ? pick(['Unknown', 'More than 10 years ago', 'Never vaccinated']) : '',
      hepaVariant: '', riskFactor: '', priorHepa: '',
      pneumoVaccine: svc === 'Pneumonia' ? (brandKey === 'ppsv23' ? 'PPSV23 (Pneumovax 23)' : 'PCV20 (Prevnar 20)') : '',
      riskCondition: svc === 'Pneumonia' ? pick(['None', 'Diabetes', 'Asthma / COPD', 'Heart disease']) : '',
      priorPneumo: svc === 'Pneumonia' ? 'None' : '',
      status: completed ? 'completed' : 'ongoing',
      dose: `${doneN}/${doses.length}`,
      doses,
      notifiedDoses: [],
      woundImages: [],
      createdAt: new Date(ms(reg, `${String(8 + (i % 8)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`)),
      ...SAMPLE_MARK,
    };
    if (completed) vax.completedAt = doses[doses.length - 1].date;

    // Archive lifecycle exactly as the sweep and the Restore action write it.
    const RESTORER = { uid: null, name: 'Clinic Staff' };
    if (spec.state === 'archived') {
      Object.assign(vax, { isArchived: true, archivedAt: new Date(ms(plus365(vax.completedAt), '00:30')), archivedBy: 'auto-365' });
    } else if (spec.state === 'restored') {
      const prevArchived = ms(plus365(vax.completedAt), '00:30');
      Object.assign(vax, {
        isArchived: false, restoredAt: spec.restoredAt, restoredBy: RESTORER,
        restoreHistory: [{ restoredAt: spec.restoredAt, restoredAtMs: ms(spec.restoredAt, '10:15'), restoredBy: RESTORER, previousArchivedAt: prevArchived }],
      });
      if (plus365(vax.completedAt) > spec.restoredAt) throw new Error(`${mrn}: restored before it could have been archived`);
    } else if (spec.state === 'rearchived') {
      const firstArchive = plus365(vax.completedAt);
      if (firstArchive > spec.restoredAt) throw new Error(`${mrn}: restored before first archive`);
      const reArchive = plus365(spec.restoredAt);
      if (reArchive > T) throw new Error(`${mrn}: re-archive date ${reArchive} is in the future`);
      Object.assign(vax, {
        isArchived: true, archivedAt: new Date(ms(reArchive, '00:30')), archivedBy: 'auto-365',
        restoredAt: spec.restoredAt, restoredBy: RESTORER,
        restoreHistory: [{ restoredAt: spec.restoredAt, restoredAtMs: ms(spec.restoredAt, '10:15'), restoredBy: RESTORER, previousArchivedAt: ms(firstArchive, '00:30') }],
      });
    } else if (completed && plus365(vax.completedAt) <= T) {
      throw new Error(`${mrn}: completed ${vax.completedAt} is due for archiving but not archived`);
    }

    records.push({ mrn, name, vax, spec, brgy, zone, cat, erig, completed });
  });

  /* ── Incident pins ── */
  // Incident Map pins are SIMULATED (lib/simulatedIncidents.js): random
  // coordinates, no address/barangay/patient, not linked to any record.
  const incidents = buildSimulatedIncidents({ count: 30, seed: 30, todayIso: T, extra: { ...SAMPLE_MARK } });

  /* ── Stock: opening receipt, then one deduction per dose, in time order ── */
  const inventory = Object.entries(INV).map(([key, it]) => ({ key, ...it, used: brandCount[key] || 0, opening: it.final + (brandCount[key] || 0) }));
  const stockOf = Object.fromEntries(inventory.map(it => [it.key, it.opening]));
  const stockMovements = [];
  const openAt = ms('2024-01-02', '08:00');
  inventory.forEach(it => stockMovements.push({
    id: `receive-${it.key}`,
    data: { direction: 'receive', itemId: it.id, itemName: it.name, qty: it.opening, stockBefore: 0, stockAfter: it.opening, patientId: null, doseKey: null, doseLabel: 'Opening stock', byUid: null, at: openAt, ...SAMPLE_MARK },
  }));
  movements.sort((a, b) => a.at - b.at).forEach((m, k) => {
    const it = INV[m.itemKey];
    const before = stockOf[m.itemKey];
    stockOf[m.itemKey] = before - 1;
    stockMovements.push({
      id: `deduct-${m.patientId}-${m.doseKey}`,
      data: { patientId: m.patientId, doseKey: m.doseKey, doseLabel: m.doseLabel, direction: 'deduct', itemId: it.id, itemName: it.name, qty: 1, stockBefore: before, stockAfter: before - 1, byUid: null, at: m.at + k, ...SAMPLE_MARK },
    });
  });
  inventory.forEach(it => { if (stockOf[it.key] !== it.final) throw new Error(`${it.name}: stock ${stockOf[it.key]} != ${it.final}`); });
  const status = (stock, min) => (stock <= 0 ? 'critical' : stock <= min ? 'warning' : 'in-stock');
  const inventoryDocs = inventory.map(it => ({
    id: it.id,
    data: { name: it.name, category: it.category, unit: it.unit, stock: it.final, minStock: it.minStock, expiry: it.expiry, expiryDate: it.expiry, status: status(it.final, it.minStock), openingStock: it.opening, updatedAt: Date.now(), ...SAMPLE_MARK },
  }));

  /* ── Appointments (weekends only) ── */
  const weekend = (weeks, sunday = false) => {
    const d = new Date(`${T}T12:00:00Z`);
    const toSat = (6 - d.getUTCDay() + 7) % 7;
    return addDaysToDateString(T, toSat + weeks * 7 + (sunday ? 1 : 0) - (toSat === 0 && sunday ? 0 : 0));
  };
  const lastWeekendDay = (weeksBack, sunday) => addDaysToDateString(weekend(0, sunday), -7 * weeksBack);
  const byState = s => records.filter(r => r.spec.state === s);
  const A = [
    { r: byState('due-tomorrow')[0], status: 'pending', source: 'app', date: weekend(1), time: '9:00 AM - 10:00 AM' },
    { r: byState('ongoing')[0], status: 'pending', source: 'online', date: weekend(1, true), time: '10:00 AM - 11:00 AM' },
    { r: byState('ongoing')[1], status: 'confirmed', source: 'app', date: weekend(1), time: '8:00 AM - 9:00 AM' },
    { r: byState('overdue')[0], status: 'confirmed', source: 'online', date: weekend(2, true), time: '1:00 PM - 2:00 PM' },
    { walkIn: 'Walk-in: Mario Santos', status: 'confirmed', source: 'walk-in', date: weekend(2), time: '2:00 PM - 3:00 PM', type: 'General Consultation' },
    { r: byState('completed')[0], status: 'done', source: 'app', date: lastWeekendDay(1, false), time: '9:00 AM - 10:00 AM' },
    { r: byState('completed')[1], status: 'done', source: 'online', date: lastWeekendDay(2, true), time: '11:00 AM - 12:00 PM' },
    { walkIn: 'Walk-in: Liza Ramos', status: 'done', source: 'walk-in', date: lastWeekendDay(1, true), time: '3:00 PM - 4:00 PM', type: 'Anti-Tetanus Vaccine' },
    { r: byState('ongoing')[2], status: 'cancelled', source: 'app', date: weekend(1, true), time: '2:00 PM - 3:00 PM', cancellationReason: 'I have a fever and cannot travel this weekend.' },
    { r: byState('ongoing')[3], status: 'cancelled', source: 'online', date: lastWeekendDay(1, false), time: '1:00 PM - 2:00 PM', declineReason: 'Fully booked for this date and time slot' },
    { r: byState('completed')[2], status: 'cancelled', source: 'online', date: weekend(2), time: '10:00 AM - 11:00 AM', declineReason: 'Duplicate appointment booking' },
    { r: byState('ongoing')[4], status: 'cancellation_pending', source: 'app', date: weekend(1), time: '3:00 PM - 4:00 PM', cancellationReason: 'Out of town for a family emergency.' },
  ];
  const svcType = r => r.spec.service === 'PEP' ? 'PEP Follow-up' : r.spec.service === 'PrEP' ? 'Vaccination – Anti-Rabies (PrEP)' : r.spec.service === 'Tetanus' ? 'Anti-Tetanus Vaccine' : 'Pneumococcal Vaccine';
  const appointments = A.map((a, k) => {
    const d = new Date(`${a.date}T12:00:00Z`).getUTCDay();
    if (d !== 0 && d !== 6) throw new Error(`appointment on a weekday: ${a.date}`);
    const data = {
      name: a.r ? a.r.name : a.walkIn,
      contactNumber: a.r ? a.r.vax.contact : '+639005519900',
      date: a.date, time: a.time, type: a.type || svcType(a.r),
      status: a.status, source: a.source, notes: '',
      createdAt: ms(addDaysToDateString(a.date, -6), '09:30') + k,
      ...(a.cancellationReason ? { cancellationReason: a.cancellationReason } : {}),
      ...(a.declineReason ? { declineReason: a.declineReason, cancellationReason: a.declineReason } : {}),
      ...SAMPLE_MARK,
    };
    if (a.r) Object.assign(data, { patientId: a.r.mrn, email: a.r.vax.email, age: a.r.vax.age, gender: a.r.vax.sex, address: a.r.vax.address, userId: `${a.r.mrn}-no-app`, patientUid: `${a.r.mrn}-no-app`, note: '' });
    return { id: `apt-${String(k + 1).padStart(2, '0')}`, data };
  });
  const slotId = (date, time) => `${date}_${String(time).replace(/[\s:]/g, '')}`;
  const appointmentSlots = appointments
    .filter(a => a.data.status !== 'cancelled')
    .map(a => ({ id: slotId(a.data.date, a.data.time), data: { date: a.data.date, time: a.data.time, heldBy: a.data.patientUid || 'clinic', createdAt: a.data.createdAt, ...SAMPLE_MARK } }));

  /* ── Conversations ── */
  const now = ms(T, '08:00');
  const H = 3600000, D = 86400000;
  const threadsSpec = [
    { r: byState('overdue')[1], status: 'new', unread: true, at: now - 40 * 60000, msgs: [['patient', 'Good morning, I missed my scheduled dose. Can I still come this weekend?']] },
    { r: byState('ongoing')[5], status: 'replied', unread: false, at: now - 20 * H, msgs: [['patient', 'Can I take paracetamol after the vaccine?'], ['admin', 'Yes, paracetamol is fine for mild pain or fever.']] },
    { r: byState('due-today')[0], status: 'pending', unread: true, at: now - 3 * H, msgs: [['patient', 'Is the clinic open today for my dose?'], ['admin', 'Yes, we are open from 8 AM.'], ['patient', 'Thank you! I will be there around 10.']] },
    { r: byState('completed')[3], archivedDaysAgo: 4, at: now - 6 * D, msgs: [['patient', 'I finished all my doses, thank you!'], ['admin', 'Great work. Keep your vaccination card safe.']] },
    { r: byState('completed')[4], archivedDaysAgo: 12, at: now - 14 * D, msgs: [['patient', 'Where can I see my vaccination record?'], ['admin', 'Open the app and go to Records.']] },
    { r: byState('completed')[5], archivedDaysAgo: 26, at: now - 28 * D, msgs: [['patient', 'Are you open on holidays?'], ['admin', 'We are open on weekends only. Holiday changes are posted in the app.']] },
  ];
  const chatThreads = [], chatMessages = [];
  threadsSpec.forEach((t, k) => {
    const id = `thread-${String(k + 1).padStart(2, '0')}`;
    const created = t.at - t.msgs.length * 5 * 60000;
    const archived = Boolean(t.archivedDaysAgo);
    chatThreads.push({ id, data: {
      patientUid: `${t.r.mrn}-no-app`, patientName: t.r.name, patientMrn: t.r.mrn, patientEmail: t.r.vax.email,
      status: t.status || 'replied', unread: Boolean(t.unread), resolved: archived,
      lastMessage: t.msgs[t.msgs.length - 1][1], lastMessageAt: t.at, createdAt: created,
      ...(archived ? { closedBy: 'staff', closedAt: t.at + H, archived: true, archivedAt: now - t.archivedDaysAgo * D } : {}),
      ...SAMPLE_MARK,
    } });
    t.msgs.forEach(([sender, text], m) => chatMessages.push({ id: `${id}-m${m + 1}`, data: {
      threadId: id, text, sender, senderName: sender === 'patient' ? t.r.name : 'K&A Clinic', createdAt: created + m * 5 * 60000, ...SAMPLE_MARK,
    } }));
  });

  /* ── Dose reminders already sent by the nightly sweep ── */
  const longDate = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const patientNotifications = [];
  const remind = (r, dose, when, sentOn, ack) => {
    const title = when === 'pre' ? 'Dose due tomorrow' : 'Dose due today';
    const message = when === 'pre'
      ? `Reminder for ${r.name}: ${dose.n} of your ${r.spec.service} schedule is due tomorrow, ${longDate(dose.date)}. Please visit K&A Clinic to stay on schedule.`
      : `Reminder for ${r.name}: ${dose.n} of your ${r.spec.service} schedule is due today, ${longDate(dose.date)}. Please visit K&A Clinic today.`;
    const createdAt = ms(sentOn, '05:02') + patientNotifications.length;
    patientNotifications.push({ id: `notif-${r.mrn}-${dose.key}-${when}`, data: {
      patientId: r.mrn, patientName: r.name, title, message, doseLabel: dose.n, dueDate: longDate(dose.date),
      source: when === 'pre' ? 'auto-day-before' : 'auto-day-of', createdAt,
      acknowledged: ack, acknowledgedAt: ack ? createdAt + 2 * H : null, acknowledgedVia: ack ? 'app' : null, read: ack,
      pushSent: 0, pushError: null, emailed: true, emailError: null, ...SAMPLE_MARK,
    } });
    // New marker format, plus the old one the deployed sweep still checks.
    r.vax.notifiedDoses.push(`${dose.key}@${dose.date}:${when}`, `${dose.key}:${when}`);
  };
  byState('due-today').forEach((r, k) => {
    const dose = r.vax.doses.find(d => d.status !== 'done');
    if (dose.date > r.vax.date) remind(r, dose, 'pre', day(-1), k % 2 === 0);
    remind(r, dose, 'due', T, false);
  });
  byState('overdue').forEach((r, k) => {
    const dose = r.vax.doses.find(d => d.status !== 'done');
    remind(r, dose, 'pre', addDaysToDateString(dose.date, -1), k === 0);
    remind(r, dose, 'due', dose.date, false);
  });
  // due-tomorrow: nothing sent yet, so tonight's sweep (or a local test run) sends "pre".

  const authorizedPatients = records.map(r => ({ id: r.mrn, data: {
    mrn: r.mrn, name: r.name, email: r.vax.email, contact: r.vax.contact,
    authorized: true, registered: false, uid: null, createdAt: r.vax.createdAt, ...SAMPLE_MARK,
  } }));

  const counters = { currentYear: Number(T.slice(0, 4)), lastSequence: seq[T.slice(0, 4)] || 0, updatedAt: new Date().toISOString() };

  return {
    today: T,
    records, incidents, inventoryDocs, stockMovements, appointments, appointmentSlots,
    chatThreads, chatMessages, patientNotifications, authorizedPatients, counters,
    retireInventory: { deleteId: '8U7OSRc65vOYJPvbV5Td' }, // "bcc" test item
  };
}
