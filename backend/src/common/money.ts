// All money arithmetic is done in integer centimes (MAD * 100) to avoid float drift.
// Database columns are numeric(14,2); the transformer converts to/from centimes.
import { ValueTransformer } from 'typeorm';

export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);
export const fromCents = (cents: number): number => Math.round(cents) / 100;

/** numeric(14,2) <-> number of MAD (safe for values < 2^53 centimes). */
export const moneyTransformer: ValueTransformer = {
  to: (value?: number | null) => (value === null || value === undefined ? value : fromCents(toCents(value))),
  from: (value?: string | null) => (value === null || value === undefined ? value : fromCents(toCents(value))),
};

export interface UnitShare {
  unitId: string;
  tantiemes: number;
}

/**
 * Split `totalCents` across units proportionally to tantièmes.
 * The rounding remainder goes to the last unit so the parts always sum to the total.
 */
export function distributeByShares(totalCents: number, units: UnitShare[]): { unitId: string; cents: number }[] {
  const shares = units.reduce((a, u) => a + u.tantiemes, 0);
  if (!units.length || shares <= 0) return [];
  let assigned = 0;
  return units.map((u, i) => {
    const cents = i === units.length - 1 ? totalCents - assigned : Math.round((totalCents * u.tantiemes) / shares);
    assigned += cents;
    return { unitId: u.unitId, cents };
  });
}

export interface OpenCharge {
  id: string;
  dueDate: string;
  dueCents: number;
}

/** FIFO allocation of `cents` over open charges (oldest due date first). */
export function allocateFifo(cents: number, open: OpenCharge[]): { allocations: { chargeId: string; cents: number }[]; leftCents: number } {
  let left = cents;
  const allocations: { chargeId: string; cents: number }[] = [];
  for (const c of [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    if (left <= 0) break;
    const part = Math.min(left, c.dueCents);
    if (part > 0) {
      allocations.push({ chargeId: c.id, cents: part });
      left -= part;
    }
  }
  return { allocations, leftCents: left };
}
