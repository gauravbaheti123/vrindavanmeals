## Goal

Naye clean template ko support karna jismein 3 sheets hain:
- **Student Master** (same as current "Students")
- **Opening Balance as of 30 June 2026** — har student ka carry-forward due (jo July se pehle ka baaki hai)
- **Transactions from July 2026 onwards** — payments (aur optionally subscription renewals)

Aur Excel Workbook tab ka UI text update karna jo abhi sirf legacy format dikhata hai.

## Assumptions (confirm karo agar galat ho)

- Opening Balance sheet columns: `MESS NO`, `STUDENT NAME` (optional), `OPENING BALANCE` (positive = student owes, negative/0 = advance/clear).
- Transactions sheet = payments only (columns same as current "Payments" sheet: `PAYMENT DATE`, `MESS NO`, `AMOUNT`, `PAYMENT MODE`, `REMARKS`).
- Carry-forward = ek pre-July due jise Dues page mein aaj ke total due mein add karna hai; student ledger mein bhi "Opening Balance (as of 30-Jun-2026)" ek line item ke roop mein dikhna chahiye.

## Changes

### 1. Database
- Migration: `students` table pe do naye columns —
  - `opening_balance numeric(10,2) NOT NULL DEFAULT 0`
  - `opening_balance_as_of date` (nullable, e.g. `2026-06-30`)
- Grants already open on `students`; no new policies needed.

### 2. Import parser (`src/routes/_authenticated/import.tsx`)
- Naya detector: agar workbook mein `Student Master` + koi sheet jo `/^Opening Balance/i` match kare + koi sheet jo `/^Transactions/i` match kare → new `parseOpeningBalanceWorkbook()`.
- Parser output extend karo:
  - `openingBalances: Array<{ mess_no, opening_balance, as_of }>`
  - `payments` from Transactions sheet (existing shape reuse).
- Preview panel mein ek extra tile: **Opening Balances (Students)** with total ₹ amount.

### 3. Import server fn (`src/lib/imports.functions.ts`)
- `importExcelWorkbook` input schema extend karo — optional `openingBalances` array.
- Students insert/update ke baad, matching `mess_no` (roll_number) ke against `opening_balance` + `opening_balance_as_of` set karo (update, insert nahi — student already exist karta hai us waqt tak).
- Summary mein `opening_balances: { total, applied }` add.

### 4. Dues & Student Ledger UI
- **`src/routes/_authenticated/dues.tsx`**: `due_amount = (subs × price) − payments + opening_balance`. Table mein ek extra column "Carry-forward" optional, ya tooltip.
- **`src/routes/_authenticated/students.$id.tsx`**:
  - Summary strip: `Total Billed` mein `+ opening_balance` include karo.
  - Payment ledger table ke top pe ek synthetic row: `Opening Balance (as of 30-Jun-2026) — ₹X — Dr` so running balance sahi calculate ho.

### 5. UI text fix
Excel Workbook section mein current line:
> Expected sheets: Master, Receipts, STUDENT LEDGER

Replace with:
> Supported formats — **Clean (recommended)**: Students / Payments / Subscriptions · **With Opening Balance**: Student Master / Opening Balance as of &lt;date&gt; / Transactions from &lt;month&gt; onwards · **Legacy**: Master / Receipts / STUDENT LEDGER

Aur ek chhota `<HelpPopover>` ya inline note likh do format-specific column names ke liye.

## Out of scope
- Opening Balance ko historical payments/subscriptions mein back-fill nahi karenge — sirf ek carry-forward figure store hoga jo dues + ledger mein clearly labelled dikhega.
- Transactions sheet mein subscription renewals parse nahi karenge is turn mein (agar user chahe to next iteration).

## Question before build
Kya `opening_balance` column pe positive = student owes (Dr) treat karu, ya negative = owes (accounting convention)? Default proposal: **positive = owes** (matches "outstanding due" mental model). Confirm karo, phir build karta hoon.
