
## Goal

Reset the portal to a clean state (keep auth users, units, plans, meal windows, settings, role permissions) and then seed rich, realistic demo data so every module has something meaningful to display.

## Step 1 — Wipe operational data

Delete rows from these tables in FK-safe order (using the data tool):

1. `token_reprints`
2. `attendance`
3. `unmapped_scans`
4. `biometric_mappings`
5. `payments`
6. `subscriptions`
7. `notifications_log`
8. `import_logs`
9. `registration_rate_limit`
10. `students`

Preserve:
- `auth.users`, `profiles`, `user_roles` (admin + any staff you created)
- `units`, `subscription_plans`, `meal_windows`, `system_settings`, `role_permissions`

## Step 2 — Seed 200 dummy students + related data

Generate deterministically in a single SQL insert batch:

### Students (200)
- `roll_number`: `MESS-001` … `MESS-200`
- `full_name`: realistic Indian names (mix of ~60 first names × ~40 surnames, both genders)
- `mobile`: unique `+91 9XXXXXXXXX`
- `parent_mobile`: unique `+91 9XXXXXXXXX`
- `email`: `firstname.lastname{n}@example.com` for ~70%
- `course`: cycle through BSc Nursing, BPharm, MBBS, BA, BCom, BBA, BSc IT, MSc
- `hostel_room`: `A-101` … `D-320` (random)
- `unit_id`: alternate between Unit 1 / Unit 2
- `is_approved`: true for 190, false for 10 (to populate Pending Approvals)
- `joining_date`: staggered across the last 8 months
- `exit_date`: null for most; ~10 students exited last month
- `status`: mostly `active`, ~10 `inactive`

### Subscriptions (~220 rows)
- All 190 approved students get one current subscription on the default ₹3000 plan
- ~30 of them also get an older completed subscription (previous month)
- `start_date` / `end_date` computed from plan duration
- `status`: ~160 `active`, ~20 `expiring_soon` (end within grace window), ~10 `expired`, ~10 `grace`
- `payment_status`: matches (paid / pending)

### Payments (~250 rows)
- One `success` payment per active subscription (₹3000)
- Mode mix: 55% `upi`, 30% `cash`, 15% `card`
- Dates spread across the last 6 months for the revenue chart
- ~15 `pending` and ~5 `failed` payments for realism
- Receipt numbers `RCP-000001` upward

### Attendance (~4,000 rows)
- Last 30 days
- ~70% of active students scan lunch, ~55% dinner per day
- Mix of `biometric` (80%), `manual` (15%), `override` (5%)
- Meal window derived from `meal_windows`

### Biometric mappings (~150)
- Map ~150 active students to fake biometric IDs `BIO-1001…`

### Unmapped scans (~8)
- Recent unresolved scans to populate the alert banner

### Token reprints (~5)
- Random recent attendance rows

## Technical approach

Do all deletes and all inserts through the data tool as one or two large SQL scripts using `generate_series` + arrays for names/courses/modes. No schema changes, no new files, no code edits.

## Not included

- No changes to auth users, roles, or UI code
- No changes to plans/units/settings/meal windows
- No new migrations
