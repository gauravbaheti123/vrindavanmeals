## Goal
Purana saara transactional data delete karke ~250 students ka fresh mixed realistic demo dataset seed karna.

## Scope
- **Wipe (config safe rakhenge)**: `attendance`, `token_reprints`, `unmapped_scans`, `biometric_mappings`, `payments`, `subscriptions`, `notifications_log`, `import_logs`, `students`.
- **Preserve**: `units`, `subscription_plans`, `meal_windows`, `system_settings`, `role_permissions`, `user_roles`, `profiles` (staff users).

## Seed Plan (~250 students, mixed)

### Students (250 total)
- Realistic Indian names (mix of first/last, ladies hostel context).
- Distributed across existing units.
- Mobile numbers: unique `+91 7XXXXXXXXX` / `9XXXXXXXXX`.
- Mess No: `MESS-001` … `MESS-250`.
- Mix of:
  - **Status**: ~85% approved, ~10% pending, ~5% rejected.
  - **Room numbers**: realistic hostel blocks (A-101 … D-410).
  - **Joining dates**: spread over last 12 months.
  - **Opening balance**: ~30% students with carry-forward (₹500–₹6000), rest 0.

### Subscriptions (~280)
- Approved students ka mix:
  - ~55% **Active** (end_date future).
  - ~15% **Grace** (expired within grace period).
  - ~20% **Expired** (renewal needed).
  - ~10% students with no subscription.
- Price from `subscription_plans` (₹3000).

### Payments (~320)
- Mix of modes: Cash, UPI, Bank Transfer, Card.
- Realistic distribution:
  - ~70% students fully paid (paid == billed).
  - ~15% partially paid (creates dues).
  - ~15% unpaid (only opening balance or unpaid sub → dues).
- Payment dates within last 6 months.

### Attendance (~7000 records, last 30 days)
- Daily lunch + dinner scans for active students (~60–70% daily turnout).
- Sequential token numbers per unit per day.

### Biometric Mappings (~150)
- Random subset of approved students mapped to fake biometric IDs.

## Expected Result
- Dashboard, Dues, Reports sab pe realistic mixed numbers dikhenge (some overdue, some paid, some expiring, some expired).
- Dues page pe ~40–60 students with actual outstanding balance.

## Technical Notes
- Ek migration mein DELETE + INSERT (deterministic seed) — server function ya page-load seed nahi.
- `handle_new_user` trigger untouched.
- Foreign key order: attendance → payments → subscriptions → biometric → students.

Confirm karo to migration bana deta hoon.