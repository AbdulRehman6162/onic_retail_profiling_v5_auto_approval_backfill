# Sales Auto Approval Workflow

## What changed

A Sales Team dashboard toggle was added for Sales auto approval.

Setting document:

```text
systemSettings/salesAutoApproval
```

When `enabled: true`, Cloud Functions automatically approve newly incoming Sales-stage records:

- `requestsV2/{requestId}` with status `pending`, `Submitted`, or `Sales Review`
- `bdoAccounts/{bdoDocId}` with status `Pending Approval`, `Pending`, or legacy `active`

When `enabled: false`, the current manual Sales approval flow remains active.

## Request auto approval result

A qualifying request is updated to:

```text
status: Sales Approved
assignedTo: Operations Team
assignedToOperationsAt: server timestamp
approvals.sales.mode: AUTO
autoApproval.sales.approved: true
```

The Operations Team dashboard already loads records assigned to `Operations Team`, so auto-approved requests move directly to Operations without Sales needing to open or approve the document.

## BDO/Retailer auto approval result

A qualifying BDO/Retailer account is updated to:

```text
status: Approved
approvalMode: AUTO
approvedBy: SYSTEM_SALES_AUTO_APPROVAL
autoApproval.sales.approved: true
```

## Manual mode

The BDO/Retailer creation forms now create records as `Pending Approval` instead of pre-approving them. This ensures that turning auto approval OFF restores the manual Sales review process.

## Read optimization

The auto approval is handled by Firestore document triggers, not by dashboard polling. This keeps incoming records from being repeatedly loaded in the Sales dashboard just to approve them manually. Each trigger performs only a single settings document read before deciding whether to auto approve.

## Deploy order

```bash
firebase deploy --only functions
npm install
npm run build
firebase deploy --only hosting
```

No new composite Firestore index is required for the auto approval toggle.

## Backfill behavior added

The auto-approval toggle now has two parts:

1. New or updated documents are handled by these Firestore triggers:
   - `autoApproveIncomingRequest`
   - `autoApproveResubmittedRequest`
   - `autoApproveIncomingBdoAccount`
   - `autoApproveUpdatedBdoAccount`

2. Existing pending Sales queue records are handled when the toggle is created or switched ON:
   - `backfillSalesAutoApprovalQueueOnSettingCreate`
   - `backfillSalesAutoApprovalQueueOnSettingUpdate`

This means records that were already pending before the toggle was enabled can also be Sales-approved automatically and assigned to Operations. If the setting was already ON before this function was deployed, turn the toggle OFF and then ON once after deployment to trigger the backfill.
