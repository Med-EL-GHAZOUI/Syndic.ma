import { AuditLog } from './audit.entity';
import { Assembly, DocumentFile, WorkOrder } from './community.entity';
import { Allocation, CallForFunds, Charge, Counter, Payment } from './finance.entity';
import { Organization, RefreshToken, User } from './identity.entity';
import { Announcement, Complaint, Expense, Provider } from './ops.entity';
import { Building, Residence, Resident, Unit } from './property.entity';

export * from './audit.entity';
export * from './community.entity';
export * from './finance.entity';
export * from './identity.entity';
export * from './ops.entity';
export * from './property.entity';

export const ENTITIES = [
  Organization, User, RefreshToken, Residence, Building, Unit, Resident,
  CallForFunds, Charge, Payment, Allocation, Counter,
  Provider, Expense, Complaint, Announcement, AuditLog,
  WorkOrder, Assembly, DocumentFile,
];
