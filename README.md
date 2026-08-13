# Vrindavan Meals

Build a full-stack Canteen Management Portal called "Vrindavan Meals" using Supabase as the backend database.

## Project Overview

Monthly subscription-based canteen system for ~700 students across 2 units (Unit 1, Unit 2). A face-biometric machine (ZKTeco MiniAC Plus via Easy WDMS) pushes real-time attendance data → portal validates subscription → triggers thermal token print at counter.

---

## Tech Stack

- Frontend: React (Lovable)

- Backend/DB: Supabase (Postgres)

- Payment: Razorpay

- Notifications: AiSensy (WhatsApp API) — basic integration only, templates later

- Backup: Google Drive (automated export)

---

## DATABASE SCHEMA (Design First)

### Tables Required:

1. **units** — id, name (Unit 1/Unit 2), created_at

2. **students** — id, full_name (required), mobile (required), roll_number, course, hostel_room, parent_mobile, email, batch_year, blood_group, address, photo_url, doc_type (enum: college_id/aadhar), doc_number, doc_url, unit_id (FK), is_approved (bool), created_at

3. **subscription_plans** — id, name, price (default 3000), meal_combo (lunch+dinner), duration_days (default 30), is_active

4. **subscriptions** — id, student_id (FK), plan_id (FK), start_date, end_date, grace_end_date, status (enum: active/grace/expired/pending), unit_id (FK)

5. **payments** — id, student_id (FK), subscription_id (FK), amount, mode (enum: cash/upi/card/razorpay), razorpay_order_id, razorpay_payment_id, status (enum: success/failed/pending), recorded_by (staff user_id), created_at

6. **attendance** — id, student_id (FK), unit_id (FK), meal_type (enum: lunch/dinner), scan_type (enum: biometric/manual), scan_time, token_number, token_printed (bool), is_override (bool), override_reason, marked_by (FK users), created_at

7. **token_reprints** — id, attendance_id (FK), reprinted_by (FK users), reason, created_at

8. **users** — id, name, email, mobile, role (enum: super_admin/manager/counter_staff/accountant), unit_id (FK — null for super_admin/manager/accountant), is_active

9. **role_permissions** — id, role, module_name, can_access (bool)

10. **meal_windows** — id, unit_id, meal_type (lunch/dinner), start_time, end_time

11. **system_settings** — key, value (for: subscription_price, grace_period_days, expiry_warning_days)

12. **biometric_mappings** — id, device_user_id (machine ka unique ID), device_name (naam jo machine mein daala), student_id (FK → students), unit_id (FK → units), mapped_by (FK → users), mapped_at, is_active (bool)

13. **unmapped_scans** — id, device_user_id, unit_id, scan_time, raw_data (WDMS se jo bhi aaya), resolved (bool)

---

## CORE MODULES TO BUILD

### 1. AUTH & ROLE-BASED ACCESS

- Supabase Auth (email/password or mobile OTP)

- On login → detect user role → redirect to role-specific dashboard

- Super Admin sees all units; Manager/Accountant see all units with unit filter dropdown; Counter Staff sees only their assigned unit

### 2. STUDENT MANAGEMENT

- Student list with search/filter (by name, roll no, unit, subscription status)

- Add student form (only full_name + mobile compulsory, rest optional)

- Admin bulk upload via Excel (.xlsx) — map columns to DB fields

- Student self-registration form → goes to "Pending Approval" queue → Admin approves/rejects

- Student detail page: profile + subscription history + attendance history + payment history + biometric mapping status (Mapped ✅ / Unmapped ⚠️)

### 3. BIOMETRIC DEVICE MAPPING (New Critical Module)

**Purpose:** ZKTeco MiniAC Plus assigns its own internal Device User ID to each enrolled face. This module links each Machine Record → Portal Student so attendance can be correctly attributed.

**Sub-features:**

**3a. Import Machine Records**

- Manual CSV upload (exported from Easy WDMS) containing: device_user_id, device_name, unit_id

- Or direct API pull from WDMS (if WDMS supports HTTP endpoint — optional/future)

- Imported records stored in biometric_mappings (unmapped state initially)

**3b. Mapping Interface (Admin/Manager screen)**

- Table view:

  | Machine Record | Device User ID | Mapped Portal Student | Status |

  |---|---|---|---|

  | Rahul (machine name) | 1023 | 🔍 Search & Select | ⚠️ Unmapped |

  | Priya | 1024 | Priya Sharma | ✅ Mapped |

- Each row: searchable student dropdown → "Link" button → saves mapping

- Bulk mapping option (if machine name exactly matches student name → auto-suggest)

**3c. Sync Status Dashboard Widget**

- Total machine records: X

- Mapped: Y ✅

- Unmapped: Z ⚠️

- Alert banner if any unmapped scans happened today (students trying to attend but not mapped)

**3d. Unmapped Scan Log**

- If machine pushes a scan with device_user_id that has no mapping → log to unmapped_scans table

- Admin sees this log → can go directly to mapping screen to resolve

**3e. Remap/Deactivate**

- If a student re-enrolls on machine (new device_user_id) → old mapping deactivated, new one created

- Mapping history maintained

### 4. SUBSCRIPTION MANAGEMENT

- Assign plan to student → set start_date → auto-calculate end_date (30 days) → grace_end_date (end_date + grace_period_days from settings)

- Subscription status logic:

  - active: current date <= end_date

  - grace: end_date < current date <= grace_end_date

  - expired: current date > grace_end_date

- Admin can edit subscription_price and grace_period_days from Settings panel

### 5. PAYMENT RECORDING

- Payment entry form: select student → mode (Cash/UPI/Card/Razorpay) → amount → save

- Razorpay online: create order → show Razorpay checkout → on success update payment + activate subscription

- Failed Razorpay: log failed attempt, show retry button

- Payment history per student, payment list for accountant

### 6. ATTENDANCE & TOKEN SYSTEM (Critical Flow)

On biometric scan (API endpoint that Easy WDMS will call via webhook/HTTP push):

  1. Receive device_user_id + timestamp + unit_id from machine/WDMS

  2. Lookup biometric_mappings → find student_id

     - If no mapping found → log to unmapped_scans → return error "Device not mapped"

  3. Check current time vs meal_windows → if outside window → reject ("Outside meal time")

  4. Determine meal_type (lunch/dinner) based on current time window

  5. Check subscription status:

     - expired (past grace) → reject ("Subscription Expired")

     - grace period → allow but flag warning ("Subscription expired, renew soon")

     - active → proceed normally

  6. Check duplicate → same student + same meal_type + same date → reject ("Already marked for Lunch today")

  7. All checks pass → create attendance record → generate token_number (sequential per unit per day) → trigger token print

  8. If staff uses manual override on expired subscription → log is_override=true + override_reason → allow + print token

Build API route:

POST /api/attendance/scan

Body: { device_user_id, timestamp, unit_id }

Response: { status, token_data, error_message, warning_message }

### 7. MANUAL ATTENDANCE (Counter Staff)

- Search student by name/roll number

- Check same rules as biometric (window, subscription, duplicate)

- Mandatory reason dropdown: "Machine Down" / "Biometric Not Recognized" / "Other"

- On confirm → attendance record (scan_type: manual) → token print

- All manual entries logged and visible in Manual Entry Report

### 8. TOKEN PRINT

- On successful attendance → generate token data: { student_name, roll_number, date, meal_type, token_number, scan_time }

- Send to thermal printer (ESC/POS commands or browser print API)

- Mark token_printed = true in DB

- If printer fails → show digital token on screen + option to send via WhatsApp

- Reprint screen: list today's unprinted or failed-print tokens → reprint with Admin/Senior staff password → log to token_reprints table

- Duplicate print protection: "Already Printed" error on repeat attempt without authorization

### 9. ADMIN / ROLE MANAGEMENT

- User management: create/edit/deactivate users, assign role + unit

- Permission Checklist screen (Super Admin only):

  - Table: rows = modules (including Biometric Mapping), columns = roles

  - Checkboxes to grant/revoke access per role per module

  - Saved to role_permissions table

  - All UI screens check role_permissions before rendering tabs/buttons

### 10. SETTINGS PANEL (Super Admin only)

- Subscription Price (default: ₹3000)

- Grace Period Days (default: 5)

- Expiry Warning Days for WhatsApp (default: 5)

- Meal Windows: Lunch start/end + Dinner start/end — per unit

  (defaults: Lunch 10:00 AM–2:00 PM, Dinner 6:00 PM–11:30 PM)

### 11. REPORTS & DASHBOARD

**Dashboard (role-aware):**

- Today's total attendance (Lunch/Dinner split)

- Active subscriptions count

- Expiring in next 5 days

- Revenue this month

- Unit-wise filter toggle

- Unmapped device scans alert (if any today)

- Biometric mapping status widget (Mapped vs Unmapped count)

**Reports (PDF + Excel export both available):**

1. Daily Attendance Report — date filter, unit filter

2. Monthly Revenue Report — mode-wise breakdown (Cash/UPI/Card/Razorpay)

3. Expiring Subscriptions List — students expiring in next N days

4. No-show Students Report — subscribed but no attendance in last N days

5. Manual Entry Report — manual attendances with staff name + reason

6. Reprint Token Log — who reprinted, when, which student

7. Unmapped Scan Log — device_user_ids that scanned but had no portal mapping

### 12. NOTIFICATIONS (AiSensy)

- Create AiSensy service file with API integration (basic setup only)

- Trigger points (Supabase Edge Functions or cron):

  - Expiry warning: X days before end_date (X from system_settings)

  - Payment success confirmation

  - Welcome message on enrollment approval

  - Digital token delivery via WhatsApp (if printer is down)

- Message templates: placeholder/dummy for now, to be replaced later

### 13. BACKUP

- Supabase automated backups enabled

- Supabase Edge Function: scheduled weekly export of key tables → upload to Google Drive via Google Drive API

---

## UI/UX REQUIREMENTS

- Clean dashboard layout with sidebar navigation

- Sidebar links shown/hidden based on role_permissions

- Color theme: professional, warm (saffron/orange accent — matching "Vrindavan" brand feel)

- Mobile-responsive (counter staff may use tablet at counter)

- Toast notifications for all success/error actions

- Loading states on all API calls

- Unit selector (dropdown) always visible in header for multi-unit roles

- Biometric mapping status badge visible on student cards (✅ Mapped / ⚠️ Unmapped)

---

## ROLE ACCESS SUMMARY

| Module | Super Admin | Manager | Counter Staff | Accountant |

|---|---|---|---|---|

| Student Management | ✅ Full | ✅ View+Approve | ✅ View only | ✅ View only |

| Biometric Mapping | ✅ Full | ✅ Full | ❌ | ❌ |

| Subscriptions | ✅ Full | ✅ View | ❌ | ✅ View |

| Payments | ✅ Full | ✅ View | ✅ Record | ✅ Full |

| Attendance/Token | ✅ Full | ✅ View | ✅ Full | ❌ |

| Reports | ✅ All | ✅ All | ❌ | ✅ Revenue only |

| Settings | ✅ Full | ❌ | ❌ | ❌ |

| Role Permissions | ✅ Full | ❌ | ❌ | ❌ |

| User Management | ✅ Full | ❌ | ❌ | ❌ |

*(All permissions overridable via Super Admin Permission Checklist screen)*

---

## BUILD ORDER

1. Supabase schema — all 13 tables

2. Auth flow with role detection + unit assignment

3. Student Management module

4. Biometric Device Mapping module

5. Subscription + Payment module

6. Attendance scan API + Token print flow

7. Manual Attendance entry

8. Dashboard + Reports

9. Settings + Permission Checklist

10. AiSensy integration (basic)

11. Google Drive backup (Edge Function)

Build step by step, starting with the complete database schema and authentication.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://vrindavanmeals.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8f736b90-761c-4c24-8136-5d3dd3684280).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
