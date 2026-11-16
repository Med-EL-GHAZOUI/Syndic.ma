// Demo dataset. Everything here is FICTIONAL: names are random combinations,
// phone numbers use a non-attributed pattern and e-mails use example.com.
// Dates are generated relative to "today" so the demo always looks current.
// A fixed-seed PRNG keeps the dataset identical between resets.

export const SEED_VERSION = 3;
export const DEMO_PASSWORD = 'demo1234';

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Youssef', 'Mehdi', 'Karim', 'Omar', 'Hamza', 'Anas', 'Rachid', 'Hicham', 'Driss', 'Khalid', 'Amine', 'Saad',
  'Fatima-Zahra', 'Salma', 'Nadia', 'Khadija', 'Meryem', 'Imane', 'Sanaa', 'Houda', 'Laila', 'Zineb', 'Asmae', 'Ghita'];
const LAST = ['Alaoui', 'Bennani', 'El Idrissi', 'Tazi', 'Berrada', 'Chraibi', 'Lahlou', 'Benjelloun', 'El Fassi', 'Amrani',
  'Ouazzani', 'Bouzidi', 'Naciri', 'Sekkat', 'Kettani', 'Zniber', 'Belkadi', 'Mansouri', 'Haddad', 'Rami', 'Saidi', 'Jebli',
  'Ait Lahcen', 'Oukacha', 'El Khattabi', 'Benali', 'Cherkaoui', 'Filali', 'Guessous', 'Hajji'];

const RESIDENCES = [
  { id: 'res_andalous', orgId: 'org_atlas', name: 'Résidence Al Andalous', city: 'Casablanca', address: '12, rue des Orangers, Maârif', yearBuilt: 2014, fee: 480, shops: 2,
    buildings: [{ name: 'Immeuble A', floors: 5, perFloor: 2 }, { name: 'Immeuble B', floors: 5, perFloor: 2 }] },
  { id: 'res_agdal', orgId: 'org_atlas', name: "Les Jardins de l'Agdal", city: 'Rabat', address: '45, avenue des Tilleuls, Agdal', yearBuilt: 2018, fee: 560, shops: 0,
    buildings: [{ name: 'Bâtiment 1', floors: 4, perFloor: 3 }] },
  { id: 'res_bahr', orgId: 'org_atlas', name: 'Résidence Bab Al Bahr', city: 'Tanger', address: '8, boulevard de la Corniche', yearBuilt: 2020, fee: 620, shops: 0,
    buildings: [{ name: 'Bloc Nord', floors: 4, perFloor: 2 }, { name: 'Bloc Sud', floors: 4, perFloor: 2 }] },
  { id: 'res_malabata', orgId: 'org_rif', name: 'Résidence Malabata', city: 'Tanger', address: '3, rue du Phare', yearBuilt: 2016, fee: 400, shops: 0,
    buildings: [{ name: 'Immeuble Unique', floors: 3, perFloor: 2 }] },
];

export function buildSeed() {
  const rnd = mulberry32(20261116);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const now = new Date();
  const today = iso(now);
  const shift = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };
  const days = (n) => iso(shift(n));
  const stamp = (n, hour = 10) => {
    const d = shift(n);
    d.setHours(hour, between(0, 59), 0, 0);
    return d.toISOString();
  };
  const addDays = (isoDate, n) => {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  let seq = 0;
  const id = (p) => `${p}_${String(++seq).padStart(4, '0')}`;
  const phone = () => `+2126000${String(between(10000, 99999))}`;
  const person = () => ({ firstName: pick(FIRST), lastName: pick(LAST) });
  const mail = (p) => `${p.firstName}.${p.lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';

  const s = {
    __v: SEED_VERSION, counters: {}, organizations: [], users: [], residences: [], buildings: [], units: [],
    residents: [], calls: [], charges: [], payments: [], expenses: [], providers: [], complaints: [],
    maintenance: [], announcements: [], documents: [], assemblies: [], notifications: [], audit: [],
  };

  // ---- Organizations (tenants) --------------------------------------------
  s.organizations.push(
    { id: 'org_atlas', name: 'Atlas Syndic Gestion', city: 'Casablanca', contactName: 'Nadia Bennani', email: 'contact@atlas-syndic.example.com', phone: '+212522000101', plan: 'pro', status: 'active', createdAt: stamp(-420) },
    { id: 'org_rif', name: 'Rif Immobilier Services', city: 'Tanger', contactName: 'Hicham El Khattabi', email: 'contact@rif-immo.example.com', phone: '+212539000202', plan: 'starter', status: 'active', createdAt: stamp(-260) },
    { id: 'org_souss', name: 'Souss Copro Conseil', city: 'Agadir', contactName: 'Asmae Oukacha', email: 'contact@souss-copro.example.com', phone: '+212528000303', plan: 'business', status: 'trial', createdAt: stamp(-9) },
    { id: 'org_oasis', name: 'Oasis Gestion Résidentielle', city: 'Marrakech', contactName: 'Driss Mansouri', email: 'contact@oasis-gestion.example.com', phone: '+212524000404', plan: 'starter', status: 'suspended', createdAt: stamp(-600) },
  );

  // ---- Users (demo accounts) ----------------------------------------------
  const user = (uid, orgId, name, email, role, extra = {}) => {
    s.users.push({ id: uid, orgId, name, email, password: DEMO_PASSWORD, role, phone: phone(), active: true, residenceIds: [], createdAt: stamp(-300), ...extra });
  };
  user('u_super', null, 'Équipe Plateforme', 'super@demo.syndic.ma', 'super_admin');
  user('u_admin', 'org_atlas', 'Nadia Bennani', 'admin@demo.syndic.ma', 'syndic_admin');
  user('u_manager', 'org_atlas', 'Karim Tazi', 'gestion@demo.syndic.ma', 'manager', { residenceIds: ['res_andalous', 'res_agdal'] });
  user('u_accountant', 'org_atlas', 'Salma Berrada', 'compta@demo.syndic.ma', 'accountant');
  user('u_owner', 'org_atlas', 'Youssef El Idrissi', 'proprio@demo.syndic.ma', 'owner');
  user('u_tenant', 'org_atlas', 'Imane Lahlou', 'locataire@demo.syndic.ma', 'tenant');
  user('u_provider', 'org_atlas', 'Rachid Amrani', 'prestataire@demo.syndic.ma', 'provider', { providerId: 'prov_plumb' });
  user('u_admin_rif', 'org_rif', 'Hicham El Khattabi', 'admin.rif@demo.syndic.ma', 'syndic_admin');

  // ---- Providers -----------------------------------------------------------
  const provider = (pid, orgId, name, category, city, contact, rating) => {
    s.providers.push({ id: pid, orgId, name, category, city, contactName: contact, phone: phone(), email: `contact@${pid.replace('prov_', '')}.example.com`, ice: '000000000000000', rating, active: true, createdAt: stamp(-280) });
  };
  provider('prov_plumb', 'org_atlas', 'Plomberie Atlas Services', 'plumbing', 'Casablanca', 'Rachid Amrani', 4);
  provider('prov_elec', 'org_atlas', 'Élec Pro Maroc', 'electricity', 'Casablanca', 'Saad Naciri', 5);
  provider('prov_lift', 'org_atlas', 'Ascenseurs du Nord', 'elevator', 'Tanger', 'Omar Sekkat', 4);
  provider('prov_clean', 'org_atlas', 'Net & Clean Services', 'cleaning', 'Casablanca', 'Houda Saidi', 4);
  provider('prov_guard', 'org_atlas', 'Vigilance Sécurité', 'security', 'Rabat', 'Khalid Jebli', 3);
  provider('prov_garden', 'org_atlas', 'Jardins & Paysages', 'gardening', 'Rabat', 'Amine Filali', 5);
  provider('prov_paint', 'org_atlas', 'Peinture Al Amal', 'painting', 'Casablanca', 'Hamza Rami', 4);
  provider('prov_general', 'org_atlas', 'Bricolage Express', 'general', 'Tanger', 'Anas Hajji', 3);
  provider('prov_rif_clean', 'org_rif', 'Détroit Nettoyage', 'cleaning', 'Tanger', 'Laila Benali', 4);
  provider('prov_rif_lift', 'org_rif', 'Lift Maintenance Tanger', 'elevator', 'Tanger', 'Mehdi Cherkaoui', 4);
  const providerFor = (orgId, category) =>
    (s.providers.find((p) => p.orgId === orgId && p.category === category) || s.providers.find((p) => p.orgId === orgId)).id;

  // ---- Residences, buildings, lots, residents ------------------------------
  let demoOwnerUnit = null;
  let demoTenantUnit = null;

  for (const r of RESIDENCES) {
    s.residences.push({ id: r.id, orgId: r.orgId, name: r.name, city: r.city, address: r.address, yearBuilt: r.yearBuilt, monthlyFee: r.fee, createdAt: stamp(-400) });
    const units = [];
    r.buildings.forEach((b, bi) => {
      const buildingId = id('bld');
      s.buildings.push({ id: buildingId, residenceId: r.id, name: b.name, floors: b.floors, elevator: b.floors > 3, createdAt: stamp(-400) });
      if (bi === 0) {
        for (let k = 1; k <= r.shops; k++) {
          units.push({ id: id('unt'), residenceId: r.id, buildingId, number: `RDC-${k}`, floor: 0, type: 'shop', area: between(45, 80), rooms: 1 });
        }
      }
      for (let f = 1; f <= b.floors; f++) {
        for (let k = 1; k <= b.perFloor; k++) {
          units.push({ id: id('unt'), residenceId: r.id, buildingId, number: `${f}${p2(k)}`, floor: f, type: 'apartment', area: between(62, 138), rooms: between(2, 5) });
        }
      }
    });
    // Tantièmes: proportional to area, summing exactly to 1000.
    const totalArea = units.reduce((a, u) => a + u.area, 0);
    let assigned = 0;
    units.forEach((u, i) => {
      u.tantiemes = i === units.length - 1 ? 1000 - assigned : Math.round((u.area / totalArea) * 1000);
      assigned += u.tantiemes;
      u.createdAt = stamp(-400);
      s.units.push(u);
    });

    const apartments = units.filter((u) => u.type === 'apartment');
    if (r.id === 'res_andalous') {
      demoOwnerUnit = apartments[0];
      demoTenantUnit = apartments[3];
    }

    units.forEach((u, i) => {
      const isDemoOwner = u === demoOwnerUnit;
      const isDemoTenant = u === demoTenantUnit;
      const roll = rnd();
      const rented = isDemoTenant || (!isDemoOwner && (u.type === 'shop' || roll < 0.25));
      const vacant = !rented && !isDemoOwner && roll > 0.92;
      const owner = isDemoOwner ? { firstName: 'Youssef', lastName: 'El Idrissi' } : person();
      const since = `${between(r.yearBuilt, year - 2)}-${p2(between(1, 12))}-01`;

      // A few lots changed hands: keep the previous owner as history.
      if (!isDemoOwner && i % 9 === 4) {
        const former = person();
        const sold = `${year - 2}-${p2(between(1, 12))}-15`;
        s.residents.push({ id: id('rsd'), orgId: r.orgId, residenceId: r.id, unitId: u.id, type: 'owner', ...former, phone: phone(), email: mail(former), since: `${r.yearBuilt}-06-01`, until: sold, active: false, livesIn: false, userId: null, createdAt: stamp(-400) });
      }
      s.residents.push({
        id: id('rsd'), orgId: r.orgId, residenceId: r.id, unitId: u.id, type: 'owner', ...owner, phone: phone(),
        email: isDemoOwner ? 'proprio@demo.syndic.ma' : mail(owner), since, until: null, active: true,
        livesIn: !rented && !vacant, userId: isDemoOwner ? 'u_owner' : null, createdAt: stamp(-400),
      });
      if (rented) {
        const tenant = isDemoTenant ? { firstName: 'Imane', lastName: 'Lahlou' } : person();
        s.residents.push({
          id: id('rsd'), orgId: r.orgId, residenceId: r.id, unitId: u.id, type: 'tenant', ...tenant, phone: phone(),
          email: isDemoTenant ? 'locataire@demo.syndic.ma' : mail(tenant), since: `${year - between(0, 2)}-${p2(between(1, 12))}-01`,
          until: null, active: true, livesIn: true, userId: isDemoTenant ? 'u_tenant' : null, createdAt: stamp(-200),
        });
      }
    });
  }

  const unitsOf = (residenceId) => s.units.filter((u) => u.residenceId === residenceId);
  const ownerOf = (unitId) => s.residents.find((x) => x.unitId === unitId && x.type === 'owner' && x.active);
  const nameOf = (p) => `${p.firstName} ${p.lastName}`;

  // ---- Calls for funds, charges, payments ----------------------------------
  const rawPayments = [];
  const method = () => {
    const x = rnd();
    return x < 0.45 ? 'transfer' : x < 0.75 ? 'cheque' : 'cash';
  };
  const reference = (m) => (m === 'cheque' ? `CHQ ${between(100000, 999999)}` : m === 'transfer' ? `VIR ${between(100000, 999999)}` : '');

  function addCall(r, { title, period, dueDate, basis, totalAmount = 0, amountPerUnit = 0, status = 'issued', age = 0, paidOdds, partialOdds }) {
    const call = { id: id('cal'), residenceId: r.id, title, period, dueDate, basis, totalAmount, amountPerUnit, status, createdAt: stamp(-30), issuedAt: status === 'draft' ? null : `${addDays(dueDate, -20)}T09:00:00.000Z` };
    s.calls.push(call);
    if (status === 'draft') return call;
    const units = unitsOf(r.id);
    const totalShares = units.reduce((a, u) => a + u.tantiemes, 0);
    let assigned = 0;
    units.forEach((u, i) => {
      let amount;
      if (basis === 'fixed') amount = amountPerUnit;
      else {
        amount = i === units.length - 1 ? round2(totalAmount - assigned) : round2((totalAmount * u.tantiemes) / totalShares);
        assigned = round2(assigned + amount);
      }
      const charge = { id: id('chg'), callId: call.id, residenceId: r.id, unitId: u.id, label: title, amount, dueDate, createdAt: call.issuedAt };
      s.charges.push(charge);

      let paid = 0;
      const x = rnd();
      if (x < paidOdds) paid = amount;
      else if (x < paidOdds + partialOdds) paid = round2(Math.round(amount * (0.3 + rnd() * 0.4)));
      if (u === demoOwnerUnit && basis === 'tantiemes') paid = age === 0 ? 0 : age === 1 ? round2(Math.round(amount / 2)) : amount;
      if (paid <= 0) return;

      let date = addDays(dueDate, between(-6, 45));
      if (date >= today) date = days(-between(1, 12));
      const m = method();
      const owner = ownerOf(u.id);
      rawPayments.push({
        id: id('pay'), residenceId: r.id, unitId: u.id, payerName: owner ? nameOf(owner) : '—', amount: paid, date, method: m,
        reference: reference(m), status: 'recorded', allocations: [{ chargeId: charge.id, amount: paid }], note: '',
        createdBy: 'u_accountant', declaredBy: null, createdAt: `${date}T11:00:00.000Z`,
      });
    });
    return call;
  }

  for (const r of RESIDENCES) {
    const count = unitsOf(r.id).length;
    const total = Math.round((r.fee * 3 * count) / 100) * 100;
    for (let q = 1; q <= quarter; q++) {
      const age = quarter - q;
      addCall(r, {
        title: `Appel de fonds T${q} ${year}`, period: `${year}-T${q}`, dueDate: `${year}-${p2((q - 1) * 3 + 1)}-15`,
        basis: 'tantiemes', totalAmount: total, age,
        paidOdds: age >= 2 ? 0.96 : age === 1 ? 0.86 : 0.55, partialOdds: age >= 2 ? 0.02 : age === 1 ? 0.07 : 0.15,
      });
    }
    const nq = quarter === 4 ? 1 : quarter + 1;
    const ny = quarter === 4 ? year + 1 : year;
    addCall(r, { title: `Appel de fonds T${nq} ${ny}`, period: `${ny}-T${nq}`, dueDate: `${ny}-${p2((nq - 1) * 3 + 1)}-15`, basis: 'tantiemes', totalAmount: total, status: 'draft' });
  }
  addCall(RESIDENCES[0], {
    title: "Travaux d'étanchéité — terrasse Immeuble B", period: `${year}-EXC`, dueDate: days(-18), basis: 'fixed',
    amountPerUnit: 1200, paidOdds: 0.4, partialOdds: 0.1,
  });

  rawPayments.sort((a, b) => a.date.localeCompare(b.date));
  rawPayments.forEach((p, i) => {
    p.receiptNo = `REC-${p.date.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`;
    s.payments.push(p);
  });
  s.counters.receipt = rawPayments.length;

  // One reversed payment (bounced cheque) — kept in history, never deleted.
  const bounced = [...s.payments].reverse().find((p) => p.residenceId === 'res_andalous' && p.method === 'cheque' && p.unitId !== demoOwnerUnit.id);
  if (bounced) {
    bounced.status = 'reversed';
    bounced.reversalReason = 'Chèque rejeté par la banque (provision insuffisante)';
    bounced.reversedAt = stamp(-3);
    bounced.reversedBy = 'u_accountant';
  }
  // Two payments declared by residents, awaiting validation by the accountant.
  s.payments.push({
    id: id('pay'), residenceId: 'res_andalous', unitId: demoOwnerUnit.id, payerName: 'Youssef El Idrissi', amount: 500, date: days(-1),
    method: 'transfer', reference: 'VIR 558201', status: 'pending', allocations: [], note: 'Virement effectué depuis mon application bancaire.',
    receiptNo: null, createdBy: 'u_owner', declaredBy: 'u_owner', createdAt: stamp(-1),
  });
  const other = unitsOf('res_agdal')[2];
  s.payments.push({
    id: id('pay'), residenceId: 'res_agdal', unitId: other.id, payerName: nameOf(ownerOf(other.id)), amount: 800, date: days(-2),
    method: 'cheque', reference: 'CHQ 204417', status: 'pending', allocations: [], note: 'Chèque déposé à la loge.',
    receiptNo: null, createdBy: null, declaredBy: null, createdAt: stamp(-2),
  });

  // ---- Expenses --------------------------------------------------------------
  const REPAIRS = ['Remplacement pompe de relevage', 'Réparation porte du garage', 'Reprise peinture cage d\'escalier', 'Débouchage colonne eaux usées', 'Remplacement interphone', 'Réparation éclairage parking'];
  let invoice = 1040;
  const expense = (r, category, label, amount, date, status, providerCategory) => {
    s.expenses.push({
      id: id('exp'), residenceId: r.id, category, label, amount, date, invoiceRef: `FAC-${++invoice}`, status,
      providerId: providerCategory ? providerFor(r.orgId, providerCategory) : null,
      paidAt: status === 'paid' ? `${addDays(date, 7)}T10:00:00.000Z` : null, createdAt: `${date}T09:00:00.000Z`,
    });
  };
  for (const r of RESIDENCES) {
    const count = unitsOf(r.id).length;
    for (let m = 9; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const day = (n) => {
        const out = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(n)}`;
        return out > today ? today : out;
      };
      const status = m === 0 ? pick(['pending', 'approved']) : 'paid';
      const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
      expense(r, 'cleaning', `Nettoyage des parties communes — ${label}`, count * 55, day(5), status, 'cleaning');
      expense(r, 'security', `Gardiennage — ${label}`, count * 95, day(5), status, 'security');
      expense(r, 'electricity', `Électricité parties communes — ${label}`, between(900, 1900), day(12), m === 0 ? 'pending' : 'paid', null);
      expense(r, 'water', `Eau parties communes — ${label}`, between(300, 700), day(14), m === 0 ? 'pending' : 'paid', null);
      if (m % 3 === 0) expense(r, 'elevator', `Contrat maintenance ascenseurs — ${label}`, 2400, day(8), status, 'elevator');
      if (r.id === 'res_agdal') expense(r, 'gardening', `Entretien des espaces verts — ${label}`, 800, day(10), status, 'gardening');
      if (rnd() < 0.35) expense(r, 'repairs', pick(REPAIRS), between(6, 45) * 100, day(between(15, 26)), m === 0 ? 'pending' : 'paid', pick(['plumbing', 'electricity', 'general']));
      if (m === 8) expense(r, 'insurance', `Assurance multirisque immeuble ${d.getFullYear()}`, 9500, day(20), 'paid', null);
    }
  }

  // ---- Complaints ------------------------------------------------------------
  const complaint = (residenceId, unit, c) => {
    const owner = unit ? ownerOf(unit.id) : null;
    s.complaints.push({
      id: id('cmp'), residenceId, unitId: unit ? unit.id : null, authorId: null, authorName: owner ? nameOf(owner) : '—',
      assignedTo: 'u_manager', comments: [], ...c,
    });
  };
  const and = unitsOf('res_andalous');
  const agd = unitsOf('res_agdal');
  const bah = unitsOf('res_bahr');
  const mal = unitsOf('res_malabata');
  complaint('res_andalous', demoOwnerUnit, {
    authorId: 'u_owner', authorName: 'Youssef El Idrissi', title: 'Fuite d\'eau au plafond de la salle de bain', category: 'plumbing', priority: 'high', status: 'in_progress',
    description: 'Une tache d\'humidité s\'agrandit au plafond depuis trois jours. L\'eau semble venir de l\'appartement du dessus.', createdAt: stamp(-6),
    comments: [
      { by: 'u_manager', byName: 'Karim Tazi', at: stamp(-5), text: 'Bonjour, nous avons bien reçu votre réclamation. Un plombier passera jeudi matin.' },
      { by: 'u_owner', byName: 'Youssef El Idrissi', at: stamp(-5, 15), text: 'Merci, je serai présent jeudi entre 9h et 12h.' },
    ],
  });
  complaint('res_andalous', demoOwnerUnit, { authorId: 'u_owner', authorName: 'Youssef El Idrissi', title: 'Ampoule grillée sur le palier du 1er étage', category: 'electricity', priority: 'low', status: 'resolved', description: 'L\'éclairage du palier ne fonctionne plus.', createdAt: stamp(-34), comments: [{ by: 'u_manager', byName: 'Karim Tazi', at: stamp(-32), text: 'Ampoule remplacée ce matin.' }] });
  complaint('res_andalous', demoTenantUnit, { authorId: 'u_tenant', authorName: 'Imane Lahlou', title: 'Bruit de travaux tard le soir', category: 'noise', priority: 'medium', status: 'new', description: 'Des travaux ont lieu après 21h dans l\'appartement voisin depuis une semaine.', createdAt: stamp(-1) });
  complaint('res_andalous', and[7], { title: 'Ascenseur de l\'immeuble A en panne', category: 'elevator', priority: 'urgent', status: 'in_progress', description: 'L\'ascenseur est bloqué au 3e étage depuis ce matin.', createdAt: stamp(-2) });
  complaint('res_andalous', and[12], { title: 'Voiture mal garée sur ma place', category: 'parking', priority: 'low', status: 'closed', description: 'Un véhicule occupe régulièrement la place n°14.', createdAt: stamp(-60) });
  complaint('res_andalous', and[15], { title: 'Porte d\'entrée du hall qui ne se verrouille plus', category: 'security', priority: 'high', status: 'new', description: 'La gâche électrique ne fonctionne plus, la porte reste ouverte.', createdAt: stamp(-1, 8) });
  complaint('res_agdal', agd[1], { title: 'Poubelles non ramassées', category: 'cleaning', priority: 'medium', status: 'resolved', description: 'Le local poubelles déborde depuis le week-end.', createdAt: stamp(-20) });
  complaint('res_agdal', agd[5], { title: 'Infiltration dans le parking', category: 'plumbing', priority: 'medium', status: 'in_progress', description: 'De l\'eau s\'accumule près de la rampe d\'accès après chaque pluie.', createdAt: stamp(-9) });
  complaint('res_agdal', agd[8], { title: 'Interphone hors service', category: 'electricity', priority: 'medium', status: 'new', description: 'L\'interphone de mon appartement ne sonne plus.', createdAt: stamp(-3) });
  complaint('res_bahr', bah[2], { title: 'Éclairage extérieur défaillant', category: 'electricity', priority: 'medium', status: 'new', description: 'Trois lampadaires de l\'allée principale sont éteints.', createdAt: stamp(-4) });
  complaint('res_bahr', bah[9], { title: 'Nettoyage insuffisant des escaliers', category: 'cleaning', priority: 'low', status: 'closed', description: 'Les escaliers du Bloc Sud ne sont nettoyés qu\'une fois par semaine.', createdAt: stamp(-45) });
  complaint('res_malabata', mal[1], { title: 'Fuite sur la colonne montante', category: 'plumbing', priority: 'high', status: 'new', description: 'Fuite visible dans la gaine technique du 2e étage.', createdAt: stamp(-2) });

  // ---- Maintenance work orders ----------------------------------------------
  const work = (w) => s.maintenance.push({ id: id('mnt'), complaintId: null, actualCost: null, notes: [], ...w });
  const leak = s.complaints[0];
  work({ residenceId: 'res_andalous', title: 'Recherche de fuite — salle de bain lot 101', type: 'corrective', providerId: 'prov_plumb', complaintId: leak.id, scheduledDate: days(2), estimatedCost: 1500, status: 'planned', description: 'Inspection de la colonne et des joints de l\'appartement du dessus.', createdAt: stamp(-5) });
  work({ residenceId: 'res_agdal', title: 'Étanchéité rampe du parking', type: 'corrective', providerId: 'prov_plumb', scheduledDate: days(-1), estimatedCost: 6800, status: 'in_progress', description: 'Reprise du caniveau et pose d\'un joint d\'étanchéité.', createdAt: stamp(-8), notes: [{ byName: 'Rachid Amrani', at: stamp(-1), text: 'Caniveau dégagé, pose du joint prévue demain.' }] });
  work({ residenceId: 'res_andalous', title: 'Remplacement vanne d\'arrêt générale', type: 'corrective', providerId: 'prov_plumb', scheduledDate: days(-25), estimatedCost: 2200, actualCost: 2350, status: 'done', description: 'Vanne grippée en sous-sol.', createdAt: stamp(-30) });
  work({ residenceId: 'res_andalous', title: 'Dépannage ascenseur Immeuble A', type: 'corrective', providerId: 'prov_lift', complaintId: s.complaints[3].id, scheduledDate: days(0), estimatedCost: 3200, status: 'in_progress', description: 'Cabine bloquée, diagnostic carte de commande.', createdAt: stamp(-2) });
  work({ residenceId: 'res_andalous', title: 'Visite trimestrielle des ascenseurs', type: 'preventive', providerId: 'prov_lift', scheduledDate: days(12), estimatedCost: 2400, status: 'planned', description: 'Contrôle réglementaire et graissage.', createdAt: stamp(-10) });
  work({ residenceId: 'res_agdal', title: 'Taille des haies et tonte', type: 'preventive', providerId: 'prov_garden', scheduledDate: days(5), estimatedCost: 800, status: 'planned', description: 'Entretien mensuel des espaces verts.', createdAt: stamp(-4) });
  work({ residenceId: 'res_bahr', title: 'Remplacement lampadaires allée principale', type: 'corrective', providerId: 'prov_elec', complaintId: s.complaints[9].id, scheduledDate: days(3), estimatedCost: 4100, status: 'planned', description: 'Trois têtes LED à remplacer.', createdAt: stamp(-3) });
  work({ residenceId: 'res_bahr', title: 'Peinture du hall Bloc Nord', type: 'preventive', providerId: 'prov_paint', scheduledDate: days(-40), estimatedCost: 9000, actualCost: 8700, status: 'done', description: 'Deux couches, teinte sable.', createdAt: stamp(-55) });
  work({ residenceId: 'res_agdal', title: 'Vérification extincteurs', type: 'preventive', providerId: 'prov_general', scheduledDate: days(-70), estimatedCost: 1200, status: 'cancelled', description: 'Reportée à la demande du conseil syndical.', createdAt: stamp(-80) });
  work({ residenceId: 'res_malabata', title: 'Maintenance annuelle ascenseur', type: 'preventive', providerId: 'prov_rif_lift', scheduledDate: days(9), estimatedCost: 2000, status: 'planned', description: 'Contrat annuel.', createdAt: stamp(-6) });

  // ---- Announcements ---------------------------------------------------------
  const announce = (a) => s.announcements.push({ id: id('ann'), authorName: 'Karim Tazi', pinned: false, ...a });
  announce({ residenceId: 'res_andalous', title: 'Coupure d\'eau programmée jeudi matin', category: 'works', audience: 'all', pinned: true, publishedAt: stamp(-1), body: 'En raison d\'une intervention sur la colonne d\'alimentation, l\'eau sera coupée jeudi de 9h à 12h dans l\'Immeuble A.\nMerci de prévoir vos réserves.' });
  announce({ residenceId: 'res_andalous', title: 'Convocation à l\'assemblée générale ordinaire', category: 'meeting', audience: 'owners', publishedAt: stamp(-4), body: 'Les copropriétaires sont convoqués à l\'assemblée générale ordinaire. L\'ordre du jour et les documents sont disponibles dans la rubrique Assemblées.' });
  announce({ residenceId: 'res_andalous', title: 'Rappel : tri des déchets', category: 'info', audience: 'all', publishedAt: stamp(-15), body: 'Merci de déposer les cartons pliés dans le local prévu à cet effet et de ne rien laisser dans les couloirs.' });
  announce({ residenceId: 'res_andalous', title: 'Travaux d\'étanchéité de la terrasse — Immeuble B', category: 'works', audience: 'all', publishedAt: stamp(-22), body: 'Les travaux débuteront le mois prochain pour une durée estimée de trois semaines. L\'accès à la terrasse sera interdit pendant cette période.' });
  announce({ residenceId: 'res_agdal', title: 'Nouveau prestataire pour les espaces verts', category: 'info', audience: 'all', publishedAt: stamp(-12), body: 'L\'entretien des jardins est désormais assuré par une nouvelle équipe, présente chaque mardi.' });
  announce({ residenceId: 'res_agdal', title: 'Désinsectisation des parties communes', category: 'urgent', audience: 'all', pinned: true, publishedAt: stamp(-2), body: 'Une désinsectisation aura lieu samedi à partir de 8h. Merci de garder vos fenêtres fermées pendant l\'intervention.' });
  announce({ residenceId: 'res_bahr', title: 'Remise en peinture du hall terminée', category: 'info', audience: 'all', publishedAt: stamp(-30), body: 'Le hall du Bloc Nord a été entièrement repeint. Merci pour votre patience.' });
  announce({ residenceId: 'res_malabata', title: 'Maintenance de l\'ascenseur', category: 'works', audience: 'all', publishedAt: stamp(-3), authorName: 'Hicham El Khattabi', body: 'L\'ascenseur sera immobilisé mardi prochain de 10h à 13h.' });

  // ---- Documents (metadata only — no file content is stored in the demo) -----
  const doc = (residenceId, name, category, visibility, fileName, size, ago) =>
    s.documents.push({ id: id('doc'), residenceId, name, category, visibility, fileName, size, mime: 'application/pdf', uploadedAt: stamp(ago), uploadedBy: 'Nadia Bennani' });
  doc('res_andalous', 'Règlement de copropriété', 'regulation', 'all', 'reglement-copropriete.pdf', 1843200, -380);
  doc('res_andalous', 'Règlement intérieur', 'regulation', 'all', 'reglement-interieur.pdf', 412300, -380);
  doc('res_andalous', `PV de l'assemblée générale ${year - 1}`, 'minutes', 'owners', `pv-ag-${year - 1}.pdf`, 688000, -300);
  doc('res_andalous', 'Contrat de maintenance des ascenseurs', 'contract', 'staff', 'contrat-ascenseurs.pdf', 954000, -200);
  doc('res_andalous', `Attestation d'assurance ${year}`, 'insurance', 'owners', `assurance-${year}.pdf`, 301000, -240);
  doc('res_andalous', 'Devis étanchéité terrasse', 'invoice', 'staff', 'devis-etancheite.pdf', 215000, -40);
  doc('res_andalous', 'Plan des parkings', 'plan', 'all', 'plan-parkings.pdf', 2650000, -350);
  doc('res_agdal', 'Règlement de copropriété', 'regulation', 'all', 'reglement-copropriete.pdf', 1620000, -320);
  doc('res_agdal', 'Contrat de gardiennage', 'contract', 'staff', 'contrat-gardiennage.pdf', 530000, -150);
  doc('res_agdal', `Budget prévisionnel ${year}`, 'other', 'owners', `budget-${year}.pdf`, 188000, -280);
  doc('res_bahr', 'Règlement de copropriété', 'regulation', 'all', 'reglement-copropriete.pdf', 1710000, -300);
  doc('res_bahr', `Attestation d'assurance ${year}`, 'insurance', 'owners', `assurance-${year}.pdf`, 298000, -230);
  doc('res_malabata', 'Règlement de copropriété', 'regulation', 'all', 'reglement-copropriete.pdf', 1420000, -250);

  // ---- General assemblies ------------------------------------------------------
  const attendance = (units, held) => units.map((u) => {
    if (!held) return { unitId: u.id, status: 'absent', proxyTo: '' };
    const x = rnd();
    return { unitId: u.id, status: x < 0.58 ? 'present' : x < 0.76 ? 'proxy' : 'absent', proxyTo: x >= 0.58 && x < 0.76 ? nameOf(person()) : '' };
  });
  const heldAtt = attendance(and, true);
  const repr = heldAtt.reduce((a, x, i) => a + (x.status === 'absent' ? 0 : and[i].tantiemes), 0);
  s.assemblies.push({
    id: id('asm'), residenceId: 'res_andalous', title: `Assemblée générale ordinaire ${year - 1}`, type: 'ordinary', date: days(-210), time: '18:30',
    location: 'Salle polyvalente, rez-de-chaussée Immeuble A', status: 'held', createdAt: stamp(-240),
    agenda: ['Approbation des comptes de l\'exercice écoulé', 'Vote du budget prévisionnel', 'Renouvellement du contrat de gardiennage', 'Questions diverses'],
    attendance: heldAtt,
    resolutions: [
      { id: id('rsl'), title: 'Approbation des comptes de l\'exercice', votesFor: Math.round(repr * 0.9), votesAgainst: Math.round(repr * 0.04), abstain: repr - Math.round(repr * 0.9) - Math.round(repr * 0.04) },
      { id: id('rsl'), title: 'Adoption du budget prévisionnel', votesFor: Math.round(repr * 0.78), votesAgainst: Math.round(repr * 0.15), abstain: repr - Math.round(repr * 0.78) - Math.round(repr * 0.15) },
      { id: id('rsl'), title: 'Installation de caméras dans le parking', votesFor: Math.round(repr * 0.35), votesAgainst: Math.round(repr * 0.55), abstain: repr - Math.round(repr * 0.35) - Math.round(repr * 0.55) },
    ],
    minutes: 'La séance est ouverte à 18h40 sous la présidence du syndic.\nLe quorum étant atteint, l\'assemblée peut valablement délibérer.\nLes comptes de l\'exercice sont présentés et approuvés.\nLe budget prévisionnel est adopté.\nLa proposition d\'installation de caméras est rejetée.\nLa séance est levée à 20h15.',
  });
  s.assemblies.push({
    id: id('asm'), residenceId: 'res_andalous', title: `Assemblée générale ordinaire ${year}`, type: 'ordinary', date: days(16), time: '18:30',
    location: 'Salle polyvalente, rez-de-chaussée Immeuble A', status: 'convened', createdAt: stamp(-6),
    agenda: ['Approbation des comptes', 'Budget prévisionnel', 'Travaux d\'étanchéité de la terrasse — Immeuble B', 'Élection du conseil syndical'],
    attendance: attendance(and, false),
    resolutions: [
      { id: id('rsl'), title: 'Approbation des comptes de l\'exercice', votesFor: 0, votesAgainst: 0, abstain: 0 },
      { id: id('rsl'), title: 'Validation du devis d\'étanchéité', votesFor: 0, votesAgainst: 0, abstain: 0 },
    ],
    minutes: '',
  });
  s.assemblies.push({
    id: id('asm'), residenceId: 'res_agdal', title: 'Assemblée générale extraordinaire — ravalement', type: 'extraordinary', date: days(38), time: '19:00',
    location: 'Hall du Bâtiment 1', status: 'planned', createdAt: stamp(-2), agenda: ['Présentation des devis de ravalement', 'Vote du financement'],
    attendance: attendance(agd, false), resolutions: [], minutes: '',
  });
  s.assemblies.push({
    id: id('asm'), residenceId: 'res_malabata', title: `Assemblée générale ordinaire ${year}`, type: 'ordinary', date: days(25), time: '18:00',
    location: 'Hall de l\'immeuble', status: 'planned', createdAt: stamp(-3), agenda: ['Approbation des comptes', 'Budget prévisionnel'],
    attendance: attendance(mal, false), resolutions: [], minutes: '',
  });

  // ---- Notifications -----------------------------------------------------------
  const note = (n) => s.notifications.push({ id: id('ntf'), orgId: 'org_atlas', toUserId: null, toRoles: null, residenceId: null, params: {}, link: '', byUserId: null, readBy: [], ...n });
  note({ toRoles: ['syndic_admin', 'manager'], residenceId: 'res_andalous', key: 'notif.complaintNew', params: { title: 'Porte d\'entrée du hall qui ne se verrouille plus' }, link: '#/complaints', at: stamp(-1, 8) });
  note({ toRoles: ['syndic_admin', 'manager'], residenceId: 'res_andalous', key: 'notif.complaintNew', params: { title: 'Bruit de travaux tard le soir' }, link: '#/complaints', at: stamp(-1) });
  note({ toRoles: ['syndic_admin', 'accountant'], residenceId: 'res_andalous', key: 'notif.paymentDeclared', params: { name: 'Youssef El Idrissi' }, link: '#/payments', at: stamp(-1) });
  note({ toRoles: ['syndic_admin', 'accountant'], residenceId: 'res_agdal', key: 'notif.paymentDeclared', params: { name: nameOf(ownerOf(other.id)) }, link: '#/payments', at: stamp(-2) });
  note({ toRoles: ['owner', 'tenant'], residenceId: 'res_andalous', key: 'notif.announcement', params: { title: 'Coupure d\'eau programmée jeudi matin' }, link: '#/announcements', at: stamp(-1) });
  note({ toRoles: ['owner'], residenceId: 'res_andalous', key: 'notif.assemblyConvened', params: { title: `Assemblée générale ordinaire ${year}` }, link: '#/assemblies', at: stamp(-4) });
  note({ toUserId: 'u_owner', key: 'notif.complaintUpdated', params: { title: 'Fuite d\'eau au plafond de la salle de bain' }, link: '#/complaints', at: stamp(-5) });
  note({ toUserId: 'u_provider', key: 'notif.maintenanceAssigned', params: { title: 'Recherche de fuite — salle de bain lot 101' }, link: '#/maintenance', at: stamp(-5) });

  // ---- Audit trail (sample history) ---------------------------------------------
  const log = (at, userId, action, entity, summary) => {
    const u = s.users.find((x) => x.id === userId);
    s.audit.push({ id: id('aud'), at, userId, userName: u.name, role: u.role, orgId: u.orgId, action, entity, entityId: '', summary });
  };
  log(stamp(-6), 'u_manager', 'create', 'assemblies', `Assemblée générale ordinaire ${year}`);
  log(stamp(-5), 'u_manager', 'create', 'maintenance', 'Recherche de fuite — salle de bain lot 101');
  log(stamp(-4), 'u_manager', 'create', 'announcements', 'Convocation à l\'assemblée générale ordinaire');
  log(stamp(-3), 'u_accountant', 'reverse', 'payments', bounced ? bounced.receiptNo : '');
  log(stamp(-2), 'u_accountant', 'update', 'expenses', 'Gardiennage');
  log(stamp(-1), 'u_admin', 'login', 'users', 'admin@demo.syndic.ma');
  log(stamp(-1), 'u_admin', 'create', 'users', 'Karim Tazi');
  log(stamp(-9), 'u_super', 'create', 'organizations', 'Souss Copro Conseil');

  return s;
}
