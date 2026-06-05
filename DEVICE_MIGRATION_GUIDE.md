# 📱 Device Data Migration Guide

## Overview
This guide will help you migrate your existing device mapping data from Excel to the Firestore `devices` collection, establishing it as the single source of truth for all device mappings.

## 🎯 Migration Goals
- ✅ Import all existing device mappings into the `devices` collection
- ✅ Create proper audit trail with "INITIAL_MAPPING" entries
- ✅ Establish data integrity and validation
- ✅ Enable future OTP changes, transfers, and other operations
- ✅ Maintain full history and traceability

## 📋 Pre-Migration Checklist

### 1. Data Preparation
- [ ] Export your current device data to Excel (.xlsx format)
- [ ] Ensure all required columns are present
- [ ] Clean and validate your data
- [ ] Remove duplicates and invalid entries

### 2. Required Excel Columns

**REQUIRED COLUMNS** (Must be present):
```
imei                - 15-digit device identifier
franchiseCode       - Franchise identifier (e.g., "FR001")
franchiseName       - Full franchise name
bdoId              - BDO/Retailer identifier
bdoName            - Full name of BDO/Retailer
bdoCnic            - 13-digit CNIC number
otpMobileNumber    - Mobile number for OTP
shopName           - Shop/business name
streetAddress      - Complete address
city               - City name
```

**OPTIONAL COLUMNS** (Recommended):
```
premiseRelationship - Relationship to premise (Owner/Tenant/etc.)
latitude           - GPS latitude (decimal format)
longitude          - GPS longitude (decimal format)
cnicFrontUrl       - URL to CNIC front image
cnicBackUrl        - URL to CNIC back image
shopInsideImageUrl - URL to shop inside image
shopOutsideImageUrl- URL to shop outside image
migrationNotes     - Any special notes for migration
```

### 3. Data Validation Rules

**IMEI Format**: Exactly 15 digits
```
✅ 123456789012345
❌ 12345 (too short)
❌ ABCD123456789012 (contains letters)
```

**CNIC Format**: Exactly 13 digits (dashes optional)
```
✅ 1234567890123
✅ 12345-6789012-3
❌ 12345 (too short)
```

**Coordinates**: Valid decimal degrees
```
✅ Latitude: 24.8607 (between -90 to 90)
✅ Longitude: 67.0011 (between -180 to 180)
❌ Latitude: 124.8607 (out of range)
```

## 🚀 Migration Process

### Step 1: Access Migration Panel
1. Login as Admin user
2. Navigate to Admin Dashboard
3. Click "📱 Device Migration" button
4. Download the Excel template if needed

### Step 2: Upload and Validate
1. Click "Upload Excel File" and select your data file
2. Review validation results:
   - **Errors**: Must be fixed before migration
   - **Warnings**: Recommended to fix but not blocking
3. Fix any validation issues in your Excel file

### Step 3: Start Migration
1. Click "Start Migration" button
2. Confirm the migration (this will create records)
3. Monitor progress in real-time
4. Review final results

### Step 4: Verify Migration
1. Check migration statistics
2. Review any failed records
3. Verify random samples in the devices collection

## 📊 What Gets Created

For each device, the migration creates:

```javascript
{
  // Device Identity
  imei: "123456789012345",
  
  // Franchise Information
  franchiseCode: "FR001",
  franchiseName: "Sample Franchise",
  
  // BDO Information
  bdoId: "BDO001",
  bdoName: "John Doe",
  bdoCnic: "1234567890123",
  otpMobileNumber: "03001234567",
  
  // Location Information
  shopName: "Sample Shop",
  streetAddress: "123 Main Street",
  city: "Karachi",
  premiseRelationship: "Owner",
  latitude: 24.8607,
  longitude: 67.0011,
  location: {
    type: "Point",
    coordinates: [67.0011, 24.8607]
  },
  
  // Status and Metadata
  status: "Mapped",
  createdAt: Timestamp.now(),
  lastUpdatedAt: Timestamp.now(),
  
  // Migration Metadata
  migratedAt: Timestamp.now(),
  migrationId: "migration_1234567890",
  migrationSource: "excel_import",
  migrationBy: "admin_user_id",
  migrationNotes: "Migrated from legacy data",
  
  // Audit Trail
  auditTrail: [{
    action: "INITIAL_MAPPING",
    timestamp: Timestamp.now(),
    requestId: "migration_1234567890",
    previousState: null,
    newState: { /* complete device state */ },
    performedBy: "admin_user_id",
    description: "Device initially mapped during data migration from Excel"
  }]
}
```

## 🔒 Data Integrity & Safety

### Duplicate Prevention
- The system checks for existing devices by IMEI
- Existing devices are **skipped** (not overwritten)
- You'll see a count of skipped devices in the results

### Rollback Strategy
If you need to rollback the migration:

1. **Identify Migration ID**: Each migration has a unique ID
2. **Query Migrated Devices**:
   ```javascript
   // Find all devices from a specific migration
   where('migrationId', '==', 'migration_1234567890')
   ```
3. **Batch Delete**: Use Firestore batch operations to remove migrated devices

### Backup Recommendations
- Export existing devices collection before migration
- Keep your original Excel file as backup
- Consider running a test migration with a small dataset first

## 📈 Post-Migration Benefits

Once migrated, your system will support:

### ✅ OTP Changes
- Track previous and new OTP numbers
- Complete audit trail of changes
- Validation and verification workflows

### ✅ Transfer of Ownership
- Full BDO transfer history
- Location change tracking
- Document update trails

### ✅ Device De-mapping
- Preserve history even when de-mapped
- Reason tracking and audit

### ✅ Advanced Reporting
- Franchise-wise device counts
- City-wise distribution
- Transfer and change analytics
- Historical data analysis

## 🐛 Troubleshooting

### Common Issues

**"Missing required columns" Error**
- Ensure your Excel has all required column headers
- Column names are case-sensitive
- Download the template to see exact format

**"Invalid IMEI format" Warning**
- IMEIs must be exactly 15 digits
- Remove any spaces or special characters
- Each IMEI must be unique

**"Duplicate IMEIs found" Error**
- Check for duplicate rows in your Excel
- Remove or fix duplicate entries
- Each device can only be migrated once

**Migration Fails Partway**
- Check the error messages in the progress panel
- Common causes: network issues, permission problems
- Failed devices can be re-attempted individually

### Performance Considerations

**Large Datasets (>1000 devices)**
- Migration processes 10 devices at a time
- Expect ~5-10 seconds per 100 devices
- Monitor Firestore quotas and limits

**Network Stability**
- Ensure stable internet connection
- Don't close browser during migration
- Progress is saved incrementally

## 📞 Support

If you encounter issues:

1. **Check Browser Console**: Look for error messages
2. **Review Validation Results**: Fix data quality issues first
3. **Test Small Batches**: Try migrating 10-50 devices first
4. **Document Issues**: Note specific error messages and row numbers

## 🎉 Success Metrics

A successful migration should show:
- ✅ All devices imported with status "Mapped"
- ✅ Each device has an audit trail entry
- ✅ No validation errors or warnings
- ✅ Zero failed migrations
- ✅ Device counts match your Excel data

---

**Remember**: This migration establishes the devices collection as your single source of truth. All future operations (OTP changes, transfers, etc.) will build upon this foundation!
