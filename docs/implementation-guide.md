# Implementation Guide - Integrating Enhanced BVS System

## Overview
This guide shows how to integrate the new architecture components into your existing React/Firebase application.

## Step 1: Update Dependencies

Add these packages to your `package.json`:

```bash
npm install zustand react-query @tanstack/react-query react-hook-form
```

## Step 2: Import New Utilities in App.js

Add these imports at the top of your `App.js`:

```javascript
// Enhanced utilities
import { ActionLogger, useActionLogger } from './utils/actionLogger';
import ConflictResolver from './utils/conflictResolver';
import { NotificationSystem, useNotificationSystem } from './utils/notificationSystem';
import RequestWorkflowManager from './utils/requestWorkflowManager';

// React imports for hooks
import { useRef, useMemo } from 'react';
```

## Step 3: Create Enhanced App Component Hook

Add this custom hook after your constants in App.js:

```javascript
// Enhanced App Hook with new utilities
const useAppServices = (db, user) => {
    const actionLogger = useActionLogger(db, user);
    const notificationSystem = useNotificationSystem(db, user, actionLogger);
    
    const conflictResolver = useMemo(() => {
        if (!db || !actionLogger) return null;
        return new ConflictResolver(db, actionLogger);
    }, [db, actionLogger]);
    
    const workflowManager = useMemo(() => {
        if (!db || !user || !actionLogger || !notificationSystem) return null;
        return new RequestWorkflowManager(db, user, actionLogger, notificationSystem);
    }, [db, user, actionLogger, notificationSystem]);
    
    return {
        actionLogger,
        notificationSystem,
        conflictResolver,
        workflowManager
    };
};
```

## Step 4: Update Main App Component

Replace your main App function with this enhanced version:

```javascript
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Initialize app services
    const appServices = useAppServices(db, user);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                    if (userDoc.exists()) {
                        const userData = { uid: currentUser.uid, ...userDoc.data() };
                        setUser(userData);
                        
                        // Log user login
                        if (appServices.actionLogger) {
                            await appServices.actionLogger.logUserLogin();
                        }
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            } else {
                // Log user logout if we had a user
                if (user && appServices.actionLogger) {
                    await appServices.actionLogger.logUserLogout();
                }
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [appServices.actionLogger]);

    // Rest of your existing App component logic...
}
```

## Step 5: Update Franchise Dashboard

Replace your FranchiseDashboard component with this enhanced version:

```javascript
function FranchiseDashboard({ user, appServices }) {
    const [activeTab, setActiveTab] = useState(FRANCHISE_TABS.ALL_REQUESTS);
    const [view, setView] = useState(VIEWS.LIST);
    const [editingRequest, setEditingRequest] = useState(null);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedBDO, setSelectedBDO] = useState(null);
    const [requests, setRequests] = useState([]);
    const [bdoAccounts, setBdoAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Enhanced request creation with conflict resolution
    const handleCreateRequest = async (requestData) => {
        try {
            if (!appServices.conflictResolver) {
                throw new Error('Conflict resolver not available');
            }
            
            let requestId;
            
            if (requestData.type === 'NEW_MAPPING') {
                requestId = await appServices.conflictResolver.claimIMEIForRequest(
                    requestData.device.imei,
                    requestData
                );
            } else if (requestData.type === 'TRANSFER_OWNERSHIP') {
                requestId = await appServices.conflictResolver.handleOwnershipTransfer(
                    requestData.device.imei,
                    requestData.device.currentBdoId,
                    requestData.device.targetBdoId,
                    requestData
                );
            } else {
                // For OTP_CHANGE and DEVICE_DEMAP, use standard creation
                const requestRef = await addDoc(collection(db, 'requests'), {
                    ...requestData,
                    requestNumber: await generateRequestNumber(requestData.type),
                    metadata: {
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                        createdBy: user.uid
                    }
                });
                requestId = requestRef.id;
            }
            
            // Log request creation
            if (appServices.actionLogger) {
                await appServices.actionLogger.logRequestCreated({
                    id: requestId,
                    requestNumber: requestData.requestNumber,
                    ...requestData
                });
            }
            
            toast.success('Request created successfully!');
            setView(VIEWS.LIST);
            
        } catch (error) {
            console.error('Error creating request:', error);
            toast.error(error.message || 'Failed to create request');
            
            // Log error
            if (appServices.actionLogger) {
                await appServices.actionLogger.logError(error, {
                    action: 'createRequest',
                    requestType: requestData.type
                });
            }
        }
    };

    // Enhanced request submission
    const handleSubmitRequest = async (requestId) => {
        try {
            if (!appServices.workflowManager) {
                throw new Error('Workflow manager not available');
            }
            
            await appServices.workflowManager.submitRequest(requestId);
            toast.success('Request submitted for review!');
            
        } catch (error) {
            console.error('Error submitting request:', error);
            toast.error(error.message || 'Failed to submit request');
        }
    };

    // Rest of your existing FranchiseDashboard logic...
}
```

## Step 6: Create Sales Team Dashboard

Add this new component for Sales Team functionality:

```javascript
function SalesTeamDashboard({ user, appServices }) {
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch requests pending sales review
    useEffect(() => {
        const q = query(
            collection(db, 'requests'),
            where('status', 'in', ['SALES_REVIEW', 'SALES_APPROVED', 'SALES_REJECTED']),
            orderBy('metadata.submittedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRequests(requestsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApproveRequest = async (requestId, comments) => {
        try {
            if (!appServices.workflowManager) {
                throw new Error('Workflow manager not available');
            }
            
            await appServices.workflowManager.processSalesReview(requestId, true, comments);
            toast.success('Request approved!');
            setSelectedRequest(null);
            
        } catch (error) {
            console.error('Error approving request:', error);
            toast.error(error.message || 'Failed to approve request');
        }
    };

    const handleRejectRequest = async (requestId, comments) => {
        try {
            if (!appServices.workflowManager) {
                throw new Error('Workflow manager not available');
            }
            
            await appServices.workflowManager.processSalesReview(requestId, false, comments);
            toast.success('Request rejected');
            setSelectedRequest(null);
            
        } catch (error) {
            console.error('Error rejecting request:', error);
            toast.error(error.message || 'Failed to reject request');
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>;
    }

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Sales Team Dashboard</h1>
            
            <div className="grid gap-6">
                {requests.map(request => (
                    <RequestCard 
                        key={request.id}
                        request={request}
                        onApprove={handleApproveRequest}
                        onReject={handleRejectRequest}
                        onViewDetails={setSelectedRequest}
                        userRole="Sales Team"
                    />
                ))}
            </div>
            
            {selectedRequest && (
                <RequestDetailModal
                    request={selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                    onApprove={handleApproveRequest}
                    onReject={handleRejectRequest}
                    userRole="Sales Team"
                />
            )}
        </div>
    );
}
```

## Step 7: Create Operations Team Dashboard

Add this component for Operations Team:

```javascript
function OperationsTeamDashboard({ user, appServices }) {
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch requests pending operations review
    useEffect(() => {
        const q = query(
            collection(db, 'requests'),
            where('status', 'in', ['OPS_REVIEW', 'OPS_APPROVED', 'OPS_REJECTED', 'IN_PROCESSING']),
            orderBy('metadata.updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRequests(requestsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApproveRequest = async (requestId, comments, externalRef) => {
        try {
            if (!appServices.workflowManager) {
                throw new Error('Workflow manager not available');
            }
            
            await appServices.workflowManager.processOperationsReview(
                requestId, 
                true, 
                comments, 
                externalRef
            );
            toast.success('Request approved and processing started!');
            setSelectedRequest(null);
            
        } catch (error) {
            console.error('Error approving request:', error);
            toast.error(error.message || 'Failed to approve request');
        }
    };

    const handleCompleteRequest = async (requestId, completionNotes) => {
        try {
            if (!appServices.workflowManager) {
                throw new Error('Workflow manager not available');
            }
            
            await appServices.workflowManager.completeRequest(requestId, completionNotes);
            toast.success('Request completed!');
            setSelectedRequest(null);
            
        } catch (error) {
            console.error('Error completing request:', error);
            toast.error(error.message || 'Failed to complete request');
        }
    };

    // Similar structure to SalesTeamDashboard but with operations-specific actions
    // ... rest of component
}
```

## Step 8: Update Main Routing

Update your main App component to route to different dashboards:

```javascript
const renderDashboard = () => {
    if (!user) return <LoginComponent />;
    
    const dashboardProps = {
        user,
        appServices,
        db,
        auth
    };
    
    switch (user.role) {
        case 'Franchise':
            return <FranchiseDashboard {...dashboardProps} />;
        case 'Sales Team':
            return <SalesTeamDashboard {...dashboardProps} />;
        case 'Operations Team':
            return <OperationsTeamDashboard {...dashboardProps} />;
        case 'Admin':
            return <AdminDashboard {...dashboardProps} />;
        default:
            return <UnauthorizedAccess />;
    }
};

return (
    <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />
        {renderDashboard()}
    </div>
);
```

## Step 9: Add Error Boundary

Create an error boundary component:

```javascript
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        
        // Log error if action logger is available
        if (this.props.actionLogger) {
            this.props.actionLogger.logError(error, {
                errorInfo,
                component: 'ErrorBoundary'
            });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                        <h2 className="text-xl font-bold text-red-600 mb-4">
                            Something went wrong
                        </h2>
                        <p className="text-gray-600 mb-4">
                            An unexpected error occurred. Please refresh the page or contact support.
                        </p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
```

## Step 10: Update Security Rules

Update your Firestore security rules to include the new collections:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Existing rules...
    
    // Action logs - read-only for admins and ops
    match /actionLogs/{logId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Operations Team'];
      allow create: if request.auth != null; // System creates these
    }
    
    // Notifications - users can read their own
    match /notifications/{notificationId} {
      allow read, update: if request.auth != null && 
        resource.data.recipientId == request.auth.uid;
      allow create: if request.auth != null; // System creates these
    }
    
    // System announcements - read-only
    match /systemAnnouncements/{announcementId} {
      allow read: if request.auth != null;
    }
    
    // Device inventory - operations team can manage
    match /deviceInventory/{deviceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Operations Team', 'Admin'];
    }
  }
}
```

## Testing the Enhanced System

1. **Create Test Data**: Use the Firebase console to create test users with different roles
2. **Test Workflows**: Create requests and test the approval workflows
3. **Test Conflicts**: Try to create conflicting requests for the same IMEI
4. **Test Notifications**: Verify real-time notifications are working
5. **Test Logging**: Check that all actions are being logged properly

## Performance Considerations

1. **Pagination**: Implement pagination for large request lists
2. **Caching**: Cache frequently accessed data
3. **Indexes**: Ensure all Firestore composite indexes are created
4. **Bundle Splitting**: Split code by role to reduce initial load

This integration provides a robust, scalable, and auditable system for managing BVS device lifecycles while building on your existing React/Firebase foundation.
