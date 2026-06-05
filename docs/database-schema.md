# BVS Device Management System - Database Schema

## Collection: `users`
```javascript
{
  uid: "string", // Firebase Auth UID
  email: "string",
  name: "string",
  role: "Franchise | Sales Team | Operations Team | BVS Team | Admin",
  franchiseId: "string", // Only for Franchise users
  franchiseCode: "string", // e.g., "AB1"
  franchiseName: "string",
  teamId: "string", // For Sales/Ops team members
  isActive: "boolean",
  permissions: {
    canCreateRequests: "boolean",
    canApproveRequests: "boolean",
    canViewAllRequests: "boolean",
    canManageDevices: "boolean",
    canAccessAnalytics: "boolean"
  },
  profile: {
    phoneNumber: "string",
    cnicNumber: "string",
    address: "string",
    city: "string",
    profilePicture: "string" // Storage URL
  },
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    lastLoginAt: "timestamp",
    createdBy: "string"
  }
}
```

## Collection: `devices`
```javascript
{
  id: "string", // Auto-generated document ID
  imei: "string", // Unique device identifier
  deviceModel: "string",
  deviceSerial: "string",
  status: "Available | Mapped | Faulty | Retired | Under_Maintenance",
  currentLocation: {
    franchiseId: "string",
    bdoId: "string",
    coordinates: {
      latitude: "number",
      longitude: "number"
    },
    address: "string",
    city: "string"
  },
  otpMobileNumber: "string",
  assignmentHistory: [
    {
      bdoId: "string",
      franchiseId: "string",
      assignedAt: "timestamp",
      unassignedAt: "timestamp",
      reason: "string"
    }
  ],
  maintenance: {
    lastServiceDate: "timestamp",
    nextServiceDue: "timestamp",
    warrantyExpiry: "timestamp"
  },
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    lastSyncAt: "timestamp",
    firmwareVersion: "string"
  }
}
```

## Collection: `requests`
```javascript
{
  id: "string", // Auto-generated document ID
  requestNumber: "string", // Human-readable: REQ-2025-001234
  type: "NEW_MAPPING | TRANSFER_OWNERSHIP | OTP_CHANGE | DEVICE_DEMAP",
  status: "DRAFT | SUBMITTED | SALES_REVIEW | SALES_APPROVED | SALES_REJECTED | OPS_REVIEW | OPS_APPROVED | OPS_REJECTED | COMPLETED | ON_HOLD | ARCHIVED",
  priority: "LOW | MEDIUM | HIGH | URGENT",
  
  // Request initiator
  franchise: {
    id: "string",
    code: "string",
    name: "string",
    contactPerson: "string",
    contactNumber: "string"
  },
  
  // Device information
  device: {
    imei: "string",
    currentBdoId: "string", // For transfer/demap requests
    targetBdoId: "string", // For new mapping/transfer requests
    otpMobileNumber: "string",
    newOtpMobileNumber: "string" // For OTP change requests
  },
  
  // BDO/Retailer information
  bdo: {
    id: "string",
    name: "string",
    cnicNumber: "string",
    mobileNumber: "string",
    type: "BDO | Retailer",
    shopDetails: {
      name: "string",
      address: "string",
      city: "string",
      coordinates: {
        latitude: "number",
        longitude: "number"
      }
    }
  },
  
  // Documents and images
  documents: {
    shopImage1: "string", // Storage URL
    shopImage2: "string",
    cnicFront: "string",
    cnicBack: "string",
    businessLicense: "string",
    additionalDocuments: ["string"] // Array of URLs
  },
  
  // Approval workflow
  approvals: {
    sales: {
      approvedBy: "string",
      approvedAt: "timestamp",
      comments: "string",
      isApproved: "boolean"
    },
    operations: {
      approvedBy: "string",
      approvedAt: "timestamp",
      comments: "string",
      isApproved: "boolean",
      externalPortalReference: "string"
    }
  },
  
  // Additional metadata
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    submittedAt: "timestamp",
    completedAt: "timestamp",
    createdBy: "string",
    lastModifiedBy: "string",
    estimatedCompletionDate: "timestamp",
    tags: ["string"] // For categorization
  },
  
  // Communication trail
  comments: [
    {
      id: "string",
      userId: "string",
      userName: "string",
      userRole: "string",
      message: "string",
      timestamp: "timestamp",
      isInternal: "boolean" // Internal team comments vs franchise visible
    }
  ]
}
```

## Collection: `bdoAccounts`
```javascript
{
  id: "string", // Auto-generated document ID
  bdoId: "string", // Human-readable: AB1-00001
  franchiseId: "string",
  franchiseCode: "string",
  personalInfo: {
    name: "string",
    fatherName: "string",
    cnicNumber: "string",
    mobileNumber: "string",
    alternateNumber: "string",
    email: "string",
    dateOfBirth: "timestamp",
    gender: "Male | Female | Other"
  },
  address: {
    street: "string",
    city: "string",
    district: "string",
    province: "string",
    postalCode: "string"
  },
  businessInfo: {
    shopName: "string",
    businessType: "string",
    shopAddress: "string",
    coordinates: {
      latitude: "number",
      longitude: "number"
    },
    establishmentYear: "number",
    monthlyRevenue: "number"
  },
  status: "PENDING_APPROVAL | APPROVED | NEEDS_REVISION | REJECTED | ACTIVE | INACTIVE | SUSPENDED",
  type: "BDO | Retailer",
  documents: {
    cnicFront: "string",
    cnicBack: "string",
    shopImage1: "string",
    shopImage2: "string",
    businessLicense: "string",
    bankStatement: "string"
  },
  bankDetails: {
    accountTitle: "string",
    accountNumber: "string",
    bankName: "string",
    branchCode: "string",
    iban: "string"
  },
  devices: [
    {
      imei: "string",
      assignedAt: "timestamp",
      status: "Active | Inactive"
    }
  ],
  performance: {
    totalTransactions: "number",
    monthlyTransactions: "number",
    lastTransactionDate: "timestamp",
    performanceRating: "number" // 1-5 scale
  },
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    approvedAt: "timestamp",
    createdBy: "string",
    approvedBy: "string"
  }
}
```

## Collection: `actionLogs`
```javascript
{
  id: "string", // Auto-generated document ID
  timestamp: "timestamp",
  
  // Who performed the action
  actor: {
    userId: "string",
    userName: "string",
    userRole: "string",
    userEmail: "string"
  },
  
  // What was the action
  action: {
    type: "CREATE | UPDATE | DELETE | APPROVE | REJECT | SUBMIT | TRANSFER | ASSIGN | UNASSIGN | COMMENT | VIEW",
    description: "string", // Human-readable description
    category: "REQUEST | DEVICE | BDO | USER | SYSTEM"
  },
  
  // What entity was affected
  target: {
    entityType: "request | device | bdo | user",
    entityId: "string",
    entityIdentifier: "string" // Human-readable identifier
  },
  
  // Detailed change information
  changes: {
    before: "object", // Previous state
    after: "object", // New state
    fields: ["string"] // List of changed fields
  },
  
  // Context and metadata
  context: {
    requestId: "string", // If related to a request
    deviceImei: "string", // If related to a device
    bdoId: "string", // If related to a BDO
    ipAddress: "string",
    userAgent: "string",
    sessionId: "string"
  },
  
  // Additional metadata
  metadata: {
    severity: "INFO | WARNING | ERROR | CRITICAL",
    isAuditable: "boolean",
    category: "string",
    tags: ["string"]
  }
}
```

## Collection: `franchises`
```javascript
{
  id: "string", // Franchise ID
  code: "string", // e.g., "AB1"
  name: "string",
  contactInfo: {
    primaryContact: "string",
    phoneNumber: "string",
    email: "string",
    address: "string",
    city: "string"
  },
  status: "ACTIVE | INACTIVE | SUSPENDED",
  territory: {
    districts: ["string"],
    regions: ["string"]
  },
  limits: {
    maxDevices: "number",
    maxBDOs: "number",
    maxMonthlyRequests: "number"
  },
  performance: {
    totalDevices: "number",
    activeDevices: "number",
    totalBDOs: "number",
    activeBDOs: "number",
    monthlyRequests: "number"
  },
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    lastActivityAt: "timestamp"
  }
}
```

## Collection: `deviceInventory`
```javascript
{
  id: "string",
  imei: "string",
  batch: {
    batchNumber: "string",
    manufacturingDate: "timestamp",
    vendor: "string"
  },
  specifications: {
    model: "string",
    firmwareVersion: "string",
    hardwareVersion: "string",
    features: ["string"]
  },
  lifecycle: {
    status: "INVENTORY | DEPLOYED | MAINTENANCE | RETIRED",
    deploymentDate: "timestamp",
    retirementDate: "timestamp",
    warrantyExpiry: "timestamp"
  },
  location: {
    warehouseId: "string",
    shelfLocation: "string",
    currentFranchise: "string",
    currentBDO: "string"
  },
  metadata: {
    createdAt: "timestamp",
    updatedAt: "timestamp",
    lastInventoryCheck: "timestamp"
  }
}
```

## Indexes Required

### Firestore Composite Indexes
```javascript
// For requests collection
- franchiseId + status + createdAt (DESC)
- type + status + createdAt (DESC)
- device.imei + status
- approvals.sales.approvedBy + status
- approvals.operations.approvedBy + status

// For actionLogs collection
- target.entityId + timestamp (DESC)
- actor.userId + timestamp (DESC)
- action.type + timestamp (DESC)
- context.requestId + timestamp (DESC)

// For devices collection
- imei (unique)
- currentLocation.franchiseId + status
- currentLocation.bdoId + status
- otpMobileNumber

// For bdoAccounts collection
- franchiseId + status
- personalInfo.cnicNumber (unique)
- bdoId (unique)
- status + metadata.createdAt (DESC)
```

## Security Rules Framework
```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Requests: Franchise can CRUD own, Sales/Ops can read/update specific fields
    match /requests/{requestId} {
      allow read: if request.auth != null && (
        resource.data.franchise.id == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.franchiseId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Sales Team', 'Operations Team', 'Admin']
      );
      
      allow create: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Franchise';
      
      allow update: if request.auth != null && (
        (resource.data.franchise.id == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.franchiseId && 
         resource.data.status in ['DRAFT', 'NEEDS_REVISION']) ||
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Sales Team', 'Operations Team', 'Admin'])
      );
    }
    
    // Action logs are read-only for auditing
    match /actionLogs/{logId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Operations Team'];
      allow create: if request.auth != null; // System creates these
    }
  }
}
```
