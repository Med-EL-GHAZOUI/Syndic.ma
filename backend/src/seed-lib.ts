// Demo/test data factory. Everything is FICTITIOUS (example.com addresses, 06 00 phone range).
import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthService } from './auth/auth.service';
import { AuthUser } from './common/auth-user';
import { Building, Organization, Provider, Residence, Resident, Unit, User } from './entities';
import { FinanceService } from './finance/finance.service';
import { Role } from './common/permissions';

export interface SeededOrg {
  orgId: string;
  residenceId: string;
  unitIds: string[];
  callIds: string[];
  users: Record<Role | 'manager2', { id: string; email: string }>;
  providerId: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Creates one organization with a residence of 8 lots, 3 issued calls, one user per role. */
export async function seedOrg(app: INestApplicationContext, password: string, tag: string): Promise<SeededOrg> {
  const ds = app.get(DataSource);
  const finance = app.get(FinanceService);
  const hash = AuthService.hashPassword(password);
  const orgs = ds.getRepository(Organization);
  const users = ds.getRepository(User);

  const org = await orgs.save(orgs.create({ name: `Syndic ${tag}`, city: 'Casablanca', plan: 'pro', status: 'active' }));
  const residence = await ds.getRepository(Residence).save({ orgId: org.id, name: `Résidence ${tag}`, city: 'Casablanca', address: '12 rue des Orangers', yearBuilt: 2015, monthlyFee: 500 });
  const building = await ds.getRepository(Building).save({ orgId: org.id, residenceId: residence.id, name: 'Immeuble A', floors: 4, elevator: true });

  const areas = [70, 85, 92, 110, 64, 78, 99, 120];
  const total = areas.reduce((a, b) => a + b, 0);
  let assigned = 0;
  const unitRepo = ds.getRepository(Unit);
  const unitIds: string[] = [];
  for (let i = 0; i < areas.length; i++) {
    const tantiemes = i === areas.length - 1 ? 1000 - assigned : Math.round((areas[i] / total) * 1000);
    assigned += tantiemes;
    const u = await unitRepo.save({ orgId: org.id, residenceId: residence.id, buildingId: building.id, number: `${Math.floor(i / 2) + 1}0${(i % 2) + 1}`, floor: Math.floor(i / 2) + 1, type: 'apartment' as const, rooms: 3, area: areas[i], tantiemes });
    unitIds.push(u.id);
  }

  const residentRepo = ds.getRepository(Resident);
  const person = (i: number) => ({ firstName: ['Youssef', 'Salma', 'Karim', 'Nadia', 'Omar', 'Imane', 'Hamza', 'Zineb'][i], lastName: ['Alaoui', 'Bennani', 'Tazi', 'Berrada', 'Lahlou', 'Amrani', 'Rami', 'Saidi'][i] });
  for (let i = 0; i < unitIds.length; i++) {
    await residentRepo.save({ orgId: org.id, residenceId: residence.id, unitId: unitIds[i], userId: null, type: 'owner' as const, ...person(i), phone: `060000${String(1000 + i)}`, email: `owner${i}.${tag}@example.com`, since: '2020-01-01', until: null, active: true, livesIn: true });
  }

  const provider = await ds.getRepository(Provider).save({ orgId: org.id, name: `Plomberie ${tag}`, category: 'plumbing', rating: 4, active: true });

  const mk = async (role: Role, key: string, extra: Partial<User> = {}) => {
    const row = await users.save(users.create({
      orgId: org.id, name: `${role} ${tag}`, email: `${key}.${tag}@example.com`.toLowerCase(), passwordHash: hash, role, active: true,
      residenceIds: [], providerId: null, lastLoginAt: null, ...extra,
    }));
    return { id: row.id, email: row.email };
  };
  const seeded = {
    syndic_admin: await mk('syndic_admin', 'admin'),
    manager: await mk('manager', 'manager', { residenceIds: [residence.id] }),
    manager2: await mk('manager', 'manager2', { residenceIds: [] }),
    accountant: await mk('accountant', 'accountant'),
    owner: await mk('owner', 'owner'),
    tenant: await mk('tenant', 'tenant'),
    provider: await mk('provider', 'provider', { providerId: provider.id }),
  } as unknown as SeededOrg['users'];

  // Link the owner login to lot #0 and a tenant login to lot #1.
  await residentRepo.update({ unitId: unitIds[0], type: 'owner' }, { userId: seeded.owner.id });
  await residentRepo.save({ orgId: org.id, residenceId: residence.id, unitId: unitIds[1], userId: seeded.tenant.id, type: 'tenant' as const, firstName: 'Imane', lastName: 'Lahlou', phone: '0600009999', email: `tenant.${tag}@example.com`, since: '2023-01-01', until: null, active: true, livesIn: true });

  // Three calls for funds, issued through the real service.
  const admin: AuthUser = { id: seeded.syndic_admin.id, orgId: org.id, name: 'Admin', email: seeded.syndic_admin.email, role: 'syndic_admin', residenceIds: [], providerId: null };
  const year = new Date().getFullYear();
  const callIds: string[] = [];
  for (let q = 1; q <= 3; q++) {
    const call = await finance.createCall(admin, { residenceId: residence.id, title: `Appel T${q} ${year}`, period: `${year}-T${q}`, dueDate: iso(new Date(year, (q - 1) * 3, 15)), basis: 'tantiemes', totalAmount: 12000 });
    await finance.issueCall(admin, call.id);
    callIds.push(call.id);
  }

  return { orgId: org.id, residenceId: residence.id, unitIds, callIds, users: seeded, providerId: provider.id };
}

/** Provision the platform super admin (no organization). */
export async function seedSuperAdmin(app: INestApplicationContext, password: string, email: string) {
  const users = app.get(DataSource).getRepository(User);
  const existing = await users.findOneBy({ email });
  if (existing) return { id: existing.id, email };
  const row = await users.save(users.create({ orgId: null, name: 'Platform Admin', email, passwordHash: AuthService.hashPassword(password), role: 'super_admin', active: true, residenceIds: [], providerId: null, lastLoginAt: null }));
  return { id: row.id, email };
}
