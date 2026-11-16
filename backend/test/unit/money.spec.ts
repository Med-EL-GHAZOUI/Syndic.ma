import { allocateFifo, distributeByShares, fromCents, toCents } from '../../src/common/money';
import { can, MATRIX, ROLES } from '../../src/common/permissions';

describe('money helpers', () => {
  it('converts without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('1234.56')).toBe(123456);
    expect(fromCents(123456)).toBe(1234.56);
    expect(toCents(19.99 * 3)).toBe(5997);
  });

  describe('distributeByShares (I2)', () => {
    const units = (shares: number[]) => shares.map((tantiemes, i) => ({ unitId: `u${i}`, tantiemes }));

    it('parts always sum exactly to the total', () => {
      for (const total of [1, 99, 10000, 1234567, 3333333]) {
        for (const shares of [[1, 1, 1], [333, 333, 334], [70, 85, 92, 110, 64, 78, 99, 120], [1, 999]]) {
          const parts = distributeByShares(total, units(shares));
          expect(parts.reduce((a, p) => a + p.cents, 0)).toBe(total);
        }
      }
    });

    it('is proportional and puts the rounding remainder on the last unit', () => {
      const parts = distributeByShares(100, units([1, 1, 1]));
      expect(parts.map((p) => p.cents)).toEqual([33, 33, 34]);
    });

    it('returns nothing when there is nothing to distribute on', () => {
      expect(distributeByShares(1000, [])).toEqual([]);
      expect(distributeByShares(1000, units([0, 0]))).toEqual([]);
    });
  });

  describe('allocateFifo (I4)', () => {
    const open = [
      { id: 'new', dueDate: '2026-07-15', dueCents: 5000 },
      { id: 'old', dueDate: '2026-01-15', dueCents: 3000 },
      { id: 'mid', dueDate: '2026-04-15', dueCents: 4000 },
    ];

    it('pays the oldest charges first', () => {
      const { allocations, leftCents } = allocateFifo(5000, open);
      expect(allocations).toEqual([{ chargeId: 'old', cents: 3000 }, { chargeId: 'mid', cents: 2000 }]);
      expect(leftCents).toBe(0);
    });

    it('never allocates more than a charge still owes, and reports leftovers', () => {
      const { allocations, leftCents } = allocateFifo(20000, open);
      expect(allocations.reduce((a, x) => a + x.cents, 0)).toBe(12000);
      expect(leftCents).toBe(8000);
      for (const a of allocations) expect(a.cents).toBeLessThanOrEqual(open.find((o) => o.id === a.chargeId)!.dueCents);
    });

    it('allocation total equals the amount when it fits', () => {
      const { allocations } = allocateFifo(7777, open);
      expect(allocations.reduce((a, x) => a + x.cents, 0)).toBe(7777);
    });
  });
});

describe('RBAC matrix', () => {
  it('only staff validate payments; residents can create (declare) but never validate', () => {
    expect(can('accountant', 'payments', 'x')).toBe(true);
    expect(can('syndic_admin', 'payments', 'x')).toBe(true);
    expect(can('manager', 'payments', 'x')).toBe(false);
    expect(can('owner', 'payments', 'x')).toBe(false);
    expect(can('tenant', 'payments', 'c')).toBe(false);
  });

  it('only accountant/admin approve expenses', () => {
    expect(ROLES.filter((r) => can(r, 'expenses', 'a')).sort()).toEqual(['accountant', 'syndic_admin']);
  });

  it('platform administration is exclusive to super_admin', () => {
    expect(ROLES.filter((r) => can(r, 'platform', 'c'))).toEqual(['super_admin']);
  });

  it('providers can only touch maintenance', () => {
    expect(Object.keys(MATRIX.provider)).toEqual(['maintenance']);
  });

  it('unknown modules are denied', () => {
    for (const r of ROLES) expect(can(r, 'does-not-exist', 'v')).toBe(false);
  });
});
