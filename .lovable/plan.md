Implement Settings navigation cards and add missing export buttons.

## Changes

### 1. Settings page — add 3 navigation cards
File: `src/routes/_authenticated/settings.tsx`

Add a new card "Portal Modules" (or extend the existing layout) with three clickable rows/buttons:
- **Import Data** → navigates to `/import`
- **Biometric Mapping** → navigates to `/biometric`
- **Users & Roles** → navigates to `/users`

Use `<Link to="/import">`, `<Link to="/biometric">`, `<Link to="/users">` from `@tanstack/react-router` (these routes already exist). Keep the existing Super Admin gate; the Settings page is already restricted to Super Admin.

### 2. Dues page — add PDF + Excel export
File: `src/routes/_authenticated/dues.tsx`

- Add a top-right export button group (same pattern as Reports page: `ExportBar` with PDF / Excel buttons).
- Export the currently filtered/visible list (`filtered` rows).
- Use `exportPdf` / `exportExcel` from `src/lib/report-export.ts`.
- Columns: Mess No, Student, Mobile, Unit, Due, Last Payment, Days Overdue, Status.

### 3. Subscriptions page — add PDF + Excel export
File: `src/routes/_authenticated/subscriptions.index.tsx`

- Add a top-right export button group.
- Export the currently filtered rows (`rows` after search/unit/status filters).
- Use `exportPdf` / `exportExcel` from `src/lib/report-export.ts`.
- Columns: Student, Unit, Plan, Start, End, Grace End, Status.

## Verification
- Confirm the three new Settings cards render only for Super Admin and navigate correctly.
- Confirm Dues and Subscriptions pages show PDF/Excel export buttons top-right.
- Confirm exports contain the currently filtered rows (matching the visible table).
- No database changes needed.