# BVS Device Lifecycle Management - Project Context & Guidelines

## 🎯 Project Overview

### Mission Statement
Build a **Progressive Web App (PWA)** for managing the complete lifecycle of Biometric Verification System (BVS) devices in Pakistan. The system must be **robust, auditable, and efficient** with **zero data loss** and **complete traceability**.

### Core Objectives
- **Automate complex device-retailer workflows** with atomic operations
- **Provide end-to-end visibility** of device lifecycle (procurement → deployment → transfer → retirement)
- **Ensure every action is logged** with full audit trails
- **Maintain data integrity** through strict validation and conflict resolution
- **Scale efficiently** for nationwide deployment across franchises

---

## 🏗️ Architecture Principles

### Technology Stack
- **Frontend**: React 18 + Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Storage, Cloud Functions)
- **State Management**: React hooks with local state
- **Validation**: Client + Server + Firestore Security Rules (triple validation)
- **File Storage**: Firebase Storage with organized folder structure

### Design Principles
1. **Atomic Operations**: All data modifications must be atomic (succeed completely or fail completely)
2. **Defensive Programming**: Always validate inputs, handle errors gracefully
3. **Audit Trail**: Log every significant action with timestamps, user context
4. **Idempotency**: Operations should be safely repeatable
5. **Performance**: Lazy loading, pagination, efficient queries
6. **Offline Support**: PWA capabilities for limited offline functionality

---

## 📊 Data Model & Business Rules

### Core Entities

#### 1. BDO/Retailer Accounts (`bdoAccounts` collection)
```javascript
{
  id: "auto-generated",
  bdoId: "FRN001-BDO-00001", // Format: {franchiseCode}-{type}-{sequence}
  name: "John Doe",
  handlerType: "BDO" | "Retailer",
  cnic: "12345-1234567-1", // Unique across system
  otpMobileNumber: "923001234567", // Unique across system
  franchiseCode: "FRN001",
  status: "Pending" | "Approved" | "Rejected",
  createdAt: timestamp,
  imageUrls: { front: "url", back: "url" }, // CNIC images
  // Legacy support
  cnicFrontImage: "url",
  cnicBackImage: "url"
}
```

#### 2. Device Requests (`requests` collection)
```javascript
{
  id: "auto-generated",
  requestNumber: "REQ-FRN001-20250103-00001",
  requestType: "NEW_MAPPING" | "TRANSFER" | "OTP_CHANGE" | "DE_MAPPING",
  status: "pending" | "approved" | "rejected" | "completed",
  franchiseCode: "FRN001",
  
  // Common fields for all request types
  submittedBy: "user-id",
  createdAt: timestamp,
  updatedAt: timestamp,
  
  // NEW_MAPPING specific fields
  bdoDetails: {
    id: "bdoAccount-id",
    bdoId: "FRN001-BDO-00001",
    name: "John Doe",
    handlerType: "BDO" | "Retailer"
  },
  deviceDetails: {
    imei: "123456789012345", // Unique across system
    shopName: "ABC Electronics",
    coordinates: { lat: 24.8607, lng: 67.0011 },
    city: "Karachi",
    images: ["shop-image-urls"]
  },
  
  // TRANSFER specific fields
  sourceBDO: {
    id: "source-bdo-id",
    bdoId: "FRN001-BDO-00001",
    name: "Source BDO Name",
    currentDevice: { imei: "123456789012345", shopName: "Current Shop" }
  },
  targetBDO: {
    id: "target-bdo-id", 
    bdoId: "FRN001-BDO-00002",
    name: "Target BDO Name"
  },
  transferReason: "Reason for transfer",
  
  // DE_MAPPING specific fields
  demappingReason: "Reason for de-mapping device",
  
  // OTP_CHANGE specific fields
  currentOTP: "923001234567",
  newOTP: "923009876543",
  changeReason: "Reason for OTP change"
}
```

### 🚨 Critical Business Rules

#### Franchise Operations Overview
The system supports **5 core operations** that franchises can perform:

1. **BDO/Retailer Creation**: Register new BDO or Retailer accounts
2. **New Mapping Request**: Assign a device to an available BDO/Retailer  
3. **Transfer of Ownership** (Device Transfer): Transfer device from one BDO to another
4. **De-Mapping Request**: Release device from current BDO assignment
5. **OTP Change Request**: Change the OTP mobile number for existing BDO

#### Request Type Definitions

| Request Type | Purpose | Prerequisites | Result |
|-------------|---------|---------------|---------|
| `NEW_MAPPING` | Assign device to BDO | BDO must be available (no active device) | Device-BDO mapping created |
| `TRANSFER` | Move device between BDOs (Transfer of Ownership) | Source BDO has device, Target BDO available | Atomic ownership transfer |
| `DE_MAPPING` | Release device from BDO | BDO must have active device mapping | Device becomes available |
| `OTP_CHANGE` | Update BDO mobile number | BDO exists, new number unique | OTP number updated |

#### Device-BDO Mapping Rules
1. **One-to-One Mapping**: Each device (IMEI) can only be mapped to ONE BDO at a time
2. **Unique IMEI**: No duplicate IMEI assignments across the entire system
3. **Active BDO Limitation**: Each BDO can only have ONE active device mapping
4. **Transfer Prerequisites**: Only devices with existing mappings can be transferred
5. **Status Progression**: pending → approved → completed (no status skipping)

#### Data Integrity Rules
1. **CNIC Uniqueness**: Each CNIC can only be registered once across all franchises
2. **Mobile Uniqueness**: Each OTP mobile number can only be used once
3. **BDO ID Format**: Must follow pattern `{franchiseCode}-{BDO|RTL}-{sequence}`
4. **Request Number Format**: Must follow pattern `REQ-{franchiseCode}-{YYYYMMDD}-{sequence}`
5. **Franchise Isolation**: Users can only see/modify data for their franchise

#### Security & Access Rules
1. **Authentication Required**: All operations require valid user authentication
2. **Franchise Scoping**: All queries must include franchiseCode filter
3. **Role-Based Access**: Different permissions for admin vs regular users
4. **Audit Logging**: All modifications must be logged to `actionLogs` collection

---

## 🔄 Workflow Definitions

> **Note**: "Device Transfer" and "Transfer of Ownership" refer to the same workflow - these terms are used interchangeably throughout the system.

### 1. BDO/Retailer Creation Workflow
```
User Input → Validation → Duplicate Check → Image Upload → 
BDO ID Generation → Firestore Save → Audit Log → Success Response
```

**Validation Requirements:**
- Name: 2-50 characters, letters and spaces only
- CNIC: Exactly 13 digits, format XXXXX-XXXXXXX-X, globally unique
- Mobile: Start with 923, exactly 12 digits, globally unique
- Handler Type: Must be either "BDO" or "Retailer"
- Images: Both front and back CNIC images required
- Franchise Code: Must exist and be valid

**Business Rules:**
- Each CNIC can only be registered once across entire system
- Each mobile number can only be used once across entire system, even in OTP Change requests (no duplicate OTP changes allowed)
- BDO ID follows pattern: {franchiseCode}-{BDO|RTL}-{sequence} (e.g., "FRN001-BDO-00001")
- All new accounts start with "Pending" status
- Images stored in Firebase Storage with organized folder structure

---

### 2. New Mapping Request Workflow
```
Request Type Selection → Available BDO Selection → Device Details Entry → 
Shop Location & Images → Review & Submit → Cloud Function Processing → 
Request Number Generation → Status Update → Audit Log
```

**Validation Requirements:**
- **BDO Selection**: Must not have existing active device mapping
- **IMEI**: Exactly 15 digits, globally unique across system
- **Shop Details**: Name, complete address, city selection
- **Coordinates**: Valid lat/lng within Pakistan boundaries
- **Shop Images**: At least one image required
- **Request Type**: Must be "NEW_MAPPING"

**Business Rules:**
- Only BDOs without active device mappings can be selected
- Each IMEI can only be mapped to one BDO at a time
- Request number format: REQ-{franchiseCode}-{YYYYMMDD}-{sequence}
- Initial status: "pending"
- Franchise isolation: Only franchise-specific BDOs shown

**Data Structure:**
```javascript
{
  requestType: "NEW_MAPPING",
  bdoDetails: { id, bdoId, name, handlerType },
  deviceDetails: { imei, shopName, coordinates, city, images },
  status: "pending"
}
```

---

### 3. Transfer of Ownership Workflow (also known as Device Transfer)
```
Source BDO Selection → Target BDO Selection → Transfer Reason → 
Device Verification → Review Transfer Details → Atomic Transfer Processing → 
Source Release → Target Assignment → Audit Log → Notification
```

**Validation Requirements:**
- **Source BDO**: Must have active device mapping
- **Target BDO**: Must not have any active device mapping
- **Transfer Reason**: Required text field explaining transfer purpose
- **Device Verification**: Confirm IMEI and current mapping details
- **New Location Details**: Coordinates, city, and location images for target BDO
- **Request Type**: Must be "TRANSFER"

**Business Rules:**
- Source BDO must be approved and have active device mapping
- Target BDO must be approved and available (no active device mapping)
- Transfer is atomic operation (both release and assign succeed or both fail)
- **Location Reconfirmation**: For each transfer request, system will reconfirm location details
- **BDO Assignment Change**: Transfer only changes the BDO/Retailer assigned to the IMEI
- **New Location Requirements**: If transfer is to a new BDO/Retailer, system will require new location details (coordinates and location images) similar to new mapping request process
- Transfer history maintained in audit logs

**Atomic Transfer Process:**
1. Validate source has active mapping
2. Validate target is available
3. Create transfer request record
4. Update source BDO mapping status to "transferring"
5. Create new mapping for target BDO
6. Complete source mapping with transfer reference
7. Log complete transfer chain

**Data Structure:**
```javascript
{
  requestType: "TRANSFER",
  sourceBDO: { id, bdoId, name, currentDevice },
  targetBDO: { id, bdoId, name },
  transferReason: "string",
  deviceDetails: { 
    imei, 
    shopName,
    // New location details for target BDO
    coordinates: { lat, lng }, 
    city: "string",
    images: ["new-location-image-urls"]
  },
  status: "pending"
}
```

---

### 4. De-Mapping Request Workflow
```
Active BDO Selection → Device Confirmation → De-mapping Reason → 
Impact Warning → Confirmation → Processing → Device Release → 
BDO Status Update → Audit Log → Notification
```

**Validation Requirements:**
- **BDO Selection**: Must have active device mapping
- **De-mapping Reason**: Required text field explaining reason
- **Device Confirmation**: User must confirm IMEI being released
- **Request Type**: Must be "DE_MAPPING"

**Business Rules:**
- Only BDOs with active mappings can be de-mapped
- Device becomes available for new mapping after de-mapping
- BDO becomes available for new device assignment
- De-mapping is irreversible (requires new mapping to re-assign)
- Complete audit trail maintained

**Warning System:**
- Show impact: "Device {IMEI} will be released and available for reassignment"
- Confirm action: "This action cannot be undone"
- Display current mapping details for verification

**Data Structure:**
```javascript
{
  requestType: "DE_MAPPING",
  bdoDetails: { id, bdoId, name },
  deviceDetails: { imei, shopName }, // current mapping
  demappingReason: "string",
  status: "pending"
}
```

---

### 5. OTP Change Request Workflow
```
BDO Selection → Display Current OTP & Device Info → New OTP Entry → 
Global Uniqueness Check → Review Changes → Submit Request → 
Sales Team Review → Ops Team Review → Status Update
```

**Validation Requirements:**
- **BDO Selection**: Must be existing, approved BDO
- **New OTP**: Start with 923, exactly 12 digits, globally unique
- **Request Type**: Must be "OTP_CHANGE"

**Business Rules:**
- **BDO Selection First**: System will ask for BDO/Retailer selection first
- **Current OTP Display**: System will fetch and display the OTP number already attached to that BDO/Retailer and the IMEI currently mapped to the device
- **New OTP Validation**: New OTP number must not exist in system (globally unique)
- **Approval Workflow**: Change requires approval workflow
- **OTP Invalidation**: Old OTP becomes invalid after approval
- **IMEI Association**: Tag latest OTP number with the IMEI

**Security Considerations:**
- Log all OTP change attempts
- Rate limiting on OTP change requests
- After submitting the OTP change request it will go to the Sales team and then Ops team
- Maintain history of previous OTP numbers

**Data Structure:**
```javascript
{
  requestType: "OTP_CHANGE",
  bdoDetails: { id, bdoId, name },
  currentOTP: "923xxxxxxxxx",
  newOTP: "923yyyyyyyyy",
  changeReason: "string",
  deviceInfo: { imei, shopName }, // Current device mapping info
  status: "pending"
}
```

---

## 📋 Workflow Summary & Key Updates

### Updated Business Logic Highlights:

1. **BDO/Retailer Creation**: 
   - CNIC and mobile number must be globally unique across all franchises
   - No duplicate mobile numbers allowed even in OTP change requests

2. **New Mapping Request**: 
   - Standard device-to-BDO mapping with location and shop details
   - IMEI globally unique, BDO must be available

3. **Transfer of Ownership**:
   - **Key Update**: Requires NEW location details for target BDO
   - Must capture coordinates, city, and location images for new assignment
   - Only changes BDO assignment, not device identity
   - Atomic operation with full audit trail

4. **De-Mapping Request**:
   - Releases device from BDO assignment
   - Makes both device and BDO available for new assignments
   - Irreversible operation with confirmation warnings

5. **OTP Change Request**:
   - **Key Update**: Shows current device mapping info during OTP change
   - Two-tier approval: Sales team → Ops team
   - Associates new OTP with existing IMEI mapping
   - Maintains history of previous OTP numbers

### Global Business Rules:
- **Unique Identifiers**: CNIC, mobile numbers, and IMEI must be globally unique
- **One-to-One Mapping**: Each BDO can have max one device, each device can have max one BDO
- **Atomic Operations**: All transfers and mappings are atomic (all succeed or all fail)
- **Audit Trail**: Every operation logged with full context and timestamps

---

## 🔄 Request Status Progression

All request types follow the same status progression:

```
pending → approved → completed
    ↓
rejected (terminal state)
```

**Status Definitions:**
- **pending**: Initial state, awaiting review
- **approved**: Approved by admin, ready for processing
- **completed**: Successfully processed and applied
- **rejected**: Denied with reason, no further action

**Status Transition Rules:**
- Only pending requests can be approved or rejected
- Only approved requests can be completed
- Rejected requests are terminal (cannot be reprocessed)
- Status changes must include timestamp and user ID
- All transitions logged for audit trail

---

## 🎨 UI/UX Guidelines

### Component Structure
```
src/
├── components/
│   ├── EnhancedFranchiseDashboard.js    # Main dashboard with 5 operation tabs
│   ├── CreateBDOForm.js                 # BDO/Retailer creation form
│   ├── RequestWizard.js                 # Multi-step request form for 4 request types
│   │   ├── RequestTypeStep.js           # Step 1: Select request type
│   │   ├── BDOSelectionStep.js          # Step 2: Select BDO(s) based on type
│   │   ├── DeviceDetailsStep.js         # Step 3: Device/change details
│   │   └── ReviewSubmitStep.js          # Step 4: Review and submit
│   ├── EnhancedBDOList.js              # BDO management and viewing
│   ├── EnhancedRequestList.js          # Request management and status tracking
│   └── DeviceTransferForm.js           # Dedicated transfer workflow (same as Transfer of Ownership)
├── utils/
│   ├── actionLogger.js                 # Audit logging for all operations
│   ├── conflictResolver.js             # Data conflict handling
│   ├── notificationSystem.js           # User notifications
│   └── requestWorkflowManager.js       # Request state management
```

### Dashboard Tab Structure
```
┌─────────────────────────────────────────────────────┐
│  Franchise Dashboard                                │
├─────────────────────────────────────────────────────┤
│ [Create BDO] [New Mapping] [Transfer] [De-Map] [OTP] │
│                                                     │
│ Tab Content:                                        │
│ • Create BDO: CreateBDOForm component               │
│ • New Mapping: RequestWizard (type=NEW_MAPPING)     │
│ • Transfer: RequestWizard (type=TRANSFER)           │  
│ • De-Map: RequestWizard (type=DE_MAPPING)           │
│ • OTP Change: RequestWizard (type=OTP_CHANGE)       │
│                                                     │
│ [All Requests] [BDO/Retailer Management]            │
└─────────────────────────────────────────────────────┘
```

### Design Standards
1. **Responsive Design**: Mobile-first, works on all screen sizes
2. **Loading States**: Show spinners/skeletons during async operations
3. **Error Handling**: Clear, actionable error messages
4. **Success Feedback**: Immediate confirmation of successful actions
5. **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### Color Scheme
- **Primary**: Blue (#2563eb) - Actions, links, primary buttons
- **Success**: Green (#059669) - Approved status, success messages
- **Warning**: Yellow (#d97706) - Pending status, warnings
- **Error**: Red (#dc2626) - Errors, rejected status
- **Neutral**: Gray shades for text and backgrounds

---

## ⚙️ Cloud Functions

### Required Functions
1. **generateBDOId**: Atomic BDO ID generation with sequence management
2. **generateRequestNumber**: Atomic request number generation
3. **validateBDOId**: Server-side BDO ID validation
4. **syncSequenceCounters**: Sequence counter synchronization
5. **analyzeBDOData**: Business intelligence and reporting

### Function Standards
- All functions must be idempotent
- Include comprehensive error handling
- Log all operations for audit trail
- Validate all inputs thoroughly
- Return consistent response format

---

## 🛡️ Security Implementation

### Authentication
```javascript
// User object structure
{
  uid: "firebase-auth-uid",
  email: "user@example.com",
  franchiseCode: "FRN001", // Critical for data isolation
  role: "admin" | "operator",
  permissions: ["read", "write", "approve"]
}
```

### Firestore Security Rules Template
```javascript
// Example rule structure
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bdoAccounts/{document} {
      allow read, write: if request.auth != null 
        && resource.data.franchiseCode == request.auth.token.franchiseCode;
    }
  }
}
```

---

## 📝 Coding Standards

### React Components
```javascript
// Component template structure
import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

function ComponentName({ user, db, app, ...props }) {
    // State declarations
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [errors, setErrors] = useState({});

    // Validation function
    const validateInput = (field, value) => {
        // Validation logic
        return errors;
    };

    // Main operation function
    const handleOperation = async () => {
        try {
            setLoading(true);
            // Operation logic with error handling
            // Always include audit logging
            toast.success('Operation completed successfully');
        } catch (error) {
            console.error('Operation failed:', error);
            toast.error('Operation failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        // JSX with proper error states and loading indicators
    );
}

export default ComponentName;
```

### Error Handling Pattern
```javascript
try {
    // Validate inputs
    if (!user?.franchiseCode) {
        throw new Error('Valid franchiseCode is required');
    }

    // Perform operation
    const result = await performOperation();

    // Log success
    await actionLogger.log({
        action: 'OPERATION_NAME',
        userId: user.uid,
        franchiseCode: user.franchiseCode,
        details: result
    });

    return result;
} catch (error) {
    // Log error
    console.error('Operation failed:', error);
    
    // User-friendly error message
    toast.error(`Operation failed: ${error.message}`);
    
    // Re-throw for higher-level handling if needed
    throw error;
}
```

---

## 🧪 Testing Strategy

### Unit Tests
- All validation functions
- Utility functions
- Data transformation logic

### Integration Tests
- Firestore operations
- Cloud Function triggers
- Authentication flows

### E2E Tests
- Complete user workflows
- Cross-device functionality
- Data consistency verification

---

## 📊 Performance Guidelines

### Database Optimization
1. **Compound Indexes**: Create for common query patterns
2. **Pagination**: Use cursor-based pagination for large datasets
3. **Caching**: Cache frequently accessed data
4. **Lazy Loading**: Load data only when needed

### Code Optimization
1. **Bundle Splitting**: Split code by routes/features
2. **Image Optimization**: Compress and resize images
3. **Memoization**: Use React.memo for expensive components
4. **Debouncing**: Debounce user inputs and API calls

---

## 🚀 Deployment Guidelines

### Environment Configuration
- **Development**: Firebase Emulator Suite
- **Staging**: Dedicated Firebase project
- **Production**: Production Firebase project with security rules

### Release Process
1. Code review and testing
2. Database migration scripts (if needed)
3. Deploy Cloud Functions first
4. Deploy frontend application
5. Update security rules
6. Monitor for issues

---

## 📚 Documentation Requirements

### Code Documentation
- JSDoc comments for all functions
- README files for each major component
- API documentation for Cloud Functions

### User Documentation
- User guides for each workflow
- Admin documentation
- Troubleshooting guides

---

## 🔍 Monitoring & Analytics

### Key Metrics
- Request processing time
- Error rates by operation
- User adoption metrics
- Device mapping success rates

### Alerting
- High error rates
- Performance degradation
- Security violations
- Data inconsistencies

---

This document serves as the **definitive guide** for all development work on this project. Any code written should align with these principles, business rules, and technical standards. When in doubt, refer back to this document to ensure consistency and adherence to project objectives.
