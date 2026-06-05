# Location Change Workflow Notes

## What was added

A new `LOCATION_UPDATE` request type has been added for mapped device latitude/longitude changes.

Flow:

1. Franchise/partner user opens **Create New Request**.
2. User selects **Location Change**.
3. User selects an already mapped device IMEI.
4. The portal shows current device, BDO and location details.
5. User can optionally enter a new latitude and longitude.
   - If both coordinates are provided, Operations completion writes them to the `devices` document.
   - If both fields are left blank, Operations completion sets device `latitude`, `longitude` and `location` to `null`.
6. Request goes to Sales first.
7. Sales approval sends it to Operations.
8. Operations marks it complete after AKSA portal action.
9. Completion updates the existing `devices/{imei}` document.

## Daily IMEI limit

A device IMEI can receive only **two Location Change submissions per Pakistan business day**.

This is enforced with a Firestore transaction against:

- `deviceLocationChangeDailyUsage/{imei}_{YYYY-MM-DD}`

The request is created and the counter is incremented atomically. If the counter is already 2, the request is rejected before creation.

## Reset count reporting

Every completed Location Change request increments counters in two places:

- `devices/{imei}.locationResetCount`
- `deviceLocationResetCounters/{imei}`

The lightweight `deviceLocationResetCounters` collection allows reset reporting without scanning the full `devices` collection.

## Firestore read optimization included

- Device selection no longer loads the full mapped-device collection.
- Only the first 20 mapped devices are loaded for quick selection.
- Exact IMEI lookup uses one direct document read from `devices/{imei}`.
- Operations detail skips extra device reads for `LOCATION_UPDATE`, `DE_MAPPING`, `OTP_CHANGE` and `TRANSFER_OWNERSHIP` because the request already stores the required snapshot.
- Location completion skips reading `devices/{imei}` when `previousLocation` is present in the request snapshot.
- Existing dashboard smart scopes remain active: pending queue by default, recent/completed loaded on demand.

## Firestore collections used

Existing:

- `requestsV2`
- `devices`
- `bdoAccounts`

New:

- `deviceLocationChangeDailyUsage`
- `deviceLocationResetCounters`

## Deployment order

```bash
firebase deploy --only firestore:indexes
firebase deploy --only functions
npm install
npm run build
firebase deploy --only hosting
```

