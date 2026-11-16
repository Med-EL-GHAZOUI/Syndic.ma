// Dashboards: one per audience (staff, resident, provider, platform).
import { esc, sum, todayIso } from '../core/dom.js';
import { t, tl } from '../core/i18n.js';
import { money, pct, date, int, monthLabel } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { can, isResident, activeResidenceIds, inScope, myUnitIds, myResidentRecords } from '../core/permissions.js';
import { summary, monthlySeries, openCharges, paidMap, round2 } from '../core/finance.js';
import { PLANS, planById } from '../data/plans.js';
import { pageHeader, kpi, statusBadge, emptyState, unitLabel, residenceName, twoLine } from '../ui/kit.js';
import { barChart, donut, COLORS } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { visibleAnnouncements } from './announcements.js';
import { myComplaints } from './complaints.js';

const card = (title, body, link = '') => `
  <section class="card">
    <div class="card-head"><h2>${esc(title)}</h2>${link}</div>
    ${body}
  </section>`;

const more = (href) => `<a class="small" href="${href}">${esc(t('common.viewAll'))}</a>`;

const list = (items, empty) => (items.length ? `<ul class="list">${items.join('')}</ul>` : emptyState({ title: empty }));

function staffDashboard(root, user) {
  const ids = activeResidenceIds();
  const f = summary(ids);
  const units = inScope('units');
  const months = monthlySeries(ids, 6);
  const today = todayIso();

  const openComplaints = can('complaints') ? inScope('complaints').filter((c) => c.status === 'new' || c.status === 'in_progress') : [];
  const pending = inScope('payments').filter((p) => p.status === 'pending');

  const byStatus = { paid: 0, partial: 0, overdue: 0, unpaid: 0 };
  f.charges.forEach((c) => { byStatus[c.status] += 1; });

  const arrears = new Map();
  f.charges.filter((c) => c.overdue).forEach((c) => arrears.set(c.unitId, round2((arrears.get(c.unitId) || 0) + c.due)));
  const topArrears = [...arrears.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recent = inScope('payments').filter((p) => p.status === 'recorded').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const agenda = [
    ...(can('assemblies') ? inScope('assemblies').filter((a) => a.date >= today && a.status !== 'cancelled').map((a) => ({ date: a.date, title: a.title, sub: residenceName(a.residenceId), href: `#/assemblies/${a.id}`, ic: 'landmark' })) : []),
    ...(can('maintenance') ? inScope('maintenance').filter((m) => m.scheduledDate >= today && m.status === 'planned').map((m) => ({ date: m.scheduledDate, title: m.title, sub: residenceName(m.residenceId), href: '#/maintenance', ic: 'wrench' })) : []),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  root.innerHTML = `
    ${pageHeader({ title: t('dash.hello', { name: user.name.split(' ')[0] }), subtitle: t('dash.staffSub', { n: ids.length }) })}
    ${pending.length && can('payments', 'x') ? `<a class="note warn" href="#/payments" style="display:block">${esc(t('dash.pendingPayments', { n: pending.length }))}</a>` : ''}
    <div class="grid grid-kpi">
      ${kpi({ label: t('dash.rate'), value: pct(f.rate), hint: t('dash.rateHint'), icon: 'chart' })}
      ${kpi({ label: t('dash.collected'), value: money(f.collected), hint: t('dash.ofCharged', { total: money(f.charged) }), icon: 'wallet' })}
      ${kpi({ label: t('dash.overdue'), value: money(f.overdue), hint: t('dash.overdueHint', { n: arrears.size }), icon: 'alert', tone: 'danger' })}
      ${kpi({ label: t('dash.expenses'), value: money(f.expenses), hint: t('dash.balance', { total: money(f.balance) }), icon: 'receipt', tone: 'accent' })}
      ${can('complaints') ? kpi({ label: t('dash.openComplaints'), value: int(openComplaints.length), hint: t('dash.urgentCount', { n: openComplaints.filter((c) => c.priority === 'urgent' || c.priority === 'high').length }), icon: 'message', tone: 'warning' }) : ''}
      ${kpi({ label: t('dash.units'), value: int(units.length), hint: t('dash.residencesCount', { n: ids.length }), icon: 'door', tone: 'info' })}
    </div>
    <div class="grid grid-main">
      ${card(t('dash.chartTitle'), `<div class="card-body stack">${barChart({
        title: t('dash.chartTitle'),
        labels: months.map((m) => monthLabel(m.year, m.month)),
        series: [
          { name: t('dash.seriesCollected'), color: COLORS.brand, values: months.map((m) => m.collected) },
          { name: t('dash.seriesSpent'), color: COLORS.accent, values: months.map((m) => m.spent) },
        ],
        fmt: money,
      })}</div>`)}
      ${card(t('dash.chargesStatus'), `<div class="card-body">${donut({
        centerValue: pct(f.rate),
        centerLabel: t('dash.collectedShort'),
        fmt: int,
        segments: [
          { label: tl('chargeStatus', 'paid'), value: byStatus.paid, color: COLORS.success },
          { label: tl('chargeStatus', 'partial'), value: byStatus.partial, color: COLORS.warning },
          { label: tl('chargeStatus', 'overdue'), value: byStatus.overdue, color: COLORS.danger },
          { label: tl('chargeStatus', 'unpaid'), value: byStatus.unpaid, color: COLORS.neutral },
        ],
      })}</div>`)}
    </div>
    <div class="grid grid-2">
      ${card(t('dash.topArrears'), list(topArrears.map(([unitId, due]) => {
        const unit = db.get('units', unitId);
        return `<li><div class="grow">${twoLine(unitLabel(unit), residenceName(unit.residenceId))}</div><strong class="num" style="color:var(--danger)">${esc(money(due))}</strong></li>`;
      }), t('dash.noArrears')), can('finance') ? more('#/finance/charges') : '')}
      ${card(t('dash.recentPayments'), list(recent.map((p) => `<li><div class="grow">${twoLine(p.payerName, `${unitLabel(p.unitId)} · ${date(p.date)}`)}</div><strong class="num">${esc(money(p.amount))}</strong></li>`), t('dash.noPayments')), can('payments') ? more('#/payments') : '')}
    </div>
    <div class="grid grid-2">
      ${can('complaints') ? card(t('dash.openComplaints'), list(openComplaints.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((c) => `<li><div class="grow">${twoLine(c.title, `${residenceName(c.residenceId)} · ${date(c.createdAt)}`)}</div>${statusBadge('priority', c.priority)}</li>`), t('dash.noComplaints')), more('#/complaints')) : ''}
      ${card(t('dash.agenda'), list(agenda.map((a) => `<li>${icon(a.ic)}<div class="grow"><a href="${a.href}">${twoLine(a.title, a.sub)}</a></div><span class="nowrap muted">${esc(date(a.date))}</span></li>`), t('dash.noAgenda')))}
    </div>`;
}

function residentDashboard(root, user) {
  const records = myResidentRecords();
  const unitIds = myUnitIds();
  const isOwner = user.role === 'owner';
  const map = paidMap();
  const open = isOwner ? unitIds.flatMap((id) => openCharges(id, map)) : [];
  const balance = round2(sum(open, (c) => c.due));
  const next = open[0];
  const complaints = myComplaints().filter((c) => c.status === 'new' || c.status === 'in_progress');
  const news = visibleAnnouncements().slice(0, 3);
  const today = todayIso();
  const assembly = isOwner
    ? db.all('assemblies').filter((a) => records.some((r) => r.residenceId === a.residenceId) && a.date >= today && a.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))[0]
    : null;
  const home = records[0];

  root.innerHTML = `
    ${pageHeader({
      title: t('dash.hello', { name: user.name.split(' ')[0] }),
      subtitle: home ? `${residenceName(home.residenceId)} — ${unitLabel(home.unitId)}` : t('dash.noUnit'),
      actions: `<a class="btn btn-primary" href="#/complaints">${icon('plus')}<span>${esc(t('complaints.add'))}</span></a>`,
    })}
    <div class="grid grid-kpi">
      ${isOwner ? kpi({ label: t('dash.myBalance'), value: money(balance), hint: balance > 0 ? t('dash.myBalanceDue') : t('dash.myBalanceOk'), icon: 'wallet', tone: balance > 0 ? 'danger' : '' }) : ''}
      ${isOwner ? kpi({ label: t('dash.nextDue'), value: next ? date(next.dueDate) : '—', hint: next ? next.label : t('dash.nothingDue'), icon: 'calendar', tone: 'accent' }) : ''}
      ${kpi({ label: t('dash.myComplaints'), value: int(complaints.length), hint: t('dash.inProgress'), icon: 'message', tone: 'warning' })}
      ${isOwner ? kpi({ label: t('dash.nextAssembly'), value: assembly ? date(assembly.date) : '—', hint: assembly ? assembly.title : t('dash.noAssembly'), icon: 'landmark', tone: 'info' }) : kpi({ label: t('nav.announcements'), value: int(visibleAnnouncements().length), hint: t('dash.published'), icon: 'megaphone', tone: 'info' })}
    </div>
    <div class="grid grid-2">
      ${isOwner ? card(t('dash.myCharges'), list(open.slice(0, 5).map((c) => `<li><div class="grow">${twoLine(c.label, `${t('finance.dueDate')} ${date(c.dueDate)}`)}</div>${statusBadge('chargeStatus', c.status)}<strong class="num">${esc(money(c.due))}</strong></li>`), t('dash.myBalanceOk')), more('#/finance')) : ''}
      ${card(t('nav.announcements'), list(news.map((a) => `<li><div class="grow">${twoLine(a.title, date(a.publishedAt))}</div>${statusBadge('announcementCategory', a.category)}</li>`), t('announcements.empty')), more('#/announcements'))}
      ${card(t('dash.myComplaints'), list(complaints.slice(0, 5).map((c) => `<li><div class="grow">${twoLine(c.title, date(c.createdAt))}</div>${statusBadge('complaintStatus', c.status)}</li>`), t('dash.noComplaints')), more('#/complaints'))}
    </div>`;
}

function providerDashboard(root, user) {
  const tickets = db.all('maintenance').filter((m) => m.providerId === user.providerId);
  const company = db.get('providers', user.providerId);
  const upcoming = tickets.filter((m) => m.status === 'planned' || m.status === 'in_progress').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  root.innerHTML = `
    ${pageHeader({ title: t('dash.hello', { name: user.name.split(' ')[0] }), subtitle: company ? company.name : '' })}
    <div class="grid grid-kpi">
      ${kpi({ label: tl('maintStatus', 'planned'), value: int(tickets.filter((m) => m.status === 'planned').length), icon: 'calendar', tone: 'info' })}
      ${kpi({ label: tl('maintStatus', 'in_progress'), value: int(tickets.filter((m) => m.status === 'in_progress').length), icon: 'wrench', tone: 'warning' })}
      ${kpi({ label: tl('maintStatus', 'done'), value: int(tickets.filter((m) => m.status === 'done').length), icon: 'check' })}
    </div>
    ${card(t('dash.myTickets'), list(upcoming.map((m) => `<li><div class="grow">${twoLine(m.title, `${residenceName(m.residenceId)} · ${date(m.scheduledDate)}`)}</div>${statusBadge('maintStatus', m.status)}</li>`), t('dash.noTickets')), more('#/maintenance'))}`;
}

function platformDashboard(root) {
  const orgs = db.all('organizations');
  const active = orgs.filter((o) => o.status === 'active');
  const mrr = sum(active, (o) => planById(o.plan).price);
  root.innerHTML = `
    ${pageHeader({ title: t('dash.platformTitle'), subtitle: t('dash.platformSub'), actions: `<a class="btn btn-primary" href="#/platform">${icon('globe')}<span>${esc(t('nav.platform'))}</span></a>` })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('dash.orgsActive'), value: int(active.length), hint: t('dash.orgsTrial', { n: orgs.filter((o) => o.status === 'trial').length }), icon: 'globe' })}
      ${kpi({ label: t('dash.mrr'), value: money(mrr), hint: t('dash.mrrHint'), icon: 'wallet', tone: 'accent' })}
      ${kpi({ label: t('nav.residences'), value: int(db.all('residences').length), icon: 'building', tone: 'info' })}
      ${kpi({ label: t('dash.units'), value: int(db.all('units').length), icon: 'door', tone: 'warning' })}
    </div>
    <div class="grid grid-main">
      ${card(t('dash.orgs'), list(orgs.map((o) => `<li><div class="grow">${twoLine(o.name, `${o.city} · ${tl('plan', o.plan)}`)}</div>${statusBadge('orgStatus', o.status)}</li>`), t('common.emptyTitle')), more('#/platform'))}
      ${card(t('dash.planSplit'), `<div class="card-body">${donut({
        centerValue: int(orgs.length),
        centerLabel: t('dash.orgsShort'),
        fmt: int,
        segments: PLANS.map((p, i) => ({ label: tl('plan', p.id), value: orgs.filter((o) => o.plan === p.id).length, color: [COLORS.brand, COLORS.accent, COLORS.warning][i] })),
      })}</div>`)}
    </div>`;
}

export function mount(root) {
  const user = currentUser();
  if (user.role === 'super_admin') platformDashboard(root);
  else if (isResident(user)) residentDashboard(root, user);
  else if (user.role === 'provider') providerDashboard(root, user);
  else staffDashboard(root, user);
}
