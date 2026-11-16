export type Role = 'super_admin' | 'syndic_admin' | 'manager' | 'accountant' | 'owner' | 'tenant' | 'provider';

export interface User {
  id: string;
  orgId: string | null;
  name: string;
  email: string;
  role: Role;
  residenceIds: string[];
  providerId: string | null;
}

/** The refresh token is never in the body: it is an HttpOnly cookie. */
export interface TokenPair {
  accessToken: string;
  expiresIn: number;
}

export interface Residence { id: string; name: string; city: string; address: string; yearBuilt: number | null; monthlyFee: number | null }
export interface Unit { id: string; residenceId: string; buildingId: string; number: string; floor: number; type: string; area: number; tantiemes: number }

export type CallStatus = 'draft' | 'issued' | 'closed';
export interface CallForFunds {
  id: string; residenceId: string; title: string; period: string; dueDate: string;
  basis: 'tantiemes' | 'fixed'; totalAmount: number; amountPerUnit: number; status: CallStatus;
}

export type ChargeStatus = 'paid' | 'partial' | 'overdue' | 'unpaid';
export interface Charge {
  id: string; callId: string; residenceId: string; unitId: string; label: string;
  amount: number; paid: number; due: number; dueDate: string; status: ChargeStatus; overdue: boolean;
}

export type PaymentStatus = 'pending' | 'recorded' | 'reversed' | 'rejected';
export type PaymentMethod = 'transfer' | 'cheque' | 'cash';
export interface Payment {
  id: string; unitId: string; residenceId: string; payerName: string; amount: number; date: string;
  method: PaymentMethod; reference?: string; status: PaymentStatus; verified: boolean; receiptNo: string | null; reason: string | null;
}

export interface StatementLine { kind: 'charge' | 'payment'; date: string; label: string; debit: number; credit: number; ref: string; balance: number }
export interface Statement { unitId: string; balance: number; lines: StatementLine[] }

export interface FinanceSummary { charged: number; collected: number; outstanding: number; overdue: number; expensesPaid: number; collectionRate: number }

export type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'cancelled';
export interface Expense { id: string; residenceId: string; category: string; label: string; amount: number; date: string; invoiceRef?: string; providerId: string | null; status: ExpenseStatus; cancelReason: string | null }
export interface Provider { id: string; name: string; category: string; active: boolean }

export type ComplaintStatus = 'new' | 'in_progress' | 'resolved' | 'closed';
export interface Complaint {
  id: string; residenceId: string; unitId: string | null; authorId: string; title: string; category: string; priority: string;
  description: string; status: ComplaintStatus; comments: { byId: string; byName: string; at: string; text: string }[]; createdAt: string;
}

export interface Announcement { id: string; residenceId: string; title: string; body: string; category: string; audience: string; pinned: boolean; authorName: string; publishedAt: string }
export interface AuditEntry { id: string; userName?: string; role: string | null; action: string; entity: string; summary: string; createdAt: string }
export interface OrgUser { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: string | null }

export type BankLineStatus = 'unmatched' | 'matched' | 'ignored';
export interface BankSuggestion { paymentId: string; receiptNo: string | null; payerName: string; date: string; reference?: string; score: number }
export interface BankLine { id: string; residenceId: string; bookingDate: string; amount: number; label: string; reference: string; status: BankLineStatus; paymentId: string | null; note: string | null; suggestions: BankSuggestion[] }
export interface ReconciliationSummary { unmatchedLines: number; unmatchedAmount: number; unverifiedPayments: number; unverifiedAmount: number; verifiedPayments: number }
export interface Closure { id: string; residenceId: string; closedThrough: string }

export type WorkStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';
export interface WorkOrder { id: string; residenceId: string; title: string; type: 'corrective' | 'preventive'; providerId: string; scheduledDate: string; estimatedCost: number | null; actualCost: number | null; status: WorkStatus; description: string | null }
export interface DocumentItem { id: string; residenceId: string; name: string; category: string; visibility: string; fileName: string; size: number; mime: string; createdAt: string }
export interface ProviderFull { id: string; name: string; category: string; city?: string; contactName?: string; phone?: string; email?: string; ice?: string; rating: number; active: boolean }
