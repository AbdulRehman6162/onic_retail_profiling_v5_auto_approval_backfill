# Testing Strategy for BVS Device Management System

## Overview
Comprehensive testing strategy covering unit tests, integration tests, and end-to-end workflows for the enhanced BVS device management system.

## Testing Framework Setup

### Install Testing Dependencies
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev firebase-admin firebase-functions-test
npm install --save-dev cypress @cypress/react
```

## Unit Tests

### 1. Action Logger Tests
```javascript
// src/utils/__tests__/actionLogger.test.js
import { ActionLogger } from '../actionLogger';
import { addDoc } from 'firebase/firestore';

jest.mock('firebase/firestore');

describe('ActionLogger', () => {
    const mockDb = {};
    const mockUser = {
        uid: 'test-user-id',
        name: 'Test User',
        role: 'Franchise',
        email: 'test@example.com'
    };

    let actionLogger;

    beforeEach(() => {
        actionLogger = new ActionLogger(mockDb, mockUser);
        jest.clearAllMocks();
    });

    test('should log request creation', async () => {
        const requestData = {
            id: 'req-123',
            requestNumber: 'MAP-2025-000001',
            type: 'NEW_MAPPING'
        };

        await actionLogger.logRequestCreated(requestData);

        expect(addDoc).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                action: expect.objectContaining({
                    type: 'CREATE',
                    category: 'REQUEST'
                }),
                target: expect.objectContaining({
                    entityType: 'request',
                    entityId: 'req-123'
                })
            })
        );
    });

    test('should log status changes with correct priority', async () => {
        await actionLogger.logRequestStatusChange(
            'req-123',
            'REQ-001',
            'DRAFT',
            'SALES_REJECTED',
            'Invalid documents'
        );

        expect(addDoc).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                metadata: expect.objectContaining({
                    severity: 'WARNING'
                })
            })
        );
    });
});
```

### 2. Conflict Resolver Tests
```javascript
// src/utils/__tests__/conflictResolver.test.js
import ConflictResolver from '../conflictResolver';
import { runTransaction, getDocs } from 'firebase/firestore';

jest.mock('firebase/firestore');

describe('ConflictResolver', () => {
    const mockDb = {};
    const mockActionLogger = {
        logAction: jest.fn()
    };

    let conflictResolver;

    beforeEach(() => {
        conflictResolver = new ConflictResolver(mockDb, mockActionLogger);
        jest.clearAllMocks();
    });

    test('should prevent IMEI conflicts', async () => {
        // Mock pending request exists
        getDocs.mockResolvedValueOnce({
            empty: false,
            docs: [{
                data: () => ({
                    requestNumber: 'MAP-2025-000001',
                    franchise: { name: 'Test Franchise' }
                })
            }]
        });

        const requestData = {
            type: 'NEW_MAPPING',
            franchise: { id: 'franchise-1' },
            device: { imei: '123456789012345' }
        };

        await expect(
            conflictResolver.claimIMEIForRequest('123456789012345', requestData)
        ).rejects.toThrow('already has a pending request');
    });

    test('should validate BDO creation conflicts', async () => {
        // Mock CNIC already exists
        getDocs.mockResolvedValueOnce({
            empty: false
        });

        const bdoData = {
            personalInfo: {
                cnicNumber: '12345-6789012-3',
                mobileNumber: '923001234567'
            },
            franchiseId: 'franchise-1'
        };

        await expect(
            conflictResolver.validateBDOCreation(bdoData)
        ).rejects.toThrow('CNIC 12345-6789012-3 is already registered');
    });
});
```

### 3. Workflow Manager Tests
```javascript
// src/utils/__tests__/requestWorkflowManager.test.js
import RequestWorkflowManager from '../requestWorkflowManager';
import { runTransaction } from 'firebase/firestore';

jest.mock('firebase/firestore');

describe('RequestWorkflowManager', () => {
    const mockDb = {};
    const mockUser = { uid: 'user-1', role: 'Sales Team' };
    const mockActionLogger = { logRequestStatusChange: jest.fn(), logError: jest.fn() };
    const mockNotificationSystem = { broadcastToRole: jest.fn(), notifyUser: jest.fn() };

    let workflowManager;

    beforeEach(() => {
        workflowManager = new RequestWorkflowManager(
            mockDb,
            mockUser,
            mockActionLogger,
            mockNotificationSystem
        );
        jest.clearAllMocks();
    });

    test('should submit request and notify sales team', async () => {
        const mockTransaction = {
            get: jest.fn().mockResolvedValue({
                exists: () => true,
                data: () => ({
                    status: 'DRAFT',
                    requestNumber: 'MAP-2025-000001',
                    franchise: { name: 'Test Franchise' }
                })
            }),
            update: jest.fn()
        };

        runTransaction.mockImplementation((db, callback) => {
            return callback(mockTransaction);
        });

        await workflowManager.submitRequest('req-123');

        expect(mockActionLogger.logRequestStatusChange).toHaveBeenCalledWith(
            'req-123',
            'MAP-2025-000001',
            'DRAFT',
            'SALES_REVIEW',
            'Request submitted for sales review'
        );

        expect(mockNotificationSystem.broadcastToRole).toHaveBeenCalledWith(
            'Sales Team',
            expect.objectContaining({
                type: 'APPROVAL_REQUIRED'
            })
        );
    });

    test('should handle sales approval workflow', async () => {
        const mockTransaction = {
            get: jest.fn().mockResolvedValue({
                exists: () => true,
                data: () => ({
                    status: 'SALES_REVIEW',
                    requestNumber: 'MAP-2025-000001',
                    franchise: { contactUserId: 'franchise-user-1' }
                })
            }),
            update: jest.fn()
        };

        runTransaction.mockImplementation((db, callback) => {
            return callback(mockTransaction);
        });

        await workflowManager.processSalesReview('req-123', true, 'Approved for processing');

        expect(mockActionLogger.logRequestApproval).toHaveBeenCalledWith(
            'req-123',
            'MAP-2025-000001',
            'sales',
            true,
            'Approved for processing'
        );
    });
});
```

## Integration Tests

### 1. Complete Request Workflow Test
```javascript
// src/__tests__/integration/requestWorkflow.integration.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupFirestore, cleanup } from './testUtils';
import App from '../../App';

describe('Request Workflow Integration', () => {
    let db, testUser;

    beforeEach(async () => {
        ({ db, testUser } = await setupFirestore());
    });

    afterEach(async () => {
        await cleanup();
    });

    test('complete new mapping workflow', async () => {
        // 1. Franchise creates request
        render(<App testUser={testUser} testDb={db} />);
        
        fireEvent.click(screen.getByText('New Device Mapping'));
        
        // Fill form
        fireEvent.change(screen.getByLabelText('IMEI'), {
            target: { value: '123456789012345' }
        });
        fireEvent.change(screen.getByLabelText('BDO Name'), {
            target: { value: 'John Doe' }
        });
        // ... fill other fields
        
        fireEvent.click(screen.getByText('Submit Request'));
        
        await waitFor(() => {
            expect(screen.getByText('Request submitted for review')).toBeInTheDocument();
        });

        // 2. Sales team approves
        // Switch to sales user and approve request
        // ... test sales approval

        // 3. Operations team processes
        // Switch to ops user and complete processing
        // ... test operations approval and completion
    });
});
```

### 2. Conflict Resolution Integration Test
```javascript
// src/__tests__/integration/conflictResolution.integration.test.js
describe('Conflict Resolution Integration', () => {
    test('should prevent concurrent IMEI claims', async () => {
        const { db } = await setupFirestore();
        
        // Create two franchise users
        const franchise1 = createTestUser('franchise1', 'Franchise');
        const franchise2 = createTestUser('franchise2', 'Franchise');
        
        // Both try to claim same IMEI simultaneously
        const conflict1 = conflictResolver1.claimIMEIForRequest('123456789012345', requestData1);
        const conflict2 = conflictResolver2.claimIMEIForRequest('123456789012345', requestData2);
        
        const results = await Promise.allSettled([conflict1, conflict2]);
        
        // One should succeed, one should fail
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    });
});
```

## End-to-End Tests with Cypress

### 1. Complete User Journey
```javascript
// cypress/integration/complete-workflow.spec.js
describe('Complete BVS Workflow', () => {
    beforeEach(() => {
        cy.login('franchise@test.com', 'password');
    });

    it('should complete full device mapping workflow', () => {
        // Create request
        cy.visit('/dashboard');
        cy.contains('New Device Mapping').click();
        
        cy.get('[data-testid="imei-input"]').type('123456789012345');
        cy.get('[data-testid="bdo-name"]').type('John Doe');
        cy.get('[data-testid="cnic-input"]').type('12345-6789012-3');
        cy.get('[data-testid="mobile-input"]').type('923001234567');
        
        // Upload documents
        cy.get('[data-testid="shop-image-1"]').attachFile('shop1.jpg');
        cy.get('[data-testid="cnic-front"]').attachFile('cnic-front.jpg');
        
        cy.contains('Submit Request').click();
        cy.contains('Request submitted for review').should('be.visible');
        
        // Switch to sales team user
        cy.logout();
        cy.login('sales@test.com', 'password');
        
        cy.visit('/dashboard');
        cy.contains('MAP-2025-000001').click();
        cy.contains('Approve').click();
        cy.get('[data-testid="approval-comments"]').type('All documents verified');
        cy.contains('Confirm Approval').click();
        
        // Switch to operations team user
        cy.logout();
        cy.login('operations@test.com', 'password');
        
        cy.visit('/dashboard');
        cy.contains('MAP-2025-000001').click();
        cy.contains('Process').click();
        cy.get('[data-testid="external-ref"]').type('EXT-REF-12345');
        cy.contains('Complete Processing').click();
        
        // Verify completion
        cy.contains('Request completed successfully').should('be.visible');
    });

    it('should handle IMEI conflicts', () => {
        // First user creates request
        cy.createRequest('123456789012345', 'First BDO');
        
        // Second user tries same IMEI
        cy.logout();
        cy.login('franchise2@test.com', 'password');
        
        cy.visit('/dashboard');
        cy.contains('New Device Mapping').click();
        cy.get('[data-testid="imei-input"]').type('123456789012345');
        // ... fill other fields
        
        cy.contains('Submit Request').click();
        cy.contains('IMEI already has a pending request').should('be.visible');
    });
});
```

### 2. Performance Tests
```javascript
// cypress/integration/performance.spec.js
describe('Performance Tests', () => {
    it('should load dashboard within acceptable time', () => {
        cy.login('franchise@test.com', 'password');
        
        const start = Date.now();
        cy.visit('/dashboard');
        cy.get('[data-testid="dashboard-loaded"]').should('be.visible');
        
        cy.then(() => {
            const loadTime = Date.now() - start;
            expect(loadTime).to.be.lessThan(3000); // 3 seconds max
        });
    });

    it('should handle large request lists efficiently', () => {
        // Create 100 test requests
        cy.task('createTestRequests', 100);
        
        cy.login('franchise@test.com', 'password');
        cy.visit('/dashboard');
        
        // Should load with pagination
        cy.get('[data-testid="request-list"]').should('be.visible');
        cy.get('[data-testid="pagination"]').should('be.visible');
        
        // Test virtual scrolling performance
        cy.get('[data-testid="request-item"]').should('have.length.lessThan', 21); // Should virtualize
    });
});
```

## Automated Testing Pipeline

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      firebase-emulator:
        image: firebase/firebase-tools
        ports:
          - 9099:9099
          - 8080:8080
        options: >-
          --entrypoint firebase
          emulators:start
          --only firestore,auth
          --project demo-test
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
      env:
        FIRESTORE_EMULATOR_HOST: localhost:8080
        FIREBASE_AUTH_EMULATOR_HOST: localhost:9099
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        FIRESTORE_EMULATOR_HOST: localhost:8080
        FIREBASE_AUTH_EMULATOR_HOST: localhost:9099
    
    - name: Run E2E tests
      run: npm run test:e2e
      env:
        CYPRESS_BASE_URL: http://localhost:3000
    
    - name: Upload coverage
      uses: codecov/codecov-action@v2
```

### 2. Test Utilities
```javascript
// src/testUtils.js
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

export const setupFirestore = async () => {
    const app = initializeApp({
        projectId: 'demo-test'
    });
    
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    if (!db._settings?.host?.includes('localhost')) {
        connectFirestoreEmulator(db, 'localhost', 8080);
    }
    
    if (!auth.config.emulator) {
        connectAuthEmulator(auth, 'http://localhost:9099');
    }
    
    return { db, auth };
};

export const createTestUser = (userId, role) => ({
    uid: userId,
    email: `${userId}@test.com`,
    role,
    name: `Test ${role}`,
    franchiseId: role === 'Franchise' ? 'test-franchise' : null
});

export const createTestRequest = (imei, bdoName) => ({
    type: 'NEW_MAPPING',
    device: { imei },
    bdo: { name: bdoName },
    status: 'DRAFT',
    franchise: { id: 'test-franchise', name: 'Test Franchise' }
});
```

## Performance Testing

### 1. Load Testing
```javascript
// tests/load/loadTest.js
import { check } from 'k6';
import http from 'k6/http';

export let options = {
    stages: [
        { duration: '2m', target: 100 }, // Ramp up
        { duration: '5m', target: 100 }, // Stay at 100 users
        { duration: '2m', target: 0 },   // Ramp down
    ],
};

export default function() {
    const response = http.get('https://your-app.com/dashboard');
    check(response, {
        'status is 200': (r) => r.status === 200,
        'response time < 2s': (r) => r.timings.duration < 2000,
    });
}
```

## Security Testing

### 1. Firestore Security Rules Tests
```javascript
// tests/security/firestoreRules.test.js
import { assertFails, assertSucceeds, initializeTestApp } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
    test('should allow franchise to read own requests', async () => {
        const db = initializeTestApp({
            projectId: 'test',
            auth: { uid: 'franchise1', role: 'Franchise', franchiseId: 'franchise1' }
        }).firestore();
        
        await assertSucceeds(
            db.collection('requests')
              .where('franchise.id', '==', 'franchise1')
              .get()
        );
    });

    test('should deny franchise from reading other requests', async () => {
        const db = initializeTestApp({
            projectId: 'test',
            auth: { uid: 'franchise1', role: 'Franchise', franchiseId: 'franchise1' }
        }).firestore();
        
        await assertFails(
            db.collection('requests')
              .where('franchise.id', '==', 'franchise2')
              .get()
        );
    });
});
```

This comprehensive testing strategy ensures reliability, security, and performance of your BVS device management system across all components and workflows.
