# Firebase Free-Tier Optimization Notes

This optimized version focuses on reducing Firestore reads/writes without changing the core request approval, mapping, BDO, device, and sequence workflows.

## Main changes

### 1. Sales dashboard no longer loads everything in real time
- Replaced unbounded `onSnapshot` listeners on `bdoAccounts` and `requestsV2` with one-time `getDocs` calls.
- Default view now loads only the pending sales queue.
- Added smart scopes:
  - Pending queue
  - Last 7 days
  - Completed, loaded only on demand
- Each scope is limited to a small batch instead of reading the full collection.

### 2. Admin dashboard reads are limited
- Replaced full real-time listeners with limited one-time reads.
- Admin loads only the latest 100 requests, BDOs, and mapped/completed records by default.

### 3. Request drafts no longer write to Firestore
- `requestDrafts` writes were moved to browser `localStorage`.
- Final request submission still writes to Firestore normally.
- This removes high-frequency draft writes during every wizard step.

### 4. Audit/action logs reduced
- `ActionLogger` now defaults to `minimal` mode.
- Routine actions such as login/logout/dashboard load/create events are skipped by default.
- Important audit events are still stored: approvals, rejections, status changes, device assignments, device transfers/demaps, security events, and errors.
- External IP lookup was removed from every audit event.

Optional environment variable:

```bash
REACT_APP_AUDIT_LOG_MODE=minimal
```

Supported values:

```bash
minimal
full
off
```

### 5. BDO/Retailer list no longer performs N+1 device reads
- Removed per-BDO device queries during list load.
- The BDO list now loads paginated BDO records only.
- Mapped device details are read only when a user opens a specific BDO detail modal.
- Removed the "Load ALL BDO Accounts" behavior.

### 6. Mapped devices are paginated
- Mapped devices tab loads 25 devices first.
- Additional devices load only when the user clicks Load More.
- CSV export exports the currently loaded devices.

### 7. Dashboard counts use aggregation where possible
- Mapped-device count uses Firestore count aggregation instead of reading every mapped device document.
- Cloud Function dashboard totals use count aggregation and return limited rows to the frontend.

### 8. Mobile usability improvements
- Sales dashboard header, tabs, filters, cards, and detail layout are responsive.
- Franchise dashboard tabs are horizontally scrollable on mobile.
- BDO list uses mobile-friendly cards and bottom-sheet style detail modal.
- Mapped devices use mobile cards instead of forcing a wide table.
- App header is more compact on mobile.

## Important deploy steps

Deploy Firestore indexes first:

```bash
firebase deploy --only firestore:indexes
```

Then deploy functions if you use the dashboard Cloud Function:

```bash
firebase deploy --only functions
```

Then build and deploy the frontend:

```bash
npm install
npm run build
firebase deploy --only hosting
```

## Firestore collections still used

The optimized code keeps these important collections in the workflow:

- `users`
- `bdoAccounts`
- `requestsV2`
- `sequences`
- `devices`

Reduced or optional collections:

- `actionLogs`: reduced by default through minimal audit mode.
- `requestDrafts`: no longer used for wizard autosave.
- `artifacts`: no direct workflow change was made because its usage was not clearly visible in the reviewed critical paths.

## Notes

If Firestore shows a missing-index error after deployment, click the index link in the Firebase console or deploy the included `firestore.indexes.json`.

Full-text search across every historical request/BDO is intentionally not loaded by default. Users should load completed/history scopes only when needed. This is the main tradeoff that keeps reads closer to the free tier.

## Location Change workflow optimization

This version adds the `LOCATION_UPDATE` workflow without adding broad collection reads:

- The device picker loads only a small first page of mapped devices and supports exact IMEI lookup by direct `devices/{imei}` document read.
- Location Change submissions use a transaction-backed daily counter in `deviceLocationChangeDailyUsage` to enforce a maximum of two requests per IMEI per Pakistan business day.
- Operations detail avoids an extra device read for Location Change requests by using the device snapshot stored in the request.
- Completion updates `devices/{imei}` directly and increments `deviceLocationResetCounters/{imei}` for reporting without scanning the devices collection.

