import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { fromCents, toCents } from '../common/money';
import { page } from '../common/pagination';
import { PeriodService } from '../common/period.service';
import { ScopeService } from '../common/scope.service';
import { BankLine, Payment } from '../entities';
import { parseBankCsv } from './bank-csv';
import { ImportDto, LinesQuery } from './reconciliation.dto';

/**
 * Reconciliation links a RECORDED payment (a manual bookkeeping entry) to a line of the bank
 * statement. A matched payment becomes `verified = true`: the only way a payment gets that flag.
 * Rules: exact amount, same residence, credits only, one line <-> one payment, cash is never matched.
 */
const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / DAY;

interface Candidate { payment: Payment; score: number; byReference: boolean; withinDays: boolean }

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(BankLine) private readonly lines: Repository<BankLine>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly period: PeriodService,
  ) {}

  // ---- import -----------------------------------------------------------------------------------
  /** All-or-nothing: one bad row rejects the whole file, so a half-imported statement can never exist. */
  async importCsv(user: AuthUser, dto: ImportDto) {
    const orgId = this.scope.requireOrg(user);
    await this.scope.assertResidence(user, dto.residenceId);
    const parsed = parseBankCsv(dto.csv, `${orgId}|${dto.residenceId}`);
    if (parsed.errors.length) throw new BadRequestException({ message: 'Invalid bank statement', errors: parsed.errors.slice(0, 50) });

    const batchId = randomUUID();
    let imported = 0;
    let duplicates = 0;
    await this.ds.transaction(async (m) => {
      for (const l of parsed.lines) {
        const res = await m.query(
          `INSERT INTO bank_lines (org_id, residence_id, batch_id, booking_date, amount, label, reference, hash, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unmatched',$9) ON CONFLICT (org_id, hash) DO NOTHING RETURNING id`,
          [orgId, dto.residenceId, batchId, l.bookingDate, fromCents(l.amountCents), l.label, l.reference, l.hash, user.id],
        );
        if (res.length) imported++; else duplicates++;
      }
      await this.audit.log(user, 'import', 'bank_lines', batchId, `${imported} lines (${duplicates} duplicates)`, m);
    });
    return { batchId, imported, duplicates, total: parsed.lines.length };
  }

  // ---- reading -----------------------------------------------------------------------------------
  private async candidatesFor(line: BankLine): Promise<Candidate[]> {
    if (line.amount <= 0) return [];
    const pays = await this.payments.find({ where: { orgId: line.orgId, residenceId: line.residenceId, status: 'recorded', verified: false, amount: line.amount } });
    const text = `${line.reference} ${line.label}`.toLowerCase();
    return pays
      .filter((p) => p.method !== 'cash') // cash never crosses a bank statement
      .map((p) => {
        const ref = (p.reference ?? '').trim().toLowerCase();
        const byReference = ref.length >= 3 && text.includes(ref);
        const withinDays = daysBetween(line.bookingDate, p.date) <= 7;
        return { payment: p, byReference, withinDays, score: (byReference ? 2 : 0) + (withinDays ? 1 : 0) };
      })
      .sort((a, b) => b.score - a.score);
  }

  async list(user: AuthUser, q: LinesQuery) {
    const orgId = this.scope.requireOrg(user);
    const ids = await this.scope.residenceIds(user);
    if (q.residenceId && !ids.includes(q.residenceId)) throw new NotFoundException('Residence not found');
    if (!ids.length) return [];
    const rows = await this.lines.find({
      where: { orgId, residenceId: q.residenceId ?? In(ids), ...(q.status ? { status: q.status as BankLine['status'] } : {}) },
      order: { bookingDate: 'DESC', createdAt: 'DESC' },
      ...page(q),
    });
    return Promise.all(rows.map(async (l) => ({
      ...l,
      suggestions: l.status === 'unmatched'
        ? (await this.candidatesFor(l)).map((c) => ({ paymentId: c.payment.id, receiptNo: c.payment.receiptNo, payerName: c.payment.payerName, date: c.payment.date, reference: c.payment.reference, score: c.score }))
        : [],
    })));
  }

  async summary(user: AuthUser, residenceId?: string) {
    const orgId = this.scope.requireOrg(user);
    const all = await this.scope.residenceIds(user);
    if (residenceId && !all.includes(residenceId)) throw new NotFoundException('Residence not found');
    const ids = residenceId ? [residenceId] : all;
    if (!ids.length) return { unmatchedLines: 0, unmatchedAmount: 0, unverifiedPayments: 0, unverifiedAmount: 0, verifiedPayments: 0 };
    const [l] = await this.ds.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(ROUND(amount*100)),0)::bigint AS c FROM bank_lines WHERE org_id=$1 AND residence_id = ANY($2) AND status='unmatched' AND amount > 0`, [orgId, ids]);
    const [p] = await this.ds.query(`SELECT COUNT(*) FILTER (WHERE NOT verified AND method <> 'cash')::int AS n, COALESCE(SUM(ROUND(amount*100)) FILTER (WHERE NOT verified AND method <> 'cash'),0)::bigint AS c, COUNT(*) FILTER (WHERE verified)::int AS v FROM payments WHERE org_id=$1 AND residence_id = ANY($2) AND status='recorded'`, [orgId, ids]);
    return { unmatchedLines: l.n, unmatchedAmount: fromCents(Number(l.c)), unverifiedPayments: p.n, unverifiedAmount: fromCents(Number(p.c)), verifiedPayments: p.v };
  }

  // ---- matching -----------------------------------------------------------------------------------
  private async ownedLine(user: AuthUser, id: string): Promise<BankLine> {
    const row = await this.lines.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Bank line not found');
    await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  /** Locks the line and the payment, re-checks every rule inside the transaction, then links them. */
  async match(user: AuthUser, lineId: string, paymentId: string, auto = false) {
    await this.ownedLine(user, lineId);
    return this.ds.transaction(async (m) => {
      const [line] = await m.query('SELECT * FROM bank_lines WHERE id=$1 AND org_id=$2 FOR UPDATE', [lineId, user.orgId]);
      const [pay] = await m.query('SELECT * FROM payments WHERE id=$1 AND org_id=$2 FOR UPDATE', [paymentId, user.orgId]);
      if (!pay) throw new NotFoundException('Payment not found');
      if (line.status !== 'unmatched') throw new ConflictException('Bank line is already matched or ignored');
      if (toCents(line.amount) <= 0) throw new ConflictException('Only credits can be matched');
      if (pay.status !== 'recorded') throw new ConflictException('Only recorded payments can be matched');
      if (pay.verified) throw new ConflictException('Payment is already bank-verified');
      if (pay.method === 'cash') throw new ConflictException('Cash payments cannot be matched to a bank statement');
      if (pay.residence_id !== line.residence_id) throw new ConflictException('Payment and bank line belong to different residences');
      if (toCents(pay.amount) !== toCents(line.amount)) throw new ConflictException('Amounts differ: a match must be exact');
      await this.period.assertOpen(user.orgId!, line.residence_id, pay.date, m);

      await m.query(`UPDATE bank_lines SET status='matched', payment_id=$1, matched_by=$2, matched_at=now() WHERE id=$3`, [paymentId, user.id, lineId]);
      await m.query('UPDATE payments SET verified = true, updated_at = now() WHERE id=$1', [paymentId]);
      await this.audit.log(user, auto ? 'auto_match' : 'match', 'bank_lines', lineId, `${pay.receipt_no} <-> ${line.label}`, m);
      return { lineId, paymentId, status: 'matched' };
    });
  }

  async unmatch(user: AuthUser, lineId: string, reason: string) {
    await this.ownedLine(user, lineId);
    return this.ds.transaction(async (m) => {
      const [line] = await m.query('SELECT * FROM bank_lines WHERE id=$1 AND org_id=$2 FOR UPDATE', [lineId, user.orgId]);
      if (line.status !== 'matched' || !line.payment_id) throw new ConflictException('Bank line is not matched');
      const [pay] = await m.query('SELECT receipt_no, date, residence_id FROM payments WHERE id=$1 FOR UPDATE', [line.payment_id]);
      await this.period.assertOpen(user.orgId!, pay.residence_id, pay.date, m);
      await m.query(`UPDATE bank_lines SET status='unmatched', payment_id=NULL, matched_by=NULL, matched_at=NULL, note=$2 WHERE id=$1`, [lineId, reason.slice(0, 240)]);
      await m.query('UPDATE payments SET verified = false, updated_at = now() WHERE id=$1', [line.payment_id]);
      await this.audit.log(user, 'unmatch', 'bank_lines', lineId, `${pay.receipt_no}: ${reason}`, m);
      return { lineId, status: 'unmatched' };
    });
  }

  async ignore(user: AuthUser, lineId: string, reason: string) {
    const row = await this.ownedLine(user, lineId);
    const res = await this.lines.update({ id: lineId, status: 'unmatched' }, { status: 'ignored', note: reason.slice(0, 240), matchedBy: user.id, matchedAt: new Date() });
    if (!res.affected) throw new ConflictException(`Bank line is ${row.status}; only unmatched lines can be ignored`);
    await this.audit.log(user, 'ignore', 'bank_lines', lineId, reason);
    return { lineId, status: 'ignored' };
  }

  /**
   * Conservative auto-match. A pair is matched only when it is UNAMBIGUOUS in both directions:
   * the line has exactly one candidate payment, that payment has exactly one candidate line, and the
   * reference matches or the dates are within 7 days. Everything else is left for a human.
   */
  async autoMatch(user: AuthUser, residenceId: string) {
    await this.scope.assertResidence(user, residenceId);
    const orgId = this.scope.requireOrg(user);
    const open = await this.lines.find({ where: { orgId, residenceId, status: 'unmatched' } });
    const perLine = new Map<string, Candidate[]>();
    const perPayment = new Map<string, number>();
    for (const l of open) {
      const c = await this.candidatesFor(l);
      perLine.set(l.id, c);
      for (const x of c) perPayment.set(x.payment.id, (perPayment.get(x.payment.id) ?? 0) + 1);
    }
    let matched = 0;
    const skipped: { lineId: string; reason: string }[] = [];
    for (const l of open) {
      const c = perLine.get(l.id) ?? [];
      if (l.amount <= 0) continue;
      if (c.length !== 1) { skipped.push({ lineId: l.id, reason: c.length ? 'ambiguous (several candidate payments)' : 'no candidate payment' }); continue; }
      const only = c[0];
      if (perPayment.get(only.payment.id) !== 1) { skipped.push({ lineId: l.id, reason: 'ambiguous (payment fits several lines)' }); continue; }
      if (!only.byReference && !only.withinDays) { skipped.push({ lineId: l.id, reason: 'same amount but reference and date do not support it' }); continue; }
      try {
        await this.match(user, l.id, only.payment.id, true);
        matched++;
      } catch (e) {
        skipped.push({ lineId: l.id, reason: e instanceof Error ? e.message : 'rejected' });
      }
    }
    return { matched, skipped: skipped.length, details: skipped.slice(0, 50) };
  }
}
