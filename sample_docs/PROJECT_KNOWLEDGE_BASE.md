# OrderAssist SaaS — Project Knowledge Base

> **Generated**: 2026-10-24
> **Source**: Deep audit of `app/models/`, `config/routes.rb`, `app/services/`, `app/workers/`, `app/assets/javascripts/webpack/`, `Gemfile`

---

## Table of Contents

1. [System Overview & Technology Stack](#1-system-overview--technology-stack)
2. [Multi-Tenancy & Security Architecture](#2-multi-tenancy--security-architecture)
3. [Dynamic Organization-Specific Statuses & Workflows](#3-dynamic-organization-specific-statuses--workflows)
4. [Domain Entities & Database Schema Deep Dive](#4-domain-entities--database-schema-deep-dive)
5. [End-to-End Business Workflows & Services](#5-end-to-end-business-workflows--services)
6. [React 19 UI Screens, Navigation & Component Workflows](#6-react-19-ui-screens-navigation--component-workflows)
7. [Background Workers, Notifications & Integrations](#7-background-workers-notifications--integrations)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)

---

## 1. System Overview & Technology Stack

### 1.1 Platform Purpose

**OrderAssist** is a B2B SaaS order management platform targeted at Indian manufacturing, wholesale, and distribution companies. It manages the full sales lifecycle:

- **Lead → Quote (Proposal/Proforma)** → **Order → Acceptance → Invoice → Payment → Dispatch → Return/RMA → Credit Note**
- Includes **Inventory Management** (stock adjustments, batch/expiry tracking, sales returns)
- Provides a **Task/Workflow CRM layer** (tasks, calls, emails, WhatsApp logs linked to orders/proposals/customers)
- Offers a **Super-Admin SaaS console** for managing organizations, plans, subscriptions, and billing

### 1.2 Backend Stack

| Component | Technology |
|---|---|
| Framework | Ruby on Rails 5.0.2 |
| Database | PostgreSQL |
| App Server | Puma (dev), Unicorn (prod) |
| Background Jobs | **Sidekiq + sidekiq-cron** |
| Auth Framework | **Devise** (Users + SuperAdmins) |
| File Uploads | **Paperclip** (logos, avatars, documents) |
| Audit Trail | **paper_trail** gem |
| PDF Generation | **wicked_pdf** + wkhtmltopdf-binary |
| Excel/Spreadsheet | **caxlsx**, **roo**, **spreadsheet** |
| Payment Gateway | **Razorpay** (subscription payments) |
| Real-time | **ActionCable** (WebSockets via Redis) |
| HTTP Client | **HTTParty** |
| AWS Integration | **aws-sdk ~> 2** |
| Mobile Push | **Expo Push Notifications** (via `PushNotifications::ExpoClient`) |
| WhatsApp | Custom Node.js bridge (`whatsapp-bridge/` directory) |

### 1.3 Frontend Stack

| Component | Technology |
|---|---|
| Framework | **React 19** (`react-dom/client`) |
| Bundler | **Webpack** (custom dev/prod configs) |
| Router | **React Router v7** (`createBrowserRouter`, `RouterProvider`) |
| State Management | **Redux** (`react-redux`, store at `app/assets/javascripts/webpack/redux/`) |
| Testing | **Jest** (unit), **WebdriverIO** (e2e, `wdio.conf.js`) |
| Rich Text | **TipTap editor** (`TipTapEditor.js`) |
| DnD | Custom `__dnd__` module for drag-and-drop reordering |
| Entry Point | `app/assets/javascripts/webpack/main.js` |

### 1.4 Deployment

- **Docker** (`Dockerfile`, `docker-compose.yml`) with a `web` service and `db` (PostgreSQL) service
- **AWS CodeBuild/CodeDeploy** (`buildspec.yml`, `appspec.yml`)
- Sidekiq web UI mounted at `/sidekiq` (Organization Master Admin only)

---

## 2. Multi-Tenancy & Security Architecture

### 2.1 Tenant Isolation Strategy

OrderAssist uses **manual `organization_id` scoping** on every model — no `acts_as_tenant` gem.

1. `ApplicationController` sets `User.current` (Thread-local) from authenticated session
2. All queries scoped via `where(organization_id: current_user.organization_id)`
3. `OrderStatus`, `Product`, `Customer`, etc. all tenant-scoped

### 2.2 Authentication

#### Web (Devise — Session-Based)
- `devise :database_authenticatable, :registerable, :recoverable, :rememberable, :trackable`
- Login via **username OR email** (custom `find_first_by_auth_conditions` in `User`)
- Password policy: min 8 chars, must contain digit, lowercase, uppercase
- SuperAdmins: separate Devise resource at `/super_admins/sign_in`

#### Mobile (Bearer Token)
- `MobileAuthToken` stores SHA-256 digest of raw token
- `User#issue_mobile_auth_token!` generates raw token (digest stored)
- `User.find_by_mobile_bearer_token(raw_token)` authenticates mobile API
- Mobile routes under `/mobile/` namespace

### 2.3 Authorization / Permission System

Custom feature-flag based (not Pundit/CanCanCan):

| Layer | Description |
|---|---|
| Plan Features | `PlanVersion#features` string array (e.g., "Inventory Module", "Price Masking") |
| OrderAssistFeature | Maps feature names to internal IDs |
| Role Permission | `Permission` (entity=Role) stores `feature_ids` array |
| User Permission | `Permission` (entity=User) for per-user overrides |
| Effective Features | Intersection of plan features AND role feature_ids |

**Key checks:**
- `user.can_show_all_orders?` — admin or explicit permission
- `organization.inventory_module_enabled?` — plan has "Inventory Module"
- `organization.enable_batch_expiry?` — plan has "Batch & Expiry"
- `user.check_user_has_show_prices` — price masking feature

**Hierarchy**: Non-admin users see only own + subordinates' data (BFS via `all_subordinate_ids` through `reporting_to` FK).

### 2.4 Subscription States

`OrganizationSubscription#status`: `[:active, :inactive, :authenticated, :expired, :cancelled, :payment_failed, :halted]`

- Expired → `/subscription-expired`
- Blocked → `/account-blocked`
- User limit exceeded → `/user-limit-exceeded`

---

## 3. Dynamic Organization-Specific Statuses & Workflows

> **CRITICAL**: OrderAssist does NOT use global hardcoded statuses. Both Order and Proposal statuses are **configured per organization**. A system `type` enum provides semantic meaning; display name, color, and behavior are fully org-defined.

### 3.1 Order Status System

**Model**: `OrderStatus` | **Table**: `order_statuses`

#### Key Fields:
```
organization_id         FK (tenant scoped)
order_status_name       unique per org (display name)
order_status_bg         hex color for badge
order_status_order_by   sort position in UI
order_status_type       enum (system semantic)
order_editable          boolean — edit lock flag
notify_internally_email boolean
notify_internally_sms   boolean
notify_clients_email    boolean
notify_clients_sms      boolean
notify_roles            integer[] — role IDs notified on transition
```

#### order_status_type Enum:
```ruby
enum order_status_type: [:pending, :placed, :accepted, :inbetween, :cancelled, :closed]
# 0=pending  1=placed  2=accepted  3=inbetween  4=cancelled  5=closed
```

#### System-Level Invariants:
| Type | Semantic | Terminal |
|---|---|---|
| `pending` | No shipping address yet | No |
| `placed` | Shipping address added | No |
| `accepted` | Acceptance exists | No |
| `inbetween` | Org-custom intermediate stage | No |
| `cancelled` | Order cancelled | **YES — not editable** |
| `closed` | Order fulfilled | **YES — not editable** |

#### Automatic Transitions (Order#update_status, before_update):
```
dispatched_qty == total_qty AND pending_amount > 0   → status = "payment_pending"
pending_amount <= 0 AND dispatched_qty == total_qty  → status = "completed"
else                                                  → status = "opened"
ship_address added AND was pending                   → order_status_id = placed_order_status
status == "cancelled"                                → order_status_id = cancelled_order_status
order_status == completed                            → completed_at = Time.now
```

#### Manual Status Transitions:
- `POST /orders/update_order_status` → `Orders::ChangeStatus` service
- DB transaction: close old history → create new history → `update_columns`
- Guard: `Thread.current[:allow_status_change_service]` prevents bypass of service

#### Status History (OrderStatusHistory):
```
order_id, status_id, from_status_id
entered_at, exited_at (nil = currently in this status)
created_by_id, source ("system")
```
`Order#status_age_human` → "Xd Yh Zm" in current status for aging reports.

#### Status Notifications:
- `notify_internally_email` → emails salesperson + notify_roles + org master admin
- Template IDs: 15 (pending→placed), 16 (generic), 17 (cancelled), 18 (closed)

### 3.2 Proposal Status System

**Model**: `ProposalStatus` | **Table**: `proposal_statuses`

#### proposal_status_type Enum:
```ruby
enum proposal_status_type: [:draft, :inbetween, :cancelled, :order_placed]
# 0=draft  1=inbetween  2=cancelled  3=order_placed (terminal — converted to order)
```
Service: `Proposals::StatusTimeline`

### 3.3 Workflow (CRM Task) System

**Model**: `Workflow`

```ruby
enum workflow_type: [:task, :note, :call, :email, :case, :whatsapp]
enum direction: [:inbound, :outbound]
enum priority: [:normal, :high, :low]
enum status: [:open, :closed]
```

Linked polymorphically to orders/proposals/customers via `WorkflowMapping` (entity_type + entity_id). One workflow can be linked to multiple entities simultaneously.

**Task lifecycle (after_commit callbacks):**
- Created → `TaskNotificationService.task_assigned`
- `assigned_to_id` changed → `ReminderScheduler.reschedule` + task_reassigned notification
- `reminder_at` changed → `ReminderScheduler.reschedule`
- `status` → `closed` → `ReminderScheduler.cancel` + task_completed notification
- `status` → `open` → task_reopened notification

**Validations by type:**
- Task: `event_at`, `assigned_to_id`, `workflow_task_type_id`, `reminder_at < event_at`
- Call: `event_at`, `direction`, `contact_person_name`, `contact_person_mobile`
- Email: `event_at`, `direction`, `email_to` (validated email array)

---

## 4. Domain Entities & Database Schema Deep Dive

### 4.1 Organization (Tenant Root)

```
id, org_number (YYnnnn format), name (unique, case-insensitive)
email, mobile_number, phone_number
state_id FK, is_active boolean
gst_number (15-char GSTIN), pan
account_name, bank_name, branch, account_no, ifsc_code, upi_id
logo (Paperclip), qr_code (Paperclip)
tally_api_token (auto-generated unique token for Tally ERP API)
discount (max org discount %), credit_limit, credit_days
allow_over_credit_limit, credit_limit_restrict_by (by_order=0/by_invoice=1)
last_order_number, last_proposal_number, last_proforma_number
proposal_number_format, proforma_number_format
  (e.g., "OA/{year}/{month}/{sequence_no}")
product_display_format, search_display_format
  (tokens: {name} {category} {sku_code} {description} {hsn_code} {measurement_unit} {stock})
stock_alert_enabled, stock_alert_threshold, stock_alert_user_ids[]
restrict_low_stock_products boolean
sales_return_number_mode ("manual"/"auto")
sales_return_number_prefix, sales_return_next_number
```

**Key Methods:**
- `inventory_module_enabled?` → `plan_features.include?("Inventory Module")`
- `enable_batch_expiry?` → `plan_features.include?("Batch & Expiry")`
- `plan_features` → `current_plan_version.features`
- `state_ids` → org address states (for GST CGST+SGST vs IGST routing)
- `execute_product_display_name_update` → triggers `OrganizationProductDisplayNameWorker`

### 4.2 User

```
id, organization_id FK, role_id FK
name, email (unique), user_name (unique, case-insensitive)
contact_number, designation
status (active=0, in_active=1)
maximum_discount (cap on discount % this user can grant)
reporting_to FK → users (org hierarchy)
region_ids[], city_ids[] (array)
theme, workflow_hide_if_no_access, workflow_tour_status
```

**Key Methods:**
- `User.current` / `User.current=` → Thread-local storage
- `User.find_first_by_auth_conditions` → supports login by `username OR email`
- `all_orders` / `all_proposals` → scoped by visibility (admin=all; others=own+subordinates)
- `all_subordinate_ids` → BFS traversal of `direct_reports` tree
- `issue_mobile_auth_token!` → generates mobile bearer token

### 4.3 Order (Central Business Entity)

```
id, organization_id FK, customer_id FK
customer_display_name (denormalized snapshot)
order_number (YYYYMM + 5-digit zero-padded sequence, org-unique)
po_number, reference_date (booking date, not future), date_of_dispatch
status (legacy enum: pending/opened/payment_pending/dispatched/partially_dispatched/completed/cancelled)
order_status_id FK → order_statuses (org-specific dynamic status)
managed_by FK → users, created_by FK → users, cancelled_by FK → users
bill_address_id FK → order_addresses, ship_address_id FK → order_addresses
delivery_type_id FK, reference_category_id FK, proposal_id FK
gst_option (include_gst=0 / exclude_gst=1)
insurance_by (company=0 / client=1)
payment_state (paid=0 / to_pay=1)
total_amount, discount_percent, discount_amount, discounted_total, amount_payable
cgst_percent, cgst_amount, sgst_percent, sgst_amount, igst_percent, igst_amount
received_amount, pending_amount
total_quantity, dispatched_quantity, remaining_quantity, accepted_quantity
item_count, taken_help_with[] (helper user IDs)
reason_for_cancel, remarks, payment_terms, terms_and_conditions
completed_at
```

**Key Associations:**
```ruby
belongs_to :organization, :customer, :order_status, :proposal
belongs_to :user  # managed_by
has_many :line_items  # ordered by :position
has_many :invoices, :acceptances, :payments, :payment_allocations
has_many :workflows, through: :workflow_mappings
has_many :variable_expenses, :order_documents, :order_term_values
has_one :current_status_history  # exited_at: nil
```

**Order Number Generation (pessimistic-lock):**
```ruby
Organization.transaction do
  org = Organization.lock(true).find(organization_id)
  # Increments sequence from last_order_number atomically
  # Format: YYYYMM + 00001 (5-digit zero-padded)
end
```

### 4.4 Proposal

Mirrors Order; additional fields:
```
proposal_number (org-format string with {year}/{month}/{sequence_no})
proforma_number
proposal_date, planned_delivery
proposal_status_id FK → proposal_statuses (org-specific)
order_id FK (set when converted to order)
proposal_template_id FK, proforma_template_id FK
version integer (incremented on key field changes)
```

**Conversion**: `POST /proposals/convert_to_order` → creates Order from proposal, copies items + expenses, sets `proposal.order_id`.

### 4.5 LineItem

```
id, order_id FK, product_id FK
product_display_name (snapshot)
quantity, remaining_quantity (decrements as invoice items dispatched)
unit_price, discount_percent
total_amount (qty * unit_price), discount_amount, discounted_total, amount_payable
cgst_percent, cgst_amount, sgst_percent, sgst_amount, igst_percent, igst_amount
position (sort order), measurement_inputs (jsonb for formula products)
organization_id FK, product_batch_id FK (for batch-tracked inventory)
```

**Key Logic:**
- `update_total_amount` (before_save): calculates all price/tax fields
- GST rate: `ProductGstValue.on_date(order.reference_date)` (date-versioned)
- GST routing: org state_ids vs ship_address.state → CGST+SGST (intra) or IGST (inter)
- `update_remaining_qty` (before_update): adjusts remaining_quantity when quantity changes
- Discount: cannot exceed customer's `flat_discount` or product's `maximum_discount`
- Formula pricing: `calculate_quantity_from_measurements` → derives qty from `measurement_inputs` via `CalculationFormula`

### 4.6 Customer

```
id, organization_id FK
display_name (unique per org, case-insensitive)
status (active=0/in_active=1)
gst_number (15-char), pan_number, mobile_no, email
whatsapp_number, website
flat_discount (customer-specific discount cap)
wallet_balance (virtual wallet)
bill_address_id FK → customer_addresses
ship_address_id FK → customer_addresses
customer_type_id FK, customer_industry_id FK
credit_limit (per-customer override), credit_days
```

### 4.7 Product

```
id, organization_id FK
name, code (SKU), description, hsn_code
category_id FK, measurement_id FK, calculation_formula_id FK
display_name (denormalized, updated by OrganizationProductDisplayNameWorker)
active boolean, discount, maximum_discount
pricing_based_on ("Fixed Quantity" or "Formula")
current_stock, stock_alert_threshold
track_batch_expiry boolean
product_group_id FK (variant groups)
```

**Inventory Tracking:**
- `current_stock` = running balance
- If `track_batch_expiry = true`: stock tracked per `ProductBatch` (batch_no, expiry_date, quantity)
- Opening stock captured via `create_opening_stock_adjustment_if_needed` on create
- Stock deducted on invoice creation via `Inventory::InvoiceStockService`

### 4.8 Invoice

```
id, organization_id FK, order_id FK
invoice_number (unique per org), invoice_date
delivery_challan_number (unique per org), gate_pass_number (unique per org)
amount_payable, discounted_total, cgst/sgst/igst amounts
credit_applied, lr_number (Lorry Receipt)
invoice_template_id FK, delivery_challan_template_id FK, gate_pass_template_id FK
```

- `pending_amount` = `amount_payable - sum(payment_allocations.amount + wallet_amount_used)`
- Cannot delete if sales returns exist
- Qty per line_item validated against `remaining_quantity` on create

### 4.9 Acceptance (Delivery Note)

Auto-created when order has both billing + shipping addresses. Mirrors order line items. Tracks dispatched quantities per line. Reduces `LineItem.remaining_quantity`.

### 4.10 Payment

```
organization_id FK, order_id FK, customer_id FK
received_amount, payment_date, payment_mode
payment_type (invoice_payment=0 / wallet_payment=1)
payment_process_id FK (bulk payment groups)
```

**FIFO Auto-Allocation (after_create):**
1. Specific `invoice_id` provided → allocate to that invoice first
2. Otherwise → FIFO across all order invoices (by invoice_date asc, id asc)
3. Creates `PaymentAllocation` records (amount + wallet_amount_used per invoice)

**Wallet**: `payment_type: :wallet_payment` deducts from `WalletTransaction` ledger.

### 4.11 SalesReturn / RMA

```
SalesReturn: organization_id, invoice_id FK, return_number, return_date, created_by_id
SalesReturnItem: sales_return_id, invoice_item_id FK, return_quantity, condition, description
```

- Max returnable = invoiced qty − already returned qty per item
- Triggers `Inventory::SalesReturnCreateService` → `StockAdjustment` + `StockMovement` (+qty)
- Return number: auto (prefix + 6-digit seq) or manual (org-configured)

### 4.12 Inventory: Stock System

```
StockAdjustment: organization_id, stock_adjustment_reason_id, adjustment_date, description, created_by_id
StockMovement: stock_adjustment_id, product_id, product_batch_id
               stock_before, quantity_changed, stock_after
               source_type ("Invoice"/"SalesReturn"), source_id
               organization_id, created_by_id
StockAdjustmentReason: name, is_system boolean
  System reasons: "Sales Dispatch" (invoicing), "Sales Return" (RMA)
```

### 4.13 Subscription & Plan

```
Plan → PlanVersion (features: string[], e.g., ["Inventory Module", "Batch & Expiry", "Price Masking"])
OrganizationSubscription:
  organization_id, plan_id, plan_version_id
  status: [:active, :inactive, :authenticated, :expired, :cancelled, :payment_failed, :halted]
  subscription_type: [:monthly, :yearly]
  started_at, expired_at, grace_period_end_date (expired_at + 1 day; trial = 0 days)
```

### 4.14 Notable Supporting Models

| Model | Purpose |
|---|---|
| `VariableExpensesMaster` | Org expense templates (freight, packing) with GST rates |
| `VariableExpense` | Per-order expense instance |
| `CalculationFormula` | Formula-based quantity calculation |
| `TermCategory / TermPreset` | Configurable T&C sections with presets |
| `Notification / NotificationRecipient` | In-app + push notification records |
| `Activity / ActivityDetail` | Append-only audit log (field-level changes) |
| `DynamicReport / DynamicReportColumn` | User-configurable saved reports |
| `Category` | Hierarchical product category tree |
| `Region / City` | Geographic data for user/customer assignment |
| `WhatsappConnection` | Per-user WA session (disconnected/qr_pending/connecting/connected) |
| `WalletTransaction` | Customer wallet debit/credit ledger |
| `PaymentAllocation` | Links Payment to Invoice(s) with amounts |
| `CreditNote / CreditNoteItem` | Credit against invoice, applicable to future invoices |
| `InvoiceCreditUsage` | Tracks credit note application to invoices |

---

## 5. End-to-End Business Workflows & Services

### 5.1 Order Creation Pipeline

```
1. POST /orders → OrdersController#create
2. Order.new(nested: line_items_attributes, variable_expenses_attributes)
3. before_create: generate_order_number
   → Organization.lock(true).find(org_id) [pessimistic lock]
   → Increment seq from last_order_number atomically
4. after_create: create_activity, create_gst_option_activity
5. after_save: create_acceptance (if billing + shipping addresses present)
6. after_save: calculate_gst_values
   → Triggers LineItem recalc if addresses or reference_date change
7. LineItem before_save: update_total_amount
   → ProductGstValue.on_date(reference_date) → date-versioned GST rate
   → org.state_ids.include?(ship_address.state_id) → CGST+SGST vs IGST
8. LineItem after_commit: update_order_total, update_total_and_dispatch_quantity
9. Order before_update: update_status (auto-advances legacy status enum)
```

### 5.2 Order Status Change Flow (Service Object)

```
1. POST /orders/update_order_status
2. Orders::ChangeStatus.new(order:, new_status_id:, user:).call
3. In DB transaction:
   a. OrderStatusHistory.where(exited_at: nil).update_all(exited_at: Time.current)
   b. OrderStatusHistory.create!(status_id: new, from_status_id: old, entered_at: now)
   c. Thread.current[:allow_status_change_service] = true
   d. order.update_columns(order_status_id: new_status_id)
   e. ensure: Thread.current[:allow_status_change_service] = nil
4. Order#update_activity → records "Order Status Changed" with old/new values
5. Order#send_notification → emails configured roles if notify_internally_email
```

### 5.3 Invoice Creation & Stock Deduction

```
1. POST /invoices → InvoicesController#create
2. Invoice validates:
   - order not cancelled
   - qty > 0
   - qty per line_item <= remaining_quantity
   - invoice_number + challan/gate_pass numbers unique per org
3. after_create: Inventory::InvoiceStockService.create_for_invoice
   → Finds system "Sales Dispatch" reason
   → For each invoice_item with qty > 0:
     - batch-tracked: ProductBatch.lock → deduct → product.current_stock updated
     - non-batch: Product.lock → deduct from current_stock
     - raises InvalidInvoiceStock if stock goes negative AND restrict_low_stock_products
     - StockMovement.create!(source_type: "Invoice", source_id: invoice.id)
4. Payment.auto_allocate_to_invoices fires on related order payments
5. Order pending_amount recalculated
```

### 5.4 GST Calculation Engine (LineItem#update_total_amount)

```ruby
gst = ProductGstValue.on_date(order.reference_date)  # date-versioned lookup

# Intra-state: CGST + SGST; Inter-state: IGST only
if org.state_ids.include?(ship_address.state_id)
  cgst_amount = discounted_total * gst.cgst_percent / 100
  sgst_amount = discounted_total * gst.sgst_percent / 100
  igst_amount = 0
else
  igst_amount = discounted_total * gst.igst_percent / 100
  cgst_amount = sgst_amount = 0
end
amount_payable = discounted_total + cgst_amount + sgst_amount + igst_amount
```

**Exclude GST mode** (`gst_option: :exclude_gst`): All GST amounts zeroed on all items + variable expenses.

**GST change guards** (before_update on Order):
- Blocked if partial acceptances exist
- Blocked if invoices already raised

### 5.5 Payment & Wallet Flow

```
Payment recorded → PaymentAllocation FIFO:
  1. Target invoice (if invoice_id specified) → allocated first
  2. Remaining → FIFO by invoice_date asc, id asc
  3. PaymentAllocation.create!(payment, invoice, amount, wallet_amount_used)

Wallet: WalletTransaction credits/debits; auto-applied to invoices on invoice create (FIFO)
```

### 5.6 Sales Return / RMA Flow

```
POST /sales_returns → Inventory::SalesReturnCreateService.call
1. Validates: inventory_module_enabled, "Sales Return" reason exists, invoice found
2. return_qty <= (invoiced_qty - prior_returns) per item
3. In transaction:
   - SalesReturn.create! with auto/manual return_number
   - StockAdjustment.create! ("Sales Return" reason)
   - Per item: SalesReturnItem + StockMovement(+qty) + product.current_stock updated
4. CreditNote optionally created for financial reversal
```

### 5.7 Proposal → Order Conversion

```
POST /proposals/convert_to_order:
  → New Order created from proposal (customer, addresses, items, expenses)
  → proposal.order_id = new_order.id
  → Proposal status transitions to order_placed type
```

### 5.8 Credit Limit Enforcement

```
Org config: credit_limit, credit_days, allow_over_credit_limit, credit_limit_restrict_by
Customer override: customer.credit_limit

API:
  GET /customers/:id/get_credit_limit_by_order   → order-based outstanding check
  GET /customers/:id/get_credit_limit_by_invoice  → invoice-based check
  GET /orders/check_credit_limit                  → pre-order creation check
```

---

## 6. React 19 UI Screens, Navigation & Component Workflows

### 6.1 Application Architecture

Three router trees in `main.js`:
1. `/` with `<App />` → Main tenant app (all business screens)
2. `/` with `<SuperAdminApp />` → Super-admin platform management
3. `/oa` with `<OrganizationApp />` → Self-service org signup

**Auth loader pattern**: `authLayoutLoaderCombined` fetches user + permissions before rendering; unauthenticated → redirected to sign-in.

### 6.2 Orders Module

| Route | Component | Capabilities |
|---|---|---|
| `/orders` | `OrdersIndex` | Filterable table (status, customer, date, salesperson); bulk status update + preview; bulk delete; column/view preferences; export |
| `/orders/new` | `NewOrder` | Customer select, line items with product autocomplete, discount, variable expenses, address, GST option |
| `/orders/:id/edit` | `OrderEdit` | Full edit + GST guard validation |
| `/view_order/:id` | `OrderShow` | Status badge, line items, acceptances, invoices, payments, activities, workflow tasks |
| `/order_preview/:id` | `OrderPreview` | Print-ready view |
| `/cancel_order/:id` | `CancelOrder` | Cancel with reason |

### 6.3 Proposals Module

| Route | Component | Capabilities |
|---|---|---|
| `/proposals` | `ProposalsIndex` | Same as orders + convert-to-order action |
| `/proposals/new` | `NewProposal` | Similar to NewOrder + template selection |
| `/proposals/:id/edit` | `ProposalEdit` | Full edit + proforma template |
| `/view_proposal/:id` | `ProposalShow` | PDF download, email/WhatsApp send |
| `/proposal_preview/:id` | `ProposalPreview` | Print-ready view |

### 6.4 Customers Module

| Route | Component | Capabilities |
|---|---|---|
| `/customers` | `CustomerIndex` | Table + bulk delete |
| `/customers/new` | `NewCustomer` | Full form with addresses, contacts |
| `/customers/:id` | `CustomerShow` | Orders, proposals, payments tabs |
| `/customers/:id/dashboard` | `CustomerDashboard` | Analytics: order history, outstanding, aging |
| `/customers/:id/wallet_transactions` | `WalletTransactions` | Wallet ledger |

### 6.5 Inventory Module (Feature-Gated)

| Route | Component | Capabilities |
|---|---|---|
| `/stock_adjustments` | `StockAdjustmentsIndex` | Movement history |
| `/stock_adjustments/new` | `NewStockAdjustment` | Manual adjustment form |
| `/stock_adjustments/:id` | `StockAdjustmentShow` | Adjustment detail |
| `/sales_returns` | `SalesReturnsIndex` | Return list |
| `/sales_returns/new` | `NewSalesReturn` | Invoice → items → return qty |
| `/sales_returns/:id` | `SalesReturnShow` | Return detail |
| `/credit_notes` | `CreditNotesIndex` | Credit note list |
| `/credit_notes/new` | `NewCreditNote` | Credit note form |

### 6.6 Invoices & Payments

| Route | Component | Capabilities |
|---|---|---|
| `/invoices/:id` | `InvoiceShow` | Items, expenses, payments, send email/WhatsApp, download PDF |
| `/acceptances/:id` | `AcceptanceShow` | Delivery note detail |
| `/bulk_payments` | `BulkPaymentIndex` | Bulk payment across multiple orders |
| `/add_wallet_amount` | `AddWalletAmount` | Add to customer wallet |
| `/payment_processes` | `PaymentProcessMaster` | Payment process master config |

### 6.7 Dashboard & Reports

| Route | Component | Capabilities |
|---|---|---|
| `/dashboard` | `NewDashboardUIIndex` | Revenue graphs, status distribution, top products, hall of fame |
| `/task-manager` | `TaskManagementTable` | All tasks, filter by priority/status/type/assignee |
| `/reconciliation_report` | `ReconciliationReport` | Qty accepted vs dispatched vs invoiced vs paid |
| `/dynamic_reports` | `DynamicReports` | Saved report list |
| `/dynamic_reports/new` | `ReportBuilder` | Drag-and-drop SQL report builder |
| `/view_report/:id` | `ReportView` | Dynamic report results |

### 6.8 Settings (OrganizationSetupLayout Nested Routes)

| Route | Component | Purpose |
|---|---|---|
| `/settings` | `GlobalSettings` | Org profile, logo, GST, bank details, addresses |
| `/general_settings` | `GeneralSettings` | Number formats, credit settings, stock alerts |
| `/order_statuses` | `OrderStatusList` | Org-specific status management (add/edit/reorder/notifications) |
| `/proposal_statuses` | `ProposalStatusList` | Org-specific proposal status management |
| `/products` | `NewProductList` | Product catalog with filters |
| `/products/new` | `NewProduct` | New product (GST, batch, formula pricing) |
| `/product_categories` | `ProductCategories` | Category tree management |
| `/product_groups` | `AddProductGroup` | Variant/group product builder |
| `/products/product_display_configurations` | `ProductDisplayConfig` | search_display_format token manager |
| `/delivery_types` | `DeliveryTypeIndex` | Delivery method master |
| `/roles` | `RolesIndex` | Role management with discount limits |
| `/permissions` | `Permission` | Role-based feature permission assignment |
| `/users` | `UsersIndex` | User management |
| `/users/new` | `NewUser` | Create user with role, regions, cities |
| `/departments` | `DeptIndex` | Department master |
| `/email_templates` | `EmailTemplate` | Custom org email template editor |
| `/document_templates` | `DocumentTemplate` | PDF template selector |
| `/custom_document_templates/new` | `CustomDocumentTemplateDesignerRoute` | WYSIWYG PDF template designer |
| `/master_variable_expenses` | `NewExpense` | Freight/packing expense master |
| `/terms_categories` | `TermsConfiguration` | T&C category/preset builder |
| `/formula_masters` | `FormulaIndex` | Calculation formula editor |
| `/whatsapp_connection` | `WhatsappConnectionSettings` | WhatsApp QR session UI |
| `/import` | `ImportData` | Bulk CSV import (products/customers) |
| `/mass_update` | `MassUpdate` | Bulk update order/proposal headers |
| `/activity_logs` | `ActivityLog` | Full audit trail viewer |

### 6.9 Dynamic Status Adaptation in UI

1. Status dropdown: `GET /order_statuses/get_all` → org's `OrderStatus.api_format` (name, color, type, editable)
2. Status badge: `order_status_bg` hex color rendered as inline style
3. Edit lock: `order_status.order_editable == false` → edit buttons hidden/disabled
4. Bulk update preview: `POST /orders/preview_bulk_status_update` before finalizing
5. User preferences: `PUT /save_order_status_preferences`

### 6.10 Super-Admin Screens

| Route | Component |
|---|---|
| `/admin/dashboard/:tab?` | `SuperAdminDashboard` — platform metrics |
| `/admin/organizations` | `OrganizationList` — all tenants |
| `/admin/organizations/:id/dashboard` | `OrganizationDashboard` — org analytics |
| `/admin/organizations/:org_id` | `ManageOrganization` — activate/disable/cancel |
| `/admin/plans` | `PlansList` — subscription plans |
| `/admin/plans/:id/versions` | `VersionsList` — feature versions |
| `/admin/industry_types` | `IndustryTypes` — industry master |
| `/admin/application_version` | `AppVersionHistory` — app release history |
| `/admin/deployment_versions` | `VersionHistory` — deployment changelog |

---

## 7. Background Workers, Notifications & Integrations

### 7.1 Sidekiq Workers

| Worker | Trigger | Purpose |
|---|---|---|
| `PushNotificationDispatchWorker` | After notification create | Expo push to mobile tokens |
| `ReminderWorker` | `ReminderScheduler` | Task reminder notifications |
| `CheckSubscriptionsWorker` | Cron (sidekiq-cron) | Mark expired subscriptions |
| `OrganizationProductDisplayNameWorker` | `search_display_format` change | Bulk re-denormalize product display_name |
| `OrganizationUsageReportWorker` | Cron | Org usage metrics |
| `WorkflowUsageReportWorker` | Cron | Task/workflow usage metrics |
| `AwsMetricsPersisterWorker` | Async | AWS metrics storage |
| `DynamicReportAutomationWorker` | Cron | Automated report generation |

### 7.2 Push Notification System

**Event types**: `task_assigned`, `task_reassigned`, `task_completed`, `task_reopened`, `task_deleted`, `task_reminder`, `task_due_date_changed`, `low_stock_alert`

**Flow:**
```
Event → TaskNotificationService
  → NotificationCreator.create! (Notification + NotificationRecipient records)
  → PushNotificationDispatchWorker.perform_async(notification_id)
    → MobilePushToken.active.where(user_id: recipients)
    → PushNotifications::ExpoClient.send_messages(payloads)
```

### 7.3 Real-time (ActionCable)

- Mounted at `/cable` via Redis
- In-app notification count via WebSocket channel
- `GET /notifications/unread_count` (polling fallback)
- `PATCH /notifications/:id/mark_read`, `DELETE /notifications/clear_all`

### 7.4 WhatsApp Integration

- `WhatsappConnection` session states: `disconnected → qr_pending → connecting → connected`
- Node.js bridge in `whatsapp-bridge/`
- Session key: `org_{org_id}_user_{user_id}_{hex}` (one per user)
- `POST /send_whatsapp_message`, `GET /proposals/fetch_whatsapp_content`, `GET /invoices/fetch_whatsapp_content`
- `allow_staff_share` flag for team sharing

### 7.5 Tally ERP Integration

- `organization.tally_api_token` (auto-generated unique token)
- `GET /api/tally/sales`, `GET /api/tally/v2/sales`, `GET /api/tally/v2/receipts`
- Returns sales/receipt data formatted for Tally import

### 7.6 AI Integration

- `POST /api/ai/order_drafts` → accepts natural language → returns structured order draft
- `Api::Ai::OrderDraftsController#create`

### 7.7 Razorpay (Subscription Billing)

- `POST /subscriptions/add_subscription_to_razorpay` → creates Razorpay subscription
- `POST /subscriptions/rp_response` → Razorpay webhook handler
- Lifecycle: `authenticated → active → halted → cancelled`

### 7.8 Email System

- `ApplicationController.helpers.send_email(template_id, email, variables)`
- Templates in `SmsEmailTemplate` (managed by super-admin)
- `TaskEmailService` for task emails; `DailyEmailService` for digests
- Org-level `EmailTemplate` for custom order/proposal emails

---

## 8. Edge Cases & Error Handling

### 8.1 Concurrency & Locking

| Scenario | Mechanism |
|---|---|
| Order number generation | `Organization.lock(true).find(id)` + DB transaction (pessimistic) |
| Proposal/Proforma number gen | Same pattern |
| Stock deduction (invoice) | `Product.lock.find` / `ProductBatch.lock.find_by` |
| Status transition guard | `Thread.current[:allow_status_change_service]` on model |

### 8.2 GST Change Guards

`before_update` on Order throws `:abort` if:
1. Partial acceptances exist
2. Invoices already raised

### 8.3 Invoice Deletion Guards

- `prevent_destroy_if_sales_returns_exist` → cannot delete if SalesReturns exist
- Stock must be reverted via `InvoiceStockService#revert_for_invoice` before deletion

### 8.4 Negative Stock Prevention

```ruby
# Inventory::InvoiceStockService#apply_product_movement!
if organization.restrict_low_stock_products? && stock_after.negative?
  raise InvalidInvoiceStock, "Insufficient stock for #{product.name}..."
end
```

### 8.5 Quantity Edit Guards

- `LineItem#quantity_cannot_be_less_than_accepted`: qty cannot go below accepted qty
- `LineItem#measurement_inputs_cannot_be_changed_after_processing`
- `Invoice#invoice_item_quantities_per_line_item` (create only): qty <= remaining_quantity

### 8.6 Status Terminal Guards

- `Order#is_editable?` → false for cancelled or closed status types
- `Acceptance#order_is_cancelled`, `Invoice#order_is_cancelled` → block create/update on cancelled orders

### 8.7 Activity Log Integrity

- `Activity` records are **append-only** (never updated)
- `ActivityDetail` captures field_name, old_value, new_value
- `Order`, `LineItem`, `Invoice`, `Acceptance`, `Proposal` all have create/update/remove callbacks
- `ActivityLoggable` concern included in `ApplicationRecord`

### 8.8 PaperTrail Versioning

- `has_paper_trail` on: `Order`, `Proposal`, `Organization`, `Product`
- Ignores `created_at`, `updated_at`
- Used to recover deleted proposal links via `PaperTrail::Version`
- Proposal `version` counter incremented on key field changes

---

## Appendix: Key Service Objects Reference

| Service | File | Purpose |
|---|---|---|
| `Orders::ChangeStatus` | `app/services/orders/change_status.rb` | Transactional status change + history |
| `Orders::DeepDeleteService` | `app/services/orders/deep_delete_service.rb` | Safe order deletion |
| `Orders::StatusTimeline` | `app/services/orders/status_timeline.rb` | Status history with time-in-status |
| `Proposals::DeepDeleteService` | `app/services/proposals/deep_delete_service.rb` | Safe proposal deletion |
| `Proposals::StatusTimeline` | `app/services/proposals/status_timeline.rb` | Proposal status history |
| `Inventory::InvoiceStockService` | `app/services/inventory/invoice_stock_service.rb` | Stock deduction on invoice; revert on delete |
| `Inventory::SalesReturnCreateService` | `app/services/inventory/sales_return_create_service.rb` | Sales return + stock replenishment |
| `Inventory::SalesReturnUpdateService` | `app/services/inventory/sales_return_update_service.rb` | Update return with stock delta |
| `Inventory::SalesReturnRevertService` | `app/services/inventory/sales_return_revert_service.rb` | Reverse a sales return |
| `Inventory::CreditNoteCreateService` | `app/services/inventory/credit_note_create_service.rb` | Create credit note |
| `Inventory::OpeningStockService` | `app/services/inventory/opening_stock_service.rb` | Set initial stock on product create |
| `Inventory::StockAdjustmentCreateService` | `app/services/inventory/stock_adjustment_create_service.rb` | Manual stock adjustment |
| `Inventory::LowStockAlertService` | `app/services/inventory/low_stock_alert_service.rb` | Low stock check + notifications |
| `TaskNotificationService` | `app/services/task_notification_service.rb` | Task notification dispatch |
| `TaskEmailService` | `app/services/task_email_service.rb` | Task email sending |
| `ReminderScheduler` | `app/services/reminder_scheduler.rb` | Schedule/cancel reminder Sidekiq jobs |
| `CustomTemplateDataService` | `app/services/custom_template_data_service.rb` | PDF template variable population |
| `CustomTemplatePreviewService` | `app/services/custom_template_preview_service.rb` | PDF preview generation |
| `FeatureResolver` | `app/services/feature_resolver.rb` | Feature flag resolution |
| `NotificationCreator` | `app/services/notification_creator.rb` | Create Notification + Recipient records |
| `RealtimeNotifier` | `app/services/realtime_notifier.rb` | ActionCable broadcast |

---

*This document was generated by deep code analysis of the OrderAssist-SAAS-2023 repository. Reflects codebase state as of October 2026.*
