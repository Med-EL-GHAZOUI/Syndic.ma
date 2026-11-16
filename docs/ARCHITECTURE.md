# Architecture & UML (Phase 3 draft)

Diagrams are Mermaid (render on GitHub). They describe the **target** NestJS/PostgreSQL system, derived from the Phase 1 data model.

## Use cases
```mermaid
flowchart LR
  SA([Super Admin]) --> UC1[Manage organizations & plans]
  AD([Syndic Admin]) --> UC2[Manage residences, lots, users]
  AD --> UC3[Issue calls for funds]
  AC([Comptable]) --> UC4[Validate / reverse payments]
  AC --> UC5[Approve & pay expenses]
  MG([Gestionnaire]) --> UC6[Handle complaints & work orders]
  MG --> UC7[Run general assemblies]
  RS([Resident]) --> UC8[View charges & statement]
  RS --> UC9[Declare payment]
  RS --> UC10[Submit complaint]
  PR([Provider]) --> UC11[Update assigned work orders]
```

## ERD
```mermaid
erDiagram
  ORGANIZATION ||--o{ USER : employs
  ORGANIZATION ||--o{ RESIDENCE : manages
  ORGANIZATION ||--o{ PROVIDER : contracts
  RESIDENCE ||--o{ BUILDING : has
  BUILDING ||--o{ UNIT : contains
  UNIT ||--o{ OCCUPANCY : "owner/tenant history"
  USER |o--o{ OCCUPANCY : "linked login"
  RESIDENCE ||--o{ CALL_FOR_FUNDS : issues
  CALL_FOR_FUNDS ||--o{ CHARGE : generates
  UNIT ||--o{ CHARGE : owes
  UNIT ||--o{ PAYMENT : makes
  PAYMENT ||--o{ ALLOCATION : "split into"
  CHARGE ||--o{ ALLOCATION : "settled by"
  RESIDENCE ||--o{ EXPENSE : incurs
  PROVIDER ||--o{ EXPENSE : invoices
  RESIDENCE ||--o{ COMPLAINT : receives
  COMPLAINT ||--o{ WORK_ORDER : triggers
  PROVIDER ||--o{ WORK_ORDER : performs
  RESIDENCE ||--o{ ASSEMBLY : holds
  ASSEMBLY ||--o{ ATTENDANCE : records
  ASSEMBLY ||--o{ RESOLUTION : votes
  RESIDENCE ||--o{ ANNOUNCEMENT : publishes
  RESIDENCE ||--o{ DOCUMENT : archives
  ORGANIZATION ||--o{ AUDIT_LOG : traces
```

## Class diagram (finance core)
```mermaid
classDiagram
  class Charge { id; unitId; callId; amount; dueDate; +paid(); +due(); +status() }
  class Payment { id; unitId; amount; date; method; status; verified; receiptNo }
  class Allocation { chargeId; paymentId; amount }
  class CallForFunds { id; residenceId; basis; totalAmount; status; +distribute(); +issue() }
  CallForFunds "1" --> "*" Charge
  Payment "1" --> "*" Allocation
  Charge "1" <-- "*" Allocation
```

## Sequence — declare then validate a payment
```mermaid
sequenceDiagram
  actor R as Resident
  participant API
  participant DB
  actor A as Accountant
  R->>API: POST /payments (declared)
  API->>DB: insert status=pending (no allocation)
  API-->>A: notification
  A->>API: POST /payments/:id/confirm
  API->>DB: tx: lock unit charges, FIFO allocate, number receipt, status=recorded
  API->>DB: audit_log(confirm)
  API-->>R: notification + receipt
```

## Components
```mermaid
flowchart TB
  Angular[Angular SPA] -->|HTTPS JWT| Gateway[NestJS API]
  subgraph Modular monolith
    Auth; Tenancy; Properties; Finance; Expenses; Tickets; Assemblies; Documents; Audit; Notifications
  end
  Gateway --> Auth & Tenancy & Properties & Finance & Expenses & Tickets & Assemblies & Documents & Audit & Notifications
  Finance & Properties & Tickets --> PG[(PostgreSQL)]
  Documents --> S3[(Object storage)]
  Notifications --> Queue[(Redis / BullMQ)]
```

## Deployment
```mermaid
flowchart LR
  U[Browser] --> CDN --> Web[Static SPA]
  U --> LB[Load balancer / TLS] --> API[NestJS container x N]
  API --> PG[(Managed PostgreSQL + backups)]
  API --> OS[(Object storage)]
  API --> RQ[(Redis)]
```

## Invariants & isolation
- Every tenant-owned table has `org_id`; every query is scoped by it (guard + repository filter + PostgreSQL row-level security as defence in depth).
- Money: `numeric(14,2)`; `charge.paid` derived from `allocation`; unique `(org_id, receipt_no)`; payments immutable once `recorded` (reverse via compensating state + reason).
- Audit log append-only (no UPDATE/DELETE grants).
- Legal items needing professional verification: quorum/majority rules (Law 18-00 as amended by 106-12), personal-data processing and CNDP declaration (Law 09-08).
