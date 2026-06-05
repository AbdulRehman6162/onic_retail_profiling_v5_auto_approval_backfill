// --- Enhanced Request List Component ---
import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, limit, startAfter, getDocs, where, Timestamp } from 'firebase/firestore';

/**
 * Enhanced Request List with pagination and detailed view
 * Shows proper request information with all details
 * Enhanced with revision workflow support
 */
function EnhancedRequestList({ user, app, onEditRequest }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [viewMode, setViewMode] = useState('pending');
    const [db] = useState(() => getFirestore(app));

    const REQUESTS_PER_PAGE = 10;

    const ACTIVE_REQUEST_STATUSES = [
        'pending',
        'Pending',
        'Submitted',
        'SUBMITTED',
        'Sales Review',
        'SALES_REVIEW',
        'Sales Approved',
        'SALES_APPROVED',
        'Operations Review',
        'OPS_REVIEW',
        'In Processing',
        'IN_PROCESSING',
        'Needs Revision',
        'NEEDS_REVISION',
        'ON_HOLD'
    ];

    const COMPLETED_REQUEST_STATUSES = ['Completed', 'COMPLETED'];

    /**
     * Convert any timestamp format to comparable number (milliseconds since epoch)
     */
    const getTimestampValue = (timestamp) => {
        if (!timestamp) return 0;
        
        // Handle Firestore Timestamp objects with seconds/nanoseconds
        if (timestamp && typeof timestamp === 'object' && 
            (timestamp.seconds !== undefined || timestamp.nanoseconds !== undefined)) {
            const seconds = timestamp.seconds || 0;
            const nanoseconds = timestamp.nanoseconds || 0;
            return seconds * 1000 + nanoseconds / 1000000;
        }
        
        // Handle Firestore timestamps with toDate method
        if (timestamp.toDate) {
            return timestamp.toDate().getTime();
        }
        
        // Handle Date objects
        if (timestamp instanceof Date) {
            return timestamp.getTime();
        }
        
        // Handle string timestamps
        if (typeof timestamp === 'string') {
            return new Date(timestamp).getTime();
        }
        
        // Handle numeric timestamps
        if (typeof timestamp === 'number') {
            return timestamp;
        }
        
        return 0;
    };

    /**
     * Sort requests by creation date (newest first)
     */
    const sortRequestsByDate = (requests) => {
        return requests.sort((a, b) => {
            const timeA = getTimestampValue(a.createdAt);
            const timeB = getTimestampValue(b.createdAt);
            
            // Sort in descending order (newest first)
            return timeB - timeA;
        });
    };

    const buildRequestQuery = (isLoadMore = false) => {
        const constraints = [where('franchiseCode', '==', user.franchiseCode)];

        if (viewMode === 'pending') {
            constraints.push(where('status', 'in', ACTIVE_REQUEST_STATUSES));
        } else if (viewMode === 'completed') {
            constraints.push(where('status', 'in', COMPLETED_REQUEST_STATUSES));
        } else if (viewMode === 'recent') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            constraints.push(where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)));
        }

        constraints.push(orderBy('createdAt', 'desc'));
        if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));
        constraints.push(limit(REQUESTS_PER_PAGE));

        return query(collection(db, 'requestsV2'), ...constraints);
    };

    /**
     * Load requests with smart scopes and pagination.
     */
    const loadRequests = async (isLoadMore = false) => {
        if (!user?.franchiseCode) return;

        if (isLoadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setRequests([]);
            setLastDoc(null);
            setHasMore(true);
            setSelectedRequest(null);
        }

        try {
            const requestQuery = buildRequestQuery(isLoadMore);
            const querySnapshot = await getDocs(requestQuery);
            const newRequests = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (isLoadMore) {
                setRequests(prevRequests => [...prevRequests, ...newRequests]);
            } else {
                setRequests(newRequests);
            }

            setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
            setHasMore(querySnapshot.docs.length === REQUESTS_PER_PAGE);
        } catch (error) {
            console.error('Error loading requests:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (user?.franchiseCode) {
            loadRequests();
        }
    }, [user?.franchiseCode, viewMode]);

    /**
     * Format date for display with robust timestamp handling
     */
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        
        // Handle serverTimestamp maps (fallback for older documents)
        if (timestamp && typeof timestamp === 'object' && timestamp._methodName === 'serverTimestamp') {
            return 'Processing...';
        }
        
        // Handle Firestore Timestamp objects with seconds/nanoseconds
        if (timestamp && typeof timestamp === 'object' && 
            (timestamp.seconds !== undefined || timestamp.nanoseconds !== undefined)) {
            const seconds = timestamp.seconds || 0;
            const nanoseconds = timestamp.nanoseconds || 0;
            const date = new Date(seconds * 1000 + nanoseconds / 1000000);
            
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // Handle regular Firestore timestamps and Date objects
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            date = new Date(timestamp);
        }
        
        // Validate the final date
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    /**
     * Check if request is DE_MAPPING type
     */
    const isDemappingRequest = (request) => {
        return request.requestType === 'DE_MAPPING';
    };

    const isLocationChangeRequest = (request) => {
        return request.requestType === 'LOCATION_UPDATE';
    };

    const formatCoordinateValue = (value) => {
        if (value === null || value === undefined || value === '') return 'null';
        return String(value);
    };

    const getLocationChangeSpecificData = (request) => {
        if (!isLocationChangeRequest(request)) return null;

        const currentMapping = request.currentMapping || request.locationChangeDetails?.currentMapping || {};
        const selectedDevice = request.locationChangeDetails?.selectedDevice || {};
        const previousLocation = request.previousLocation || currentMapping.locationDetails || request.deviceDetails || {};
        const newLocation = request.newLocation || request.locationChangeDetails?.newLocation || {};
        const bdoDetails = currentMapping.bdoDetails || request.bdoDetails || {};
        const deviceInfo = currentMapping.deviceInfo || request.deviceInfo || request.deviceDetails || selectedDevice || {};
        const locationDetails = currentMapping.locationDetails || request.deviceDetails || previousLocation || {};

        return {
            currentMapping,
            selectedDevice,
            previousLocation,
            newLocation,
            bdoDetails,
            deviceInfo,
            locationDetails,
            deviceImei: request.device?.imei ||
                       request.deviceInfo?.imei ||
                       request.deviceDetails?.imei ||
                       selectedDevice.imei ||
                       currentMapping.deviceInfo?.imei || 'N/A',
            previousLatitude: previousLocation.latitude ?? locationDetails.latitude ?? request.deviceDetails?.latitude ?? null,
            previousLongitude: previousLocation.longitude ?? locationDetails.longitude ?? request.deviceDetails?.longitude ?? null,
            newLatitude: newLocation.hasCoordinates ? newLocation.latitude : null,
            newLongitude: newLocation.hasCoordinates ? newLocation.longitude : null,
            resetToNull: newLocation.resetToNull === true || newLocation.hasCoordinates === false,
            reason: request.locationChangeReason || request.locationChangeDetails?.locationChangeReason || ''
        };
    };

    /**
     * Get DE_MAPPING specific data with proper fallbacks
     */
    const getDemappingSpecificData = (request) => {
        if (!isDemappingRequest(request)) return null;
        
        return {
            demappingReason: request.demappingReason || request.demapReason || 'N/A',
            currentMapping: request.currentMapping || {},
            deviceImei: request.deviceInfo?.imei || 
                       request.device?.imei || 
                       request.imei || 
                       request.currentMapping?.deviceInfo?.imei || 'N/A',
            bdoDetails: request.currentMapping?.bdoDetails || request.bdoDetails || {},
            locationDetails: request.currentMapping?.locationDetails || {},
            deviceInfo: request.currentMapping?.deviceInfo || request.deviceInfo || {}
        };
    };

    /**
     * Format demapping reason with proper styling
     */
    const formatDemappingReason = (reason) => {
        if (!reason || reason === 'N/A') return 'N/A';
        // Capitalize first letter and limit length
        return reason.charAt(0).toUpperCase() + reason.slice(1).substring(0, 50) + 
               (reason.length > 50 ? '...' : '');
    };

    /**
     * Get display name for request type
     */
    const getRequestTypeDisplay = (type) => {
        const typeMap = {
            'NEW_MAPPING': 'New Device Mapping',
            'TRANSFER_OWNERSHIP': 'Device Transfer',
            'OTP_CHANGE': 'OTP Number Change',
            'DE_MAPPING': 'Device De-mapping',
            'LOCATION_UPDATE': 'Location Change'
        };
        return typeMap[type] || type || 'N/A';
    };

    /**
     * Get status badge color
     */
    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'submitted':
                return 'bg-blue-100 text-blue-800';
            case 'rejected':
                return 'bg-red-100 text-red-800';
            case 'needs revision':
                return 'bg-orange-100 text-orange-800 border-orange-200 animate-pulse';
            case 'draft':
                return 'bg-gray-100 text-gray-800';
            case 'sales review':
                return 'bg-purple-100 text-purple-800';
            case 'operations review':
                return 'bg-cyan-100 text-cyan-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    /**
     * Open request details modal
     */
    const openRequestDetails = (request) => {
        setSelectedRequest(request);
        setShowModal(true);
    };

    const viewModeOptions = [
        { id: 'pending', label: 'Pending', description: 'Default worklist' },
        { id: 'recent', label: 'Last 7 days', description: 'Recent requests' },
        { id: 'completed', label: 'Completed', description: 'Load only when needed' }
    ];

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading requests...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-4">
                <div>
                    <h3 className="text-lg font-semibold">Requests ({requests.length})</h3>
                    <p className="text-sm text-gray-500">Pending requests are loaded by default. Completed history loads only on demand.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {viewModeOptions.map(option => (
                        <button
                            key={option.id}
                            onClick={() => setViewMode(option.id)}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                                viewMode === option.id
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            title={option.description}
                        >
                            {option.label}
                        </button>
                    ))}
                    <button
                        onClick={() => loadRequests()}
                        className="px-3 py-2 rounded-lg border text-sm text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No requests found</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map((request, index) => (
                        <div 
                            key={request.id} 
                            className={`border rounded-lg p-4 transition-colors ${
                                request.status === 'Needs Revision' 
                                    ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' 
                                    : isDemappingRequest(request)
                                        ? 'border-red-200 bg-red-25 hover:bg-red-50'
                                        : isLocationChangeRequest(request)
                                            ? 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100'
                                            : 'border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                                <div className="flex-1">
                                    {/* Request Header */}
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <h4 className="font-semibold text-lg">
                                            {request.requestNumber || request.id}
                                        </h4>
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(request.status)}`}>
                                            {request.status || 'pending'}
                                        </span>
                                        
                                        {/* DE_MAPPING specific badge */}
                                        {isDemappingRequest(request) && (
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full flex items-center">
                                                🔓 De-mapping
                                            </span>
                                        )}

                                        {isLocationChangeRequest(request) && (
                                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full flex items-center">
                                                📍 Location Change
                                            </span>
                                        )}
                                        
                                        {/* Revision Indicator */}
                                        {request.isResubmission && request.revisionCount > 0 && (
                                            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full flex items-center">
                                                🔄 Revision #{request.revisionCount}
                                            </span>
                                        )}
                                        
                                        {index < 5 && (
                                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                                                Recent
                                            </span>
                                        )}
                                    </div>

                                    {/* Revision Warning */}
                                    {request.status === 'Needs Revision' && request.rejectionReason && (
                                        <div className="bg-orange-100 border-l-4 border-orange-400 p-3 mb-3 rounded-r">
                                            <div className="flex items-start">
                                                <svg className="h-4 w-4 text-orange-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                <div className="flex-1">
                                                    <p className="text-xs font-medium text-orange-800">Revision Required:</p>
                                                    <p className="text-xs text-orange-700 mt-1">{request.rejectionReason}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Request Details Grid - Conditional rendering for DE_MAPPING */}
                                    {isDemappingRequest(request) ? (
                                        // DE_MAPPING specific grid
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            {(() => {
                                                const demapData = getDemappingSpecificData(request);
                                                return (
                                                    <>
                                                        {/* Column 1: BDO Information */}
                                                        <div>
                                                            <span className="font-medium text-gray-700">BDO Details:</span>
                                                            <p className="text-gray-900">
                                                                {demapData.bdoDetails?.name || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                ID: {demapData.bdoDetails?.bdoId || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                CNIC: {demapData.bdoDetails?.cnic || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                Phone: {demapData.bdoDetails?.phoneNumber || 'N/A'}
                                                            </p>
                                                        </div>
                                                        
                                                        {/* Column 2: Device & Demapping Info */}
                                                        <div>
                                                            <span className="font-medium text-gray-700">Device & Reason:</span>
                                                            <p className="text-gray-900 font-mono text-sm">
                                                                IMEI: {demapData.deviceImei}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                Model: {demapData.deviceInfo?.model || 'Not specified'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                Status: {demapData.deviceInfo?.status || 'N/A'}
                                                            </p>
                                                            <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded">
                                                                <p className="text-xs text-red-800 font-medium">Reason:</p>
                                                                <p className="text-xs text-red-700">{formatDemappingReason(demapData.demappingReason)}</p>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Column 3: Location Information */}
                                                        <div>
                                                            <span className="font-medium text-gray-700">Current Location:</span>
                                                            <p className="text-gray-900">
                                                                {demapData.locationDetails?.shopName || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                {demapData.locationDetails?.city || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                {demapData.locationDetails?.streetAddress || 'N/A'}
                                                            </p>
                                                            <p className="text-gray-600 text-xs">
                                                                Mapping Status: {demapData.currentMapping?.status || 'N/A'}
                                                            </p>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : isLocationChangeRequest(request) ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            {(() => {
                                                const locationData = getLocationChangeSpecificData(request);
                                                return (
                                                    <>
                                                        <div>
                                                            <span className="font-medium text-gray-700">BDO Details:</span>
                                                            <p className="text-gray-900">{locationData.bdoDetails?.name || locationData.bdoDetails?.bdoName || 'N/A'}</p>
                                                            <p className="text-gray-600 text-xs">ID: {locationData.bdoDetails?.bdoId || 'N/A'}</p>
                                                            <p className="text-gray-600 text-xs">Phone: {locationData.bdoDetails?.phoneNumber || locationData.bdoDetails?.otpMobileNumber || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Device & Action:</span>
                                                            <p className="text-gray-900 font-mono text-sm">IMEI: {locationData.deviceImei}</p>
                                                            <p className="text-gray-600 text-xs">Status: {locationData.deviceInfo?.status || 'N/A'}</p>
                                                            <div className="mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                                                <p className="text-xs text-yellow-800 font-medium">Requested Action:</p>
                                                                <p className="text-xs text-yellow-700">
                                                                    {locationData.resetToNull
                                                                        ? 'Reset latitude and longitude to null'
                                                                        : `${formatCoordinateValue(locationData.newLatitude)}, ${formatCoordinateValue(locationData.newLongitude)}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Current Location:</span>
                                                            <p className="text-gray-900">{locationData.locationDetails?.shopName || 'N/A'}</p>
                                                            <p className="text-gray-600 text-xs">{locationData.locationDetails?.city || 'N/A'}</p>
                                                            <p className="text-gray-600 text-xs break-all">
                                                                Current: {formatCoordinateValue(locationData.previousLatitude)}, {formatCoordinateValue(locationData.previousLongitude)}
                                                            </p>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        // Generic grid for other request types
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="font-medium text-gray-700">BDO:</span>
                                                <p className="text-gray-900">
                                                    {request.bdoDetails?.name ||
                                                     request.selectedBDO?.name || 'N/A'}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    ID: {request.bdoDetails?.bdoId || 
                                                         request.selectedBDO?.id || 
                                                         request.selectedBDO?.bdoId || 'N/A'}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    CNIC: {request.bdoDetails?.cnic ||
                                                           request.selectedBDO?.cnic || 'N/A'}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    OTP: {request.bdoDetails?.otpMobileNumber ||
                                                          request.selectedBDO?.otpMobileNumber || 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Device IMEI:</span>
                                                <p className="text-gray-900 font-mono">
                                                    {request.deviceDetails?.imei || 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                {request.requestType === 'TRANSFER_OWNERSHIP' ? (
                                                    <>
                                                        <span className="font-medium text-gray-700">Transfer:</span>
                                                        <div className="text-sm">
                                                            <div className="text-gray-600">
                                                                <span className="text-xs font-medium">From:</span>
                                                                <p className="text-gray-900 ml-2">
                                                                    {request.deviceDetails?.currentShopName || 'N/A'}
                                                                </p>
                                                                <p className="text-gray-600 text-xs ml-2">
                                                                    {request.deviceDetails?.currentCity || 'N/A'}
                                                                </p>
                                                            </div>
                                                            <div className="text-gray-600 mt-1">
                                                                <span className="text-xs font-medium">To:</span>
                                                                <p className="text-gray-900 ml-2">
                                                                    {request.deviceDetails?.newShopName || 'N/A'}
                                                                </p>
                                                                <p className="text-gray-600 text-xs ml-2">
                                                                    {request.deviceDetails?.newCity || 'N/A'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="font-medium text-gray-700">Shop:</span>
                                                        <p className="text-gray-900">
                                                            {request.deviceDetails?.shopName || request.deviceDetails?.newShopName || 'N/A'}
                                                        </p>
                                                        <p className="text-gray-600 text-xs">
                                                            {request.deviceDetails?.city || request.deviceDetails?.newCity || 'N/A'}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Request Type and Date */}
                                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                                        <span>
                                            <span className="font-medium">Type:</span> {getRequestTypeDisplay(request.requestType)}
                                        </span>
                                        <span>
                                            <span className="font-medium">Created:</span> {formatDate(request.createdAt)}
                                        </span>
                                        {request.resubmittedAt && (
                                            <span className="text-orange-600">
                                                <span className="font-medium">Resubmitted:</span> {formatDate(request.resubmittedAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 ml-4">
                                    {/* Edit Button - show for drafts and needs revision */}
                                    {(request.status === 'Needs Revision' || request.status === 'Draft') && onEditRequest && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent opening details modal
                                                onEditRequest(request);
                                            }}
                                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                                request.status === 'Needs Revision'
                                                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                                                    : 'bg-blue-500 text-white hover:bg-blue-600'
                                            }`}
                                            title={request.status === 'Needs Revision' ? 'Revise Request' : 'Edit Request'}
                                        >
                                            {request.status === 'Needs Revision' ? '🔄 Revise' : '✏️ Edit'}
                                        </button>
                                    )}
                                    
                                    {/* View Details Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openRequestDetails(request);
                                        }}
                                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                                        title="View Details"
                                    >
                                        👁️ View
                                    </button>
                                    
                                    {/* Click indicator */}
                                    <div className="flex items-center text-gray-400">
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Load More Button */}
                    {hasMore && (
                        <div className="text-center pt-4">
                            <button
                                onClick={() => loadRequests(true)}
                                disabled={loadingMore}
                                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {loadingMore ? (
                                    <span className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Loading...
                                    </span>
                                ) : (
                                    'Load More'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Request Details Modal */}
            {showModal && selectedRequest && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-4xl w-full max-h-[92vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b">
                            <h3 className="text-xl font-semibold">Request Details</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Information */}
                                <div>
                                    <h4 className="font-medium text-gray-900 border-b pb-2 mb-4">Basic Information</h4>
                                    <div className="space-y-3">
                                        <div>
                                            <span className="text-sm font-medium text-gray-700">Request Number:</span>
                                            <p className="text-gray-900">{selectedRequest.requestNumber || selectedRequest.id}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-gray-700">Request Type:</span>
                                            <p className="text-gray-900">{getRequestTypeDisplay(selectedRequest.requestType)}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-gray-700">Status:</span>
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedRequest.status)}`}>
                                                {selectedRequest.status || 'pending'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-gray-700">Created At:</span>
                                            <p className="text-gray-900">{formatDate(selectedRequest.createdAt)}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* BDO & Device Information - Enhanced for DE_MAPPING */}
                                <div>
                                    <h4 className="font-medium text-gray-900 border-b pb-2 mb-4">
                                        {isDemappingRequest(selectedRequest)
                                            ? 'Current Mapping Details'
                                            : isLocationChangeRequest(selectedRequest)
                                                ? 'Location Change Device Details'
                                                : 'BDO & Device Info'}
                                    </h4>
                                    <div className="space-y-3">
                                        {isDemappingRequest(selectedRequest) ? (
                                            // DE_MAPPING specific modal content
                                            (() => {
                                                const demapData = getDemappingSpecificData(selectedRequest);
                                                return (
                                                    <>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO Name:</span>
                                                            <p className="text-gray-900">{demapData.bdoDetails?.name || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO ID:</span>
                                                            <p className="text-gray-900 font-mono">{demapData.bdoDetails?.bdoId || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO CNIC:</span>
                                                            <p className="text-gray-900 font-mono">{demapData.bdoDetails?.cnic || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO Phone:</span>
                                                            <p className="text-gray-900 font-mono">{demapData.bdoDetails?.phoneNumber || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">Device IMEI:</span>
                                                            <p className="text-gray-900 font-mono">{demapData.deviceImei}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">Device Model:</span>
                                                            <p className="text-gray-900">{demapData.deviceInfo?.model || 'Not specified'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">Current Status:</span>
                                                            <p className="text-gray-900">{demapData.deviceInfo?.status || 'N/A'}</p>
                                                        </div>
                                                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                                                            <span className="text-sm font-medium text-red-800">Demapping Reason:</span>
                                                            <p className="text-red-700 mt-1">{demapData.demappingReason}</p>
                                                        </div>
                                                    </>
                                                );
                                            })()
                                        ) : isLocationChangeRequest(selectedRequest) ? (
                                            (() => {
                                                const locationData = getLocationChangeSpecificData(selectedRequest);
                                                return (
                                                    <>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO Name:</span>
                                                            <p className="text-gray-900">{locationData.bdoDetails?.name || locationData.bdoDetails?.bdoName || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO ID:</span>
                                                            <p className="text-gray-900 font-mono">{locationData.bdoDetails?.bdoId || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO CNIC:</span>
                                                            <p className="text-gray-900 font-mono">{locationData.bdoDetails?.cnic || locationData.bdoDetails?.bdoCnic || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">BDO Phone:</span>
                                                            <p className="text-gray-900 font-mono">{locationData.bdoDetails?.phoneNumber || locationData.bdoDetails?.otpMobileNumber || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-700">Device IMEI:</span>
                                                            <p className="text-gray-900 font-mono break-all">{locationData.deviceImei}</p>
                                                        </div>
                                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                                                            <span className="text-sm font-medium text-yellow-900">Requested Action:</span>
                                                            {locationData.resetToNull ? (
                                                                <p className="text-yellow-800 mt-1">Reset latitude and longitude to null</p>
                                                            ) : (
                                                                <p className="text-yellow-800 mt-1 font-mono">
                                                                    {formatCoordinateValue(locationData.newLatitude)}, {formatCoordinateValue(locationData.newLongitude)}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {locationData.reason && (
                                                            <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                                                                <span className="text-sm font-medium text-gray-700">Remarks:</span>
                                                                <p className="text-gray-900 mt-1 whitespace-pre-wrap">{locationData.reason}</p>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()
                                        ) : (
                                            // Generic modal content for other request types
                                            <>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">BDO Name:</span>
                                                    <p className="text-gray-900">
                                                        {selectedRequest.bdoDetails?.name || 
                                                         selectedRequest.selectedBDO?.name || 
                                                         selectedRequest.selectedBDO?.bdoName || 
                                                         selectedRequest.bdoName || 'N/A'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">BDO ID:</span>
                                                    <p className="text-gray-900 font-mono">
                                                        {selectedRequest.bdoDetails?.bdoId ||
                                                         selectedRequest.selectedBDO?.id || 
                                                         selectedRequest.selectedBDO?.bdoId || 
                                                         selectedRequest.bdoId || 'N/A'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">BDO CNIC:</span>
                                                    <p className="text-gray-900 font-mono">
                                                        {selectedRequest.bdoDetails?.cnic ||
                                                         selectedRequest.selectedBDO?.cnic || 
                                                         selectedRequest.bdoCnic || 'N/A'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">BDO OTP:</span>
                                                    <p className="text-gray-900 font-mono">
                                                        {selectedRequest.bdoDetails?.otpMobileNumber ||
                                                         selectedRequest.selectedBDO?.otpMobileNumber || 
                                                         selectedRequest.bdoOtp || 'N/A'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">Device IMEI:</span>
                                                    <p className="text-gray-900 font-mono">{selectedRequest.deviceDetails?.imei || 'N/A'}</p>
                                                </div>
                                            </>
                                        )}
                                        <div>
                                            {selectedRequest.requestType === 'TRANSFER_OWNERSHIP' ? (
                                                <>
                                                    <span className="text-sm font-medium text-gray-700">Transfer Details:</span>
                                                    <div className="mt-1">
                                                        <div className="mb-2">
                                                            <span className="text-xs font-medium text-gray-600">From Shop:</span>
                                                            <p className="text-gray-900">{selectedRequest.deviceDetails?.currentShopName || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-medium text-gray-600">To Shop:</span>
                                                            <p className="text-gray-900">{selectedRequest.deviceDetails?.newShopName || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-sm font-medium text-gray-700">Shop Name:</span>
                                                    <p className="text-gray-900">{selectedRequest.deviceDetails?.shopName || selectedRequest.deviceDetails?.newShopName || 'N/A'}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

            {/* Shop Details - Enhanced for DE_MAPPING */}
            {(selectedRequest.deviceDetails || 
              selectedRequest.deviceDetails?.newShopName || 
              selectedRequest.deviceDetails?.newCity ||
              isDemappingRequest(selectedRequest) ||
              isLocationChangeRequest(selectedRequest)) && (
                <div className="mt-6">
                    <h4 className="font-medium text-gray-900 border-b pb-2 mb-4">
                        {selectedRequest.requestType === 'TRANSFER_OWNERSHIP' ? 'Location Details' : 
                         isDemappingRequest(selectedRequest) ? 'Current Mapping Location' :
                         isLocationChangeRequest(selectedRequest) ? 'Location Change Coordinates' : 'Shop Details'}
                    </h4>
                    
                    {isDemappingRequest(selectedRequest) ? (
                        // DE_MAPPING specific location display
                        (() => {
                            const demapData = getDemappingSpecificData(selectedRequest);
                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Shop Name:</span>
                                        <p className="text-gray-900">{demapData.locationDetails?.shopName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">City:</span>
                                        <p className="text-gray-900">{demapData.locationDetails?.city || 'N/A'}</p>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="text-sm font-medium text-gray-700">Address:</span>
                                        <p className="text-gray-900">{demapData.locationDetails?.streetAddress || 'N/A'}</p>
                                    </div>
                                    {(demapData.locationDetails?.latitude && demapData.locationDetails?.longitude) && (
                                        <div className="md:col-span-2">
                                            <span className="text-sm font-medium text-gray-700">Coordinates:</span>
                                            <p className="text-gray-900 font-mono text-xs">
                                                {demapData.locationDetails.latitude}, {demapData.locationDetails.longitude}
                                            </p>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Mapping Status:</span>
                                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                            demapData.currentMapping?.status === 'Mapped' 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {demapData.currentMapping?.status || 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()
                    ) : isLocationChangeRequest(selectedRequest) ? (
                        (() => {
                            const locationData = getLocationChangeSpecificData(selectedRequest);
                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Shop Name:</span>
                                        <p className="text-gray-900">{locationData.locationDetails?.shopName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">City:</span>
                                        <p className="text-gray-900">{locationData.locationDetails?.city || 'N/A'}</p>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="text-sm font-medium text-gray-700">Address:</span>
                                        <p className="text-gray-900">{locationData.locationDetails?.streetAddress || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Current Coordinates:</span>
                                        <p className="text-gray-900 font-mono text-xs">
                                            {formatCoordinateValue(locationData.previousLatitude)}, {formatCoordinateValue(locationData.previousLongitude)}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">New Coordinates:</span>
                                        {locationData.resetToNull ? (
                                            <p className="text-orange-800 text-sm">Will be reset to null</p>
                                        ) : (
                                            <p className="text-gray-900 font-mono text-xs">
                                                {formatCoordinateValue(locationData.newLatitude)}, {formatCoordinateValue(locationData.newLongitude)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    ) : selectedRequest.requestType === 'TRANSFER_OWNERSHIP' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Current Location */}
                            <div>
                                <h5 className="font-medium text-gray-800 mb-3">Current Location</h5>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Shop Name:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.currentShopName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Address:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.currentStreetAddress || selectedRequest.deviceDetails?.streetAddress || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">City:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.currentCity || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* New Location */}
                            <div>
                                <h5 className="font-medium text-gray-800 mb-3">New Location</h5>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Shop Name:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.newShopName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Address:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.newStreetAddress || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">City:</span>
                                        <p className="text-gray-900">{selectedRequest.deviceDetails?.newCity || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <span className="text-sm font-medium text-gray-700">Address:</span>
                                <p className="text-gray-900">{selectedRequest.deviceDetails?.streetAddress || selectedRequest.deviceDetails?.newStreetAddress || 'N/A'}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-700">City:</span>
                                <p className="text-gray-900">{selectedRequest.deviceDetails?.city || selectedRequest.deviceDetails?.newCity || 'N/A'}</p>
                            </div>
                        </div>
                    )}
                    
                    {/* Coordinates (if available) */}
                    {(selectedRequest.deviceDetails?.coordinates || selectedRequest.deviceDetails?.newCoordinates) && (
                        <div className="mt-4">
                            <h5 className="font-medium text-gray-800 mb-2">Coordinates</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {selectedRequest.deviceDetails?.coordinates && (
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">
                                            {selectedRequest.requestType === 'TRANSFER_OWNERSHIP' ? 'Current Location:' : 'Location:'}
                                        </span>
                                        <p className="text-gray-900 font-mono text-xs">
                                            {selectedRequest.deviceDetails.coordinates.lat}, {selectedRequest.deviceDetails.coordinates.lng}
                                        </p>
                                    </div>
                                )}
                                {selectedRequest.requestType === 'TRANSFER_OWNERSHIP' && selectedRequest.deviceDetails?.newCoordinates && (
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">New Location:</span>
                                        <p className="text-gray-900 font-mono text-xs">
                                            {selectedRequest.deviceDetails.newCoordinates.lat}, {selectedRequest.deviceDetails.newCoordinates.lng}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}                            {/* Shop Images */}
                            {(selectedRequest.deviceDetails?.shopInsideImage || 
                              selectedRequest.deviceDetails?.shopOutsideImage ||
                              selectedRequest.deviceDetails?.shopInsideImageUrl || 
                              selectedRequest.deviceDetails?.shopOutsideImageUrl ||
                              selectedRequest.deviceDetails?.insideImageUrl ||
                              selectedRequest.deviceDetails?.outsideImageUrl ||
                              selectedRequest.shopInsideImageUrl ||
                              selectedRequest.shopOutsideImageUrl) && (
                                <div className="mt-6">
                                    <h4 className="font-medium text-gray-900 border-b pb-2 mb-4">Shop Images</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {(selectedRequest.deviceDetails?.shopInsideImage ||
                                          selectedRequest.deviceDetails?.shopInsideImageUrl || 
                                          selectedRequest.deviceDetails?.insideImageUrl ||
                                          selectedRequest.shopInsideImageUrl) && (
                                            <div>
                                                <p className="text-sm font-medium text-gray-700 mb-2">Inside Image</p>
                                                <img 
                                                    src={selectedRequest.deviceDetails?.shopInsideImage ||
                                                         selectedRequest.deviceDetails?.shopInsideImageUrl || 
                                                         selectedRequest.deviceDetails?.insideImageUrl ||
                                                         selectedRequest.shopInsideImageUrl} 
                                                    alt="Shop Inside" 
                                                    className="w-full h-48 object-cover rounded-lg border"
                                                    onError={(e) => {
                                                        console.log('Failed to load inside image:', e.target.src);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        )}
                                        {(selectedRequest.deviceDetails?.shopOutsideImage ||
                                          selectedRequest.deviceDetails?.shopOutsideImageUrl ||
                                          selectedRequest.deviceDetails?.outsideImageUrl ||
                                          selectedRequest.shopOutsideImageUrl) && (
                                            <div>
                                                <p className="text-sm font-medium text-gray-700 mb-2">Outside Image</p>
                                                <img 
                                                    src={selectedRequest.deviceDetails?.shopOutsideImage ||
                                                         selectedRequest.deviceDetails?.shopOutsideImageUrl ||
                                                         selectedRequest.deviceDetails?.outsideImageUrl ||
                                                         selectedRequest.shopOutsideImageUrl} 
                                                    alt="Shop Outside" 
                                                    className="w-full h-48 object-cover rounded-lg border"
                                                    onError={(e) => {
                                                        console.log('Failed to load outside image:', e.target.src);
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EnhancedRequestList;
