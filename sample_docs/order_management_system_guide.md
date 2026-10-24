# OrderFlow Pro - Order Management System (OMS) Platform Manual

## 1. System Overview & Architecture
OrderFlow Pro is a multi-tenant cloud Order Management System (OMS) designed for omni-channel retail and B2B distribution. The platform synchronizes orders from multiple sales channels (Shopify, Amazon, custom storefronts), allocates inventory across distributed fulfillment centers, and manages the entire post-purchase lifecycle.

---

## 2. Order Lifecycle & Status State Machine

Every order traverses through defined states managed by the core Order Orchestration Engine.

### 2.1 State Definitions
* **`DRAFT`**: Order created manually via the OMS Admin console, awaiting customer confirmation or quote approval.
* **`PAYMENT_PENDING`**: Checkout initiated; awaiting payment gateway webhook (Stripe, Adyen).
* **`PAYMENT_AUTHORIZED`**: Funds reserved on customer's card. Inventory allocation begins immediately.
* **`PROCESSING`**: Inventory has been reserved at one or more fulfillment centers. Warehouse pick-pack lists are generated.
* **`PARTIALLY_FULFILLED`**: Some line items have shipped (split shipment), while remaining items are awaiting stock transfer or separate carrier pickup.
* **`FULFILLED`**: 100% of line items have been dispatched and tracking numbers are generated.
* **`CANCELLED`**: Order terminated before warehouse picking started. Authorized payments are voided.
* **`RETURN_REQUESTED`**: Customer initiated a return via the Self-Service Portal; awaiting RMA inspection.
* **`REFUNDED`**: Full or partial credit memo generated and settlement issued to payment gateway.

### 2.2 Critical Business Rule: Order Cancellation Window
* **Window Duration:** An order can be cancelled automatically by the customer or an Order Clerk **within 30 minutes** of creation if the status is `PAYMENT_AUTHORIZED`.
* **Lockout Rule:** Once an order enters `PROCESSING` status (warehouse has printed shipping labels), the order CANNOT be cancelled through standard UI. The customer must wait for delivery and initiate an RMA return.

---

## 3. Inventory Allocation & Multi-Warehouse Routing

### 3.1 Proximity & Stock Availability Logic
When an order arrives, the Routing Engine evaluates fulfillment locations in the following sequence:
1. **Single-Box Rule:** If a single warehouse holds all line items, it is selected first to minimize shipping costs, regardless of slight distance differences.
2. **Geographic Proximity:** If multiple warehouses have full inventory, the warehouse with the lowest estimated carrier transit time (FedEx/UPS zone) is chosen.
3. **Split Shipment Fallback:** If no single facility has 100% of line items:
   * The system reserves available items at Primary Hub A.
   * Backordered or secondary items are assigned to Secondary Hub B.
   * Customer receives two separate shipment tracking numbers via email.

### 3.2 Safety Stock Buffer
* Each SKU maintains a `Safety Stock` threshold (default: 5 units).
* The OMS stops selling a SKU when inventory reaches the safety threshold to prevent stockout collisions between concurrent online checkouts.

---

## 4. UI Screen Navigation & Operational Workflows

### 4.1 Order Detail Screen (`/orders/:orderId`)
* **Header Bar:** Displays Order ID, Current Status Badge, Order Total, and Customer Name.
* **Action Buttons:**
  * `Cancel Order`: Available only in `PAYMENT_PENDING` and `PAYMENT_AUTHORIZED` states.
  * `Split Order`: Allows manual division of line items into multiple consignments.
  * `Hold Order`: Temporarily pauses warehouse dispatch for fraud checks or address verification.
  * `Force Re-Route`: Overrides automated warehouse assignment to a specific location.

### 4.2 Fulfillment Wizard (`/fulfillments/dispatch`)
* Used by Warehouse Leads to scan barcodes, verify packed items, generate 4x6 thermal shipping labels, and invoke carrier manifest APIs.

### 4.3 RMA & Returns Management Screen (`/returns/rma-list`)
* **Inspection Checklist:** Warehouse operators inspect returned items and mark condition as `A-Stock` (restockable), `B-Stock` (open box discount), or `Damaged` (write-off).
* **Refund Trigger:** Approving inspection automatically emits a webhook to the billing service to refund the customer's original payment method within 3-5 business days.

---

## 5. Roles & Permissions (RBAC)

1. **`Order Clerk`**: Can view orders, update shipping addresses before dispatch, and initiate customer cancellation within the 30-minute window. Cannot view financial reports or issue refunds.
2. **`Warehouse Operator`**: Restricted to `/fulfillments/*` and `/inventory/*` screens. Can print pick lists and generate carrier labels.
3. **`Finance Admin`**: Has exclusive permission to issue refunds exceeding $200, view payment transaction logs, and generate settlement reconciliation exports.
4. **`Super Admin`**: Full system configuration, tenant management, carrier API credentials, and tax rule settings.
