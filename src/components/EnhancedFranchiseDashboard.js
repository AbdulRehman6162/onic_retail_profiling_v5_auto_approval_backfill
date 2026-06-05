// --- Enhanced Franchise Dashboard with Cloud Functions ---
import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs, getCountFromServer, limit, startAfter, orderBy } from 'firebase/firestore';
import { CloudFunctionsService } from '../utils/cloudFunctionsService';
import EnhancedRequestForm from './EnhancedRequestForm';
import EnhancedRequestList from './EnhancedRequestList';
import RequestWizard from './RequestWizard';
import DeviceTransferForm from './DeviceTransferForm';
import CreateBDOForm from './CreateBDOForm';
import AdminDataIntegrityPanel from './AdminDataIntegrityPanel';
import EnhancedBDOList from './EnhancedBDOList';
import toast from 'react-hot-toast';
import Papa from 'papaparse';

/**
 * Enhanced Franchise Dashboard that uses Cloud Functions for data loading
 * This eliminates race conditions and provides atomic data loading
 */
function EnhancedFranchiseDashboard({ user, appServices, app, auth }) {
    const [activeTab, setActiveTab] = useState('all_requests');
    const [view, setView] = useState('list');
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cloudFunctions] = useState(() => new CloudFunctionsService(app));
    const [db] = useState(() => getFirestore(app));
    const [mappedDevicesCount, setMappedDevicesCount] = useState(0);
    
    // Editing state for revision workflow
    const [editingRequest, setEditingRequest] = useState(null);

    // Initialize dashboard data using Cloud Functions
    useEffect(() => {
        const initializeDashboard = async () => {
            // Defensive: Log and check required fields before calling Cloud Function
            console.log('🔍 [EnhancedFranchiseDashboard] Checking user data:', {
                user,
                uid: user?.uid,
                franchiseCode: user?.franchiseCode,
                role: user?.role,
                email: user?.email,
                userKeys: user ? Object.keys(user) : 'No user'
            });
            
            if (!user || !user.uid || !user.franchiseCode || !user.role) {
                console.error('[EnhancedFranchiseDashboard] Missing required user data for dashboard initialization', { 
                    user,
                    missingFields: {
                        user: !user,
                        uid: !user?.uid,
                        franchiseCode: !user?.franchiseCode,
                        role: !user?.role
                    }
                });
                setError('Missing required user data for dashboard.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                console.log('🚀 Initializing dashboard via Cloud Functions for:', user);
                const data = await cloudFunctions.initializeDashboardData(user);
                console.log('✅ Dashboard data loaded:', data);
                setDashboardData(data);

                // Show warning if fallback data is used
                if (data.fallback) {
                    toast.error('Dashboard loaded with limited functionality. Some features may not work correctly.');
                    setError('Cloud Functions unavailable - using fallback mode');
                } else {
                    toast.success('Dashboard loaded successfully');
                }

                // Log successful dashboard load
                if (appServices.actionLogger) {
                    await appServices.actionLogger.logAction({
                        type: 'DASHBOARD_LOAD',
                        description: data.fallback ? 'Dashboard loaded with fallback data' : 'Dashboard loaded successfully via Cloud Functions',
                        category: 'SYSTEM',
                        target: {
                            entityType: 'dashboard',
                            entityId: 'franchise',
                            entityIdentifier: user.franchiseCode
                        },
                        context: {
                            requestCount: data.requests?.length || 0,
                            bdoCount: data.bdoAccounts?.length || 0,
                            loadMethod: data.fallback ? 'fallback' : 'cloud_functions',
                            fallback: data.fallback || false,
                            dashboardType: 'enhanced',
                            userRole: user.role,
                            franchiseCode: user.franchiseCode
                        },
                        metadata: {
                            category: 'dashboard',
                            tags: ['dashboard', 'load', 'enhanced']
                        },
                        severity: data.fallback ? 'WARNING' : 'INFO'
                    });
                }

            } catch (error) {
                console.error('❌ Failed to initialize dashboard:', error);
                setError(error.message);
                toast.error('Failed to load dashboard data');
                // Log dashboard load error
                if (appServices.actionLogger) {
                    await appServices.actionLogger.logError(error, {
                        action: 'dashboard_initialization',
                        franchiseCode: user.franchiseCode
                    });
                }
            } finally {
                setLoading(false);
            }
        };

        initializeDashboard();
    }, [user?.uid, user?.franchiseCode, user?.role, cloudFunctions, appServices.actionLogger]);

    // Fetch mapped devices count for stats
    useEffect(() => {
        const fetchMappedDevicesCount = async () => {
            try {
                if (!user?.franchiseCode) return;
                
                const devicesQuery = query(
                    collection(db, 'devices'),
                    where('franchiseCode', '==', user.franchiseCode),
                    where('status', '==', 'Mapped')
                );

                const countSnapshot = await getCountFromServer(devicesQuery);
                setMappedDevicesCount(countSnapshot.data().count);
                
            } catch (error) {
                console.error('❌ Error fetching mapped devices count:', error);
            }
        };

        fetchMappedDevicesCount();
    }, [user?.franchiseCode, db]);

    // Enhanced BDO search using Cloud Functions
    const handleBDOSearch = async (searchTerm, searchType = 'general') => {
        if (!searchTerm.trim()) {
            toast.error('Please enter a search term');
            return [];
        }

        try {
            console.log('🔍 Searching BDOs via Cloud Functions:', { searchTerm, searchType });
            
            const results = await cloudFunctions.searchBDOs(
                user.franchiseCode, 
                searchTerm, 
                searchType
            );
            
            console.log('✅ BDO search results:', results);
            return results;

        } catch (error) {
            console.error('❌ BDO search failed:', error);
            toast.error('Search failed: ' + error.message);
            return [];
        }
    };

    // Refresh dashboard data
    const refreshDashboard = async () => {
        setLoading(true);
        try {
            const data = await cloudFunctions.initializeDashboardData(user);
            setDashboardData(data);
            
            // Also refresh mapped devices count
            const devicesQuery = query(
                collection(db, 'devices'),
                where('franchiseCode', '==', user.franchiseCode),
                where('status', '==', 'Mapped')
            );
            const countSnapshot = await getCountFromServer(devicesQuery);
            setMappedDevicesCount(countSnapshot.data().count);
            
            toast.success('Dashboard refreshed');
        } catch (error) {
            console.error('Refresh failed:', error);
            toast.error('Refresh failed');
        } finally {
            setLoading(false);
        }
    };

    // Handle editing request
    const handleEditRequest = (request) => {
        console.log('🔄 Editing request:', request);
        setEditingRequest(request);
        setActiveTab('edit_request');
    };

    // Handle canceling edit
    const handleCancelEdit = () => {
        setEditingRequest(null);
        setActiveTab('all_requests');
    };

    // Handle successful edit
    const handleEditSuccess = (result) => {
        const isRevision = result.isRevision;
        const revisionCount = result.revisionCount || 0;
        
        if (isRevision) {
            toast.success(`Request resubmitted successfully! (Revision #${revisionCount})`);
        } else {
            toast.success('Request updated successfully!');
        }
        
        setEditingRequest(null);
        setActiveTab('all_requests');
        refreshDashboard(); // Refresh to show updated data
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                    <p className="text-sm text-gray-400 mt-2">Using Cloud Functions for optimal performance</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Dashboard Load Failed</h3>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button 
                        onClick={refreshDashboard}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Extract data from the nested structure - the actual data is in dashboardData.data
    const actualData = dashboardData?.data || dashboardData || {};
    const { requests = [], bdoAccounts = [], stats = {} } = actualData;

    return (
        <div className="min-h-screen bg-gray-50 px-3 sm:px-4 py-4 sm:py-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Enhanced Dashboard</h2>
                        <p className="text-gray-600">Welcome, {user.name || user.email}</p>
                        <p className="text-sm text-green-600">✅ Powered by Cloud Functions</p>
                    </div>
                    <button 
                        onClick={refreshDashboard}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                        🔄 Refresh
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900">Total Requests</h3>
                        <p className="text-3xl font-bold text-blue-600">{stats.totalRequests || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900">Total BDOs</h3>
                        <p className="text-3xl font-bold text-green-600">{stats.totalBDOs || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900">Mapped Devices</h3>
                        <p className="text-3xl font-bold text-indigo-600">{mappedDevicesCount}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900">Completed</h3>
                        <p className="text-3xl font-bold text-purple-600">{stats.requestsByStatus?.Completed || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900">Pending</h3>
                        <p className="text-3xl font-bold text-orange-600">
                            {Object.entries(stats.requestsByStatus || {})
                                .filter(([status]) => !['Completed', 'Archived'].includes(status))
                                .reduce((sum, [, count]) => sum + count, 0)}
                        </p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="bg-white rounded-lg shadow-md mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex gap-4 overflow-x-auto px-4 md:px-6">
                            <button
                                onClick={() => setActiveTab('all_requests')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'all_requests'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                All Requests ({requests.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('bdo_retailer')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'bdo_retailer'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                BDO/Retailer ({bdoAccounts.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('mapped_devices')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'mapped_devices'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                📱 Mapped Devices ({mappedDevicesCount})
                            </button>
                            <button
                                onClick={() => setActiveTab('new_request')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'new_request'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                + New Request
                            </button>
                            {editingRequest && (
                                <button
                                    onClick={() => setActiveTab('edit_request')}
                                    className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                        activeTab === 'edit_request'
                                            ? 'border-orange-500 text-orange-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    🔄 Edit Request
                                    {editingRequest.status === 'Needs Revision' && (
                                        <span className="ml-1 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                                            Revision
                                        </span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab('device_transfer')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'device_transfer'
                                        ? 'border-green-500 text-green-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                🔄 Device Transfer
                            </button>
                            <button
                                onClick={() => setActiveTab('create_bdo')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                    activeTab === 'create_bdo'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                + Create BDO/Retailer
                            </button>
                            {user?.isAdmin && (
                                <button
                                    onClick={() => setActiveTab('admin_tools')}
                                    className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                        activeTab === 'admin_tools'
                                            ? 'border-red-500 text-red-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    🔧 Admin Tools
                                </button>
                            )}
                        </nav>
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
                    {activeTab === 'all_requests' ? (
                        <EnhancedRequestList 
                            user={user} 
                            app={app} 
                            onEditRequest={handleEditRequest}  // Pass edit handler
                        />
                    ) : activeTab === 'new_request' ? (
                        <div>
                            <RequestWizard 
                                user={user}
                                app={app}
                                onSuccess={() => {
                                    setActiveTab('all_requests');
                                    // Refresh dashboard data
                                    refreshDashboard();
                                }}
                                onCancel={() => setActiveTab('all_requests')}
                            />
                        </div>
                    ) : activeTab === 'edit_request' && editingRequest ? (
                        <div>
                            <div className="mb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                            <svg className="h-5 w-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            {editingRequest.status === 'Needs Revision' ? 'Revise Request' : 'Edit Request'}
                                        </h3>
                                        <p className="text-gray-600 text-sm">
                                            Request #{editingRequest.requestNumber || editingRequest.id}
                                            {editingRequest.status === 'Needs Revision' && (
                                                <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                                                    Needs Revision
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleCancelEdit}
                                        className="text-gray-600 hover:text-gray-800 px-3 py-1 border border-gray-300 rounded-md"
                                    >
                                        ← Back to Requests
                                    </button>
                                </div>
                            </div>
                            
                            <RequestWizard 
                                user={user}
                                app={app}
                                editingRequest={editingRequest}  // Pass the request being edited
                                onSuccess={handleEditSuccess}
                                onCancel={handleCancelEdit}
                            />
                        </div>
                    ) : activeTab === 'device_transfer' ? (
                        <div>
                            <DeviceTransferForm 
                                user={user}
                                app={app}
                                onSuccess={() => {
                                    setActiveTab('all_requests');
                                    // Refresh dashboard data
                                    refreshDashboard();
                                    toast.success('Device transfer request submitted successfully!');
                                }}
                                onCancel={() => setActiveTab('all_requests')}
                            />
                        </div>
                    ) : activeTab === 'create_bdo' ? (
                        <div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
                                <h3 className="text-lg font-semibold">Create New BDO/Retailer</h3>
                                <button
                                    onClick={() => setActiveTab('bdo_retailer')}
                                    className="text-gray-600 hover:text-gray-800"
                                >
                                    ← Back to BDO/Retailer List
                                </button>
                            </div>
                            <CreateBDOForm 
                                user={user}
                                appServices={appServices}
                                app={app}
                                auth={auth}
                                db={db}
                                onSuccess={(result) => {
                                    toast.success(`${result.data.handlerType} created successfully!`);
                                    setActiveTab('bdo_retailer');
                                    // Refresh dashboard data to show new BDO
                                    refreshDashboard();
                                }}
                                onCancel={() => setActiveTab('bdo_retailer')}
                            />
                        </div>
                    ) : activeTab === 'bdo_retailer' ? (
                        <div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                                <h3 className="text-lg font-semibold">BDO/Retailer Management</h3>
                                <button
                                    onClick={() => setActiveTab('create_bdo')}
                                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                                >
                                    + Create BDO/Retailer
                                </button>
                            </div>
                            
                            {/* Enhanced BDO List with Search and Details */}
                            <EnhancedBDOList 
                                user={user}
                                app={app}
                            />
                        </div>
                    ) : activeTab === 'mapped_devices' ? (
                        <MappedDevicesView 
                            user={user}
                            db={db}
                        />
                    ) : activeTab === 'admin_tools' ? (
                        <div>
                            <AdminDataIntegrityPanel user={user} />
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-gray-500">Select a tab to view content</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Mapped Devices View Component
 * Shows all mapped devices for the franchise with export functionality
 */
function MappedDevicesView({ user, db }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(false);

    const PAGE_SIZE = 25;

    const formatDate = (value) => {
        if (!value) return 'N/A';
        try {
            const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
            return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
        } catch (error) {
            return 'N/A';
        }
    };

    const fetchMappedDevices = async (reset = false) => {
        if (!user?.franchiseCode) return;

        try {
            reset ? setLoading(true) : setLoadingMore(true);
            setError(null);

            const constraints = [
                where('franchiseCode', '==', user.franchiseCode),
                where('status', '==', 'Mapped'),
                orderBy('createdAt', 'desc')
            ];

            if (!reset && lastDoc) constraints.push(startAfter(lastDoc));
            constraints.push(limit(PAGE_SIZE));

            const devicesQuery = query(collection(db, 'devices'), ...constraints);
            const querySnapshot = await getDocs(devicesQuery);
            const devicesList = querySnapshot.docs.map(document => {
                const deviceData = document.data();
                const { auditTrail, ...deviceWithoutAudit } = deviceData;
                return {
                    id: document.id,
                    imei: deviceData.imei || document.id,
                    ...deviceWithoutAudit
                };
            });

            setDevices(prev => reset ? devicesList : [...prev, ...devicesList]);
            setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
            setHasMore(querySnapshot.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error('Error fetching mapped devices:', error);
            setError(error.message);
            toast.error('Failed to load mapped devices');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        setDevices([]);
        setLastDoc(null);
        setHasMore(false);
        fetchMappedDevices(true);
    }, [user?.franchiseCode]);

    const exportToExcel = async () => {
        try {
            setExporting(true);
            const exportData = devices.map(device => ({
                'IMEI': device.imei || '',
                'BDO ID': device.bdoId || '',
                'BDO Name': device.bdoName || '',
                'BDO CNIC': device.bdoCnic || '',
                'OTP Mobile': device.otpMobileNumber || '',
                'Shop Name': device.shopName || '',
                'Street Address': device.streetAddress || '',
                'City': device.city || '',
                'Latitude': device.latitude || '',
                'Longitude': device.longitude || '',
                'Premise Relationship': device.premiseRelationship || '',
                'Status': device.status || '',
                'Franchise Code': device.franchiseCode || '',
                'Franchise Name': device.franchiseName || '',
                'Mapped Date': formatDate(device.createdAt),
                'Last Updated': formatDate(device.lastUpdatedAt)
            }));

            const csv = Papa.unparse(exportData);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `mapped_devices_loaded_${user.franchiseCode}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(`Exported ${devices.length} loaded mapped devices`);
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading mapped devices...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h3 className="text-sm font-medium text-red-800">Error Loading Devices</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Mapped Devices</h3>
                    <p className="text-gray-600 text-sm">Loaded {devices.length} mapped devices for {user.franchiseCode}. More records load only on demand.</p>
                </div>
                <button
                    onClick={exportToExcel}
                    disabled={exporting || devices.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {exporting ? 'Exporting...' : 'Export Loaded CSV'}
                </button>
            </div>

            {devices.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No Mapped Devices</h3>
                    <p className="mt-1 text-sm text-gray-500">No devices have been mapped to this franchise yet.</p>
                </div>
            ) : (
                <>
                    <div className="hidden lg:block bg-white shadow-sm rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Info</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">BDO Details</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop Details</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status & Date</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {devices.map(device => (
                                        <tr key={device.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">IMEI: {device.imei}</div>
                                                <div className="text-sm text-gray-500">ID: {device.id}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{device.bdoName || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">ID: {device.bdoId || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">CNIC: {device.bdoCnic || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">Mobile: {device.otpMobileNumber || 'N/A'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{device.city || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">{device.streetAddress || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">Lat: {device.latitude || 'N/A'}, Long: {device.longitude || 'N/A'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{device.shopName || 'N/A'}</div>
                                                <div className="text-sm text-gray-500">Relationship: {device.premiseRelationship || 'N/A'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">{device.status}</span>
                                                <div className="text-sm text-gray-500 mt-1">Mapped: {formatDate(device.createdAt)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="lg:hidden space-y-3">
                        {devices.map(device => (
                            <div key={device.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                <div className="flex justify-between items-start gap-3">
                                    <div>
                                        <p className="font-semibold text-gray-900">IMEI: {device.imei}</p>
                                        <p className="text-sm text-gray-600">{device.bdoName || 'N/A'} ({device.bdoId || 'N/A'})</p>
                                    </div>
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">{device.status}</span>
                                </div>
                                <div className="mt-3 text-sm text-gray-600 space-y-1">
                                    <p><span className="font-medium">Shop:</span> {device.shopName || 'N/A'}</p>
                                    <p><span className="font-medium">City:</span> {device.city || 'N/A'}</p>
                                    <p><span className="font-medium">Mapped:</span> {formatDate(device.createdAt)}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 bg-gray-50 px-4 py-3 border border-gray-200 rounded-lg flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm text-gray-600">
                        <span>Showing {devices.length} mapped device{devices.length !== 1 ? 's' : ''}</span>
                        {hasMore && (
                            <button
                                onClick={() => fetchMappedDevices(false)}
                                disabled={loadingMore}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loadingMore ? 'Loading...' : `Load More (${PAGE_SIZE})`}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}


export default EnhancedFranchiseDashboard;
