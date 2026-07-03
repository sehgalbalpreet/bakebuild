# Security Specification - BakeSync SaaS

## Data Invariants
1. A user must belong to a `bakeryId` unless they are a `super_admin`.
2. An `Order` must have a `bakeryId` matching the creator's `bakeryId`.
3. `status` transitions must follow: `pending -> received -> in_progress -> ready -> sent`.
4. `trialStartedAt` and `bakeryId` are immutable after creation.
5. `super_admin` can access everything.

## The Dirty Dozen Payloads
1. **Identity Spoofing**: `dealerA` tries to place an order for `bakeryB`.
2. **Role Escalation**: `production` user tries to add a new `dealer`.
3. **State Shortcutting**: `dealer` tries to mark an order as `ready` directly.
4. **Resource Poisoning**: Injection of 1MB string into `order.details.instruction`.
5. **PII Leak**: Non-admin user tries to read all `users` collection.
6. **Trial Bypass**: `bakery_admin` tries to create orders after 90 days without active subscription.
7. **Cross-Tenant Write**: `bakeryA` admin tries to update `bakeryB` settings.
8. **Orphaned Write**: Creating an order with a non-existent `bakeryId`.
9. **Timestamp Spoofing**: `dealer` provides a `createdAt` value from the past.
10. **Admin Claim Spoofing**: User sets `role: 'super_admin'` in their own profile.
11. **Price Manipulation**: `dealer` sets `totalAmount: 0` for a custom cake.
12. **Ghost Field Injection**: Adding `isVerified: true` to a user profile update.

## Test Runner (Logic Overview)
The `firestore.rules` will be tested using individual `allow` blocks for each role and action, ensuring `isValidId` and `isValid[Entity]` are called.

```typescript
// firestore.rules.test.ts logic
// 1. Verify that a user cannot create a profile with role 'super_admin' unless they are already in /admins/
// 2. Verify that orders can only be listed if query filters by bakeryId.
// 3. Verify that sound status updates are restricted to production/bakery_admin.
```
