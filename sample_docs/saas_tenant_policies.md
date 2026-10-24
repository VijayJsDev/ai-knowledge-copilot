# Multi-Tenant SaaS SLA & Tenant Governance Guide

## 1. Multi-Tenant Architecture & Data Isolation
The SaaS platform enforces strict logical data isolation across all tenant organizations.

### 1.1 Tenant Context Isolation
* Every incoming API request and database query requires a valid JWT containing the `tenant_id` claim.
* Row-Level Security (RLS) is enforced at the database layer; under no circumstances can an operator from Tenant A view data, orders, or customer records belonging to Tenant B.

---

## 2. Subscription Tiers & Service Level Agreements (SLAs)

| Feature / SLA | Growth Tier | Enterprise Tier |
| :--- | :--- | :--- |
| **Max Monthly Orders** | Up to 10,000 orders/month | Unlimited orders |
| **API Rate Limit** | 120 requests / minute | 1,200 requests / minute (burst 2,000) |
| **Webhook Delivery** | 3 retry attempts over 4 hours | 10 retry attempts with exponential backoff over 48 hours |
| **Uptime Guarantee** | 99.5% Monthly Uptime | 99.95% Monthly Uptime with Financial Penalties |
| **Dedicated Support** | Email (24-hour SLA response) | 24/7 Slack Channel + Dedicated Solutions Architect (1-hour response) |
| **Custom Webhook Endpoints** | Max 5 endpoints | Unlimited endpoints with mTLS security |

---

## 3. Webhook Delivery & Retry Policy
When order lifecycle events occur (`order.created`, `order.fulfilled`, `order.cancelled`), the Event Dispatcher notifies tenant webhook endpoints:
1. **Timeout:** Tenant webhook endpoints must respond with HTTP `200 OK` within **5000 milliseconds**.
2. **Backoff Schedule:**
   * Retry 1: +1 minute
   * Retry 2: +5 minutes
   * Retry 3: +30 minutes
   * Retry 4–10 (Enterprise only): +2h, +6h, +12h, +24h
3. **Dead Letter Queue (DLQ):** After final failure, the payload is moved to the tenant's DLQ and retained for 14 days. Tenants can re-trigger failed events from `/settings/webhooks/dlq`.

---

## 4. Maintenance Windows & Incident Communication
* **Scheduled Maintenance:** Routine database updates and platform migrations occur every second Tuesday of the month between **02:00 AM and 04:00 AM UTC**.
* Tenants receive advance email notification at least **7 business days** prior to scheduled maintenance.
