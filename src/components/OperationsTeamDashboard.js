import React, { useState, useEffect, useMemo } from 'react';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs,
    getDoc,
    limit,
    updateDoc,
    doc,
    Timestamp 
} from 'firebase/firestore';
import { 
    CheckCircle, 
    XCircle, 
    FileEdit, 
    MapPin, 
    Calendar, 
    User, 
    Building, 
    Smartphone,
    Search,
    Filter,
    Clock,
    AlertCircle,
    RefreshCw,
    Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// Utility function to safely convert timestamps
const safeToDate = (timestamp) => {
    if (!timestamp) return null;
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            return timestamp.toDate();
        } catch (error) {
            console.warn('Error converting Firestore timestamp:', error);
            return null;
        }
    }
    
    // Handle JavaScript Date objects
    if (timestamp instanceof Date) {
        return timestamp;
    }
    
    // Handle string timestamps
    if (typeof timestamp === 'string') {
        try {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            console.warn('Error parsing string timestamp:', error);
            return null;
        }
    }
    
    // Handle Unix timestamps (numbers)
    if (typeof timestamp === 'number') {
        try {
            return new Date(timestamp * 1000); // Convert seconds to milliseconds
        } catch (error) {
            console.warn('Error converting number timestamp:', error);
            return null;
        }
    }
    
    return null;
};

// Enhanced data extraction utility for different request types
const extractRequestData = (request) => {
    const requestType = request.requestType || request.type || 'NEW_MAPPING';
    
    console.log('Extracting data for request:', {
        id: request.id,
        requestType,
        hasCurrentMapping: !!request.currentMapping,
        hasBdoDetails: !!request.bdoDetails,
        hasDeviceDetails: !!request.deviceDetails
    });
    
    switch (requestType) {
        case 'DE_MAPPING':
            return {
                bdoName: request.currentMapping?.bdoDetails?.name || 
                         request.bdoDetails?.name || 
                         request.bdoName || 'Not Available',
                bdoId: request.currentMapping?.bdoDetails?.bdoId || 
                       request.bdoDetails?.bdoId || 
                       request.bdoId || 'Not Available',
                cnic: request.currentMapping?.bdoDetails?.cnic || 
                      request.bdoDetails?.cnic || 
                      request.bdoCnic || 
                      request.cnic || 'Not Available',
                mobile: request.currentMapping?.bdoDetails?.phoneNumber || 
                        request.bdoDetails?.otpMobileNumber || 
                        request.otpMobileNumber || 
                        request.mobile || 'Not Available',
                shopName: request.currentMapping?.locationDetails?.shopName || 
                          request.deviceDetails?.shopName || 
                          request.shopName || 'Not Available',
                city: request.currentMapping?.locationDetails?.city || 
                      request.deviceDetails?.city || 
                      request.city || 'Not Available',
                address: request.currentMapping?.locationDetails?.streetAddress || 
                         request.deviceDetails?.streetAddress || 
                         request.streetAddress || 'Not Available',
                imei: request.deviceInfo?.imei || 
                      request.currentMapping?.deviceInfo?.imei || 
                      request.deviceDetails?.imei || 
                      request.imei || 'Not Available'
            };
        case 'LOCATION_UPDATE':
            return {
                bdoName: request.currentMapping?.bdoDetails?.name ||
                         request.bdoDetails?.name ||
                         request.bdoName || 'Not Available',
                bdoId: request.currentMapping?.bdoDetails?.bdoId ||
                       request.bdoDetails?.bdoId ||
                       request.bdoId || 'Not Available',
                cnic: request.currentMapping?.bdoDetails?.cnic ||
                      request.bdoDetails?.cnic ||
                      request.bdoCnic ||
                      request.cnic || 'Not Available',
                mobile: request.currentMapping?.bdoDetails?.phoneNumber ||
                        request.bdoDetails?.otpMobileNumber ||
                        request.otpMobileNumber ||
                        request.mobile || 'Not Available',
                shopName: request.currentMapping?.locationDetails?.shopName ||
                          request.deviceDetails?.shopName ||
                          request.shopName || 'Not Available',
                city: request.currentMapping?.locationDetails?.city ||
                      request.deviceDetails?.city ||
                      request.city || 'Not Available',
                address: request.currentMapping?.locationDetails?.streetAddress ||
                         request.deviceDetails?.streetAddress ||
                         request.streetAddress || 'Not Available',
                imei: request.device?.imei ||
                      request.deviceInfo?.imei ||
                      request.currentMapping?.deviceInfo?.imei ||
                      request.deviceDetails?.imei ||
                      request.imei || 'Not Available',
                previousLatitude: request.previousLocation?.latitude ?? request.currentMapping?.locationDetails?.latitude ?? null,
                previousLongitude: request.previousLocation?.longitude ?? request.currentMapping?.locationDetails?.longitude ?? null,
                newLatitude: request.newLocation?.hasCoordinates ? request.newLocation.latitude : null,
                newLongitude: request.newLocation?.hasCoordinates ? request.newLocation.longitude : null,
                locationWillReset: request.newLocation?.resetToNull === true || request.newLocation?.hasCoordinates === false,
                locationChangeReason: request.locationChangeReason || request.locationChangeDetails?.locationChangeReason || ''
            };
        case 'OTP_CHANGE':
            return {
                bdoName: request.bdoDetails?.name || request.bdoName || 'Not Available',
                bdoId: request.bdoDetails?.bdoId || request.bdoId || 'Not Available',
                cnic: request.bdoDetails?.cnicNumber || request.bdoDetails?.cnic || request.cnicNumber || request.cnic || 'Not Available',
                mobile: request.newOTP || request.bdoDetails?.newOtpMobileNumber || request.newOtpMobileNumber || 'Not Available',
                currentMobile: request.currentOTP || request.bdoDetails?.otpMobileNumber || request.otpMobileNumber || 'Not Available',
                newMobile: request.newOTP || request.bdoDetails?.newOtpMobileNumber || request.newOtpMobileNumber || 'Not Available',
                // Add previousOTP and newOTP for the banner
                previousOTP: request.currentOTP || request.bdoDetails?.currentOtpMobileNumber || request.bdoDetails?.otpMobileNumber || 'Not Available',
                newOTP: request.newOTP || request.bdoDetails?.newOtpMobileNumber || 'Not Available',
                shopName: request.deviceDetails?.shopName || request.shopDetails?.name || request.shopName || 'Not Available',
                city: request.deviceDetails?.city || request.shopDetails?.city || request.city || 'Not Available',
                address: request.deviceDetails?.streetAddress || request.deviceDetails?.address || request.streetAddress || request.address || 'Not Available',
                imei: request.deviceDetails?.imei || request.deviceInfo?.imei || request.imei || 'Not Available'
            };
        case 'TRANSFER_OWNERSHIP':
            console.log('TRANSFER_OWNERSHIP extraction - transferDetails:', request.transferDetails);
            console.log('TRANSFER_OWNERSHIP extraction - sourceBdoId:', request.transferDetails?.sourceBdoId);
            console.log('TRANSFER_OWNERSHIP extraction - sourceBdoName:', request.transferDetails?.sourceBdoName);
            
            return {
                // NEW BDO details (the target of the transfer)
                bdoName: request.bdoDetails?.name || request.bdoName || 'Not Available',
                bdoId: request.bdoDetails?.bdoId || request.bdoId || 'Not Available',
                cnic: request.bdoDetails?.cnicNumber || request.bdoDetails?.cnic || request.cnicNumber || request.cnic || 'Not Available',
                mobile: request.bdoDetails?.otpMobileNumber || request.mobile || 'Not Available',
                
                // NEW location details
                shopName: request.deviceDetails?.newShopName || request.deviceDetails?.shopName || request.shopName || 'Not Available',
                city: request.deviceDetails?.newCity || request.deviceDetails?.city || request.city || 'Not Available',
                address: request.deviceDetails?.newStreetAddress || request.deviceDetails?.streetAddress || request.streetAddress || 'Not Available',
                
                // Device info
                imei: request.deviceDetails?.imei || request.imei || 'Not Available',
                
                // OLD BDO details (for transfer banner) - extract from transferDetails
                oldBdoName: request.transferDetails?.sourceBdoName || 
                           request.currentMapping?.bdoName || 
                           request.oldBdoDetails?.name || 
                           'Previous BDO',
                oldBdoId: request.transferDetails?.sourceBdoId || 
                         request.currentMapping?.bdoId || 
                         request.oldBdoDetails?.bdoId || 
                         'Previous ID',
                
                // Transfer reason - extract from transferDetails
                transferReason: request.transferDetails?.transferReason || 
                               request.transferDetails?.transferJustification ||
                               request.deviceDetails?.transferReason || 
                               request.transferReason || 
                               'Not specified'
            };
        default:
            return {
                bdoName: request.bdoDetails?.name || request.bdoName || 'Not Available',
                bdoId: request.bdoDetails?.bdoId || request.bdoId || 'Not Available',
                cnic: request.bdoDetails?.cnicNumber || request.bdoDetails?.cnic || request.cnicNumber || request.cnic || 'Not Available',
                mobile: request.bdoDetails?.otpMobileNumber || request.mobile || 'Not Available',
                shopName: request.deviceDetails?.shopName || request.shopName || 'Not Available',
                city: request.deviceDetails?.city || request.city || 'Not Available',
                address: request.deviceDetails?.streetAddress || request.streetAddress || 'Not Available',
                imei: request.deviceDetails?.imei || request.imei || 'Not Available'
            };
    }
};

// Simple Status Pill Component
const EnhancedStatusPill = ({ status, statusConfig, size = 'md' }) => {
    const config = statusConfig?.[status] || { 
        label: status, 
        color: 'bg-gray-100 text-gray-800', 
        icon: '❓' 
    };

    const sizeClasses = size === 'lg' ? 'px-4 py-2 text-sm' : 'px-2 py-1 text-xs';

    return (
        <span className={`inline-flex items-center rounded-full font-medium ${config.color} ${sizeClasses}`}>
            <span className="mr-1">{config.icon}</span>
            {config.label}
        </span>
    );
};

// Request types for operations team
const REQUEST_TYPES = {
    NEW_MAPPING: 'NEW_MAPPING',
    TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
    OTP_CHANGE: 'OTP_CHANGE',
    FAULTY_REPLACEMENT: 'FAULTY_REPLACEMENT',
    DEVICE_RETURN: 'DEVICE_RETURN',
    LOCATION_UPDATE: 'LOCATION_UPDATE',
    DE_MAPPING: 'DE_MAPPING'
};

// Request type configuration
const REQUEST_TYPE_CONFIG = {
    [REQUEST_TYPES.NEW_MAPPING]: {
        label: 'New Device Mapping',
        icon: '📱',
        color: 'bg-blue-100 text-blue-800'
    },
    [REQUEST_TYPES.TRANSFER_OWNERSHIP]: {
        label: 'Transfer of Ownership',
        icon: '🔄',
        color: 'bg-green-100 text-green-800'
    },
    [REQUEST_TYPES.OTP_CHANGE]: {
        label: 'OTP Mobile Change',
        icon: '📞',
        color: 'bg-orange-100 text-orange-800'
    },
    [REQUEST_TYPES.FAULTY_REPLACEMENT]: {
        label: 'Device Replacement',
        icon: '🔧',
        color: 'bg-purple-100 text-purple-800'
    },
    [REQUEST_TYPES.DEVICE_RETURN]: {
        label: 'Device Return',
        icon: '📦',
        color: 'bg-red-100 text-red-800'
    },
    [REQUEST_TYPES.LOCATION_UPDATE]: {
        label: 'Location Change',
        icon: '📍',
        color: 'bg-yellow-100 text-yellow-800'
    },
    [REQUEST_TYPES.DE_MAPPING]: {
        label: 'Device De-mapping',
        icon: '🔓',
        color: 'bg-red-100 text-red-800'
    }
};

// Request statuses for operations team (using actual database values)
const OPERATIONS_STATUSES = {
    SALES_APPROVED: 'Sales Approved',
    OPS_REVIEW: 'Operations Review',
    OPS_APPROVED: 'Operations Approved', 
    OPS_REJECTED: 'Operations Rejected',
    IN_PROCESSING: 'In Processing',
    COMPLETED: 'Completed',
    NEEDS_REVISION: 'Needs Revision',
    ON_HOLD: 'On Hold'
};

const STATUS_CONFIG = {
    [OPERATIONS_STATUSES.SALES_APPROVED]: {
        label: 'Sales Approved',
        color: 'bg-blue-100 text-blue-800',
        icon: '📋'
    },
    [OPERATIONS_STATUSES.OPS_REVIEW]: {
        label: 'Operations Review',
        color: 'bg-yellow-100 text-yellow-800',
        icon: '👀'
    },
    [OPERATIONS_STATUSES.IN_PROCESSING]: {
        label: 'In Processing',
        color: 'bg-orange-100 text-orange-800',
        icon: '⚡'
    },
    [OPERATIONS_STATUSES.COMPLETED]: {
        label: 'Completed',
        color: 'bg-green-100 text-green-800',
        icon: '✅'
    },
    [OPERATIONS_STATUSES.OPS_REJECTED]: {
        label: 'Operations Rejected',
        color: 'bg-red-100 text-red-800',
        icon: '❌'
    },
    [OPERATIONS_STATUSES.NEEDS_REVISION]: {
        label: 'Needs Revision',
        color: 'bg-purple-100 text-purple-800',
        icon: '🔄'
    },
    [OPERATIONS_STATUSES.ON_HOLD]: {
        label: 'On Hold',
        color: 'bg-gray-100 text-gray-800',
        icon: '⏸️'
    },
    // Database format statuses (underscore format)
    'IN_PROCESSING': {
        label: 'In Processing',
        color: 'bg-orange-100 text-orange-800',
        icon: '⚡'
    },
    'COMPLETED': {
        label: 'Completed',
        color: 'bg-green-100 text-green-800',
        icon: '✅'
    },
    'SALES_APPROVED': {
        label: 'Sales Approved',
        color: 'bg-blue-100 text-blue-800',
        icon: '📋'
    },
    'OPS_REVIEW': {
        label: 'Operations Review',
        color: 'bg-yellow-100 text-yellow-800',
        icon: '👀'
    },
    'OPS_REJECTED': {
        label: 'Operations Rejected',
        color: 'bg-red-100 text-red-800',
        icon: '❌'
    },
    [OPERATIONS_STATUSES.OPS_APPROVED]: {
        label: 'Operations Approved',
        color: 'bg-green-100 text-green-800',
        icon: '✅'
    }
};

// Excel Generation Function for Operations Request
const generateExcelFile = (request) => {
    try {
        // Extract data safely from request
        const reqType = request.requestType || request.type || 'NEW_MAPPING';
        
        // For Transfer of Ownership, use NEW BDO details
        let bdoId, cnic, bdoName, otpMobileNumber, streetAddress, city;
        
        if (reqType === 'TRANSFER_OWNERSHIP') {
            // Use NEW BDO details for transfer requests
            bdoId = request.bdoDetails?.bdoId || request.bdoId || '';
            cnic = request.bdoDetails?.cnicNumber || request.bdoDetails?.cnic || request.cnicNumber || request.cnic || '';
            bdoName = request.bdoDetails?.name || request.bdoName || '';
            otpMobileNumber = request.bdoDetails?.otpMobileNumber || request.mobile || '';
            
            // Use NEW location details for transfer requests
            streetAddress = request.finalAddress || request.deviceDetails?.newStreetAddress || request.deviceDetails?.streetAddress || request.streetAddress || '';
            city = request.finalCity || request.deviceDetails?.newCity || request.deviceDetails?.city || request.city || '';
        } else {
            // Use regular extraction for other request types
            bdoId = request.bdoDetails?.bdoId || request.bdoId || '';
            cnic = request.bdoDetails?.cnicNumber || request.bdoDetails?.cnic || request.cnicNumber || request.cnic || '';
            bdoName = request.bdoDetails?.name || request.bdoName || '';
            
            // For OTP_CHANGE requests, use the new OTP number
            if (reqType === 'OTP_CHANGE') {
                otpMobileNumber = request.newOTP || request.bdoDetails?.newOtpMobileNumber || request.newOtpMobileNumber || 
                                 request.bdoDetails?.otpMobileNumber || request.mobile || '';
            } else {
                otpMobileNumber = request.bdoDetails?.otpMobileNumber || request.mobile || '';
            }
            
            // Use enhanced data if available (from devices collection), otherwise fallback to request data
            streetAddress = request.finalAddress || request.deviceDetails?.streetAddress || request.streetAddress || '';
            city = request.finalCity || request.deviceDetails?.city || request.city || '';
        }
        
        const franchiseCode = request.franchiseCode || '';
        const imei = request.deviceDetails?.imei || request.deviceInfo?.imei || request.imei || '';
        
        // Extract coordinates
        const getCoordinates = () => {
            const coords = request.deviceDetails?.coordinates || 
                         request.deviceDetails?.shopLocation || 
                         request.shopLocation || 
                         request.locationInfo?.coordinates ||
                         (request.latitude && request.longitude ? {
                             latitude: parseFloat(request.latitude),
                             longitude: parseFloat(request.longitude)
                         } : null);
            
            if (coords) {
                const lat = coords.lat || coords.latitude;
                const lng = coords.lng || coords.longitude;
                
                if (lat && lng) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng)
                    };
                }
            }
            return { latitude: '', longitude: '' };
        };

        const coordinates = getCoordinates();
        const requestType = request.requestType || request.type || 'NEW_MAPPING';

        // Create Excel data with headers and values
        const headers = [
            'Franchise ID',
            'RetailerID', 
            'RegionID',
            'RetailerCNIC',
            'RetailerEload',
            'Device Make/Model',
            'DeviceIMEI',
            'DeviceMsisdn',
            'Name',
            'GPS Enabled',
            'LFD Enabled',
            'CSC_Franchise_Retailer_id',
            'District ID',
            'Enable_Geo_Fencing',
            'Enable_3FA',
            'Retailer Address',
            'City',
            'Primary Lat',
            'Primary Long',
            'Allowed Radius (m)',
            'Geo Bit via Lat/Long',
            'Reset Bit',
            'Retailer Type'
        ];

        const dataRow = [
            franchiseCode,                                    // Franchise ID
            bdoId,                                           // RetailerID
            '',                                              // RegionID (null)
            cnic,                                            // RetailerCNIC
            otpMobileNumber,                                 // RetailerEload
            '',                                              // Device Make/Model (null)
            imei,                                            // DeviceIMEI
            '',                                              // DeviceMsisdn (null)
            bdoName,                                         // Name
            'Yes',                                           // GPS Enabled
            'Yes',                                           // LFD Enabled
            `CSC_${franchiseCode}_${bdoId}`,                // CSC_Franchise_Retailer_id
            '',                                              // District ID (null)
            'No',                                            // Enable_Geo_Fencing
            'No',                                            // Enable_3FA
            streetAddress,                                   // Retailer Address
            city,                                            // City
            coordinates.latitude,                            // Primary Lat
            coordinates.longitude,                           // Primary Long
            '100',                                           // Allowed Radius (m)
            'Yes',                                           // Geo Bit via Lat/Long
            'No',                                            // Reset Bit
            '1'                                              // Retailer Type
        ];

        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers, dataRow]);

        // Set column widths for better formatting
        const columnWidths = [
            { wch: 12 }, // Franchise ID
            { wch: 15 }, // RetailerID
            { wch: 10 }, // RegionID
            { wch: 15 }, // RetailerCNIC
            { wch: 15 }, // RetailerEload
            { wch: 18 }, // Device Make/Model
            { wch: 18 }, // DeviceIMEI
            { wch: 15 }, // DeviceMsisdn
            { wch: 20 }, // Name
            { wch: 12 }, // GPS Enabled
            { wch: 12 }, // LFD Enabled
            { wch: 25 }, // CSC_Franchise_Retailer_id
            { wch: 12 }, // District ID
            { wch: 18 }, // Enable_Geo_Fencing
            { wch: 12 }, // Enable_3FA
            { wch: 30 }, // Retailer Address
            { wch: 15 }, // City
            { wch: 12 }, // Primary Lat
            { wch: 12 }, // Primary Long
            { wch: 18 }, // Allowed Radius (m)
            { wch: 20 }, // Geo Bit via Lat/Long
            { wch: 10 }, // Reset Bit
            { wch: 12 }  // Retailer Type
        ];
        worksheet['!cols'] = columnWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Mapping Data');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const requestTypeFormatted = requestType.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${requestTypeFormatted}_${bdoId}_${timestamp}.xlsx`;

        // Download the file
        XLSX.writeFile(workbook, filename);
        
        toast.success('Excel file downloaded successfully!');
        
    } catch (error) {
        console.error('Error generating Excel file:', error);
        toast.error('Failed to generate Excel file: ' + error.message);
    }
};

// Request Type Badge Component
const RequestTypePill = ({ requestType, size = 'md' }) => {
    const config = REQUEST_TYPE_CONFIG[requestType] || { 
        label: 'Unknown Type', 
        color: 'bg-gray-100 text-gray-800', 
        icon: '❓' 
    };

    const sizeClasses = size === 'lg' ? 'px-4 py-2 text-sm' : 
                       size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm';

    return (
        <span className={`inline-flex items-center rounded-full font-medium ${config.color} ${sizeClasses}`}>
            <span className="mr-1">{config.icon}</span>
            {config.label}
        </span>
    );
};

// Operations Request Detail Component
const OperationsRequestDetail = ({ request, user, db, onRefresh, onStatusUpdate, actionLoading }) => {
    const [deviceData, setDeviceData] = useState(null);
    const [deviceLoading, setDeviceLoading] = useState(false);
    
    // Use enhanced data extraction
    const extractedData = extractRequestData(request);
    const {
        bdoName,
        bdoId,
        cnic,
        mobile,
        shopName,
        city,
        address,
        imei
    } = extractedData;
    
    const franchiseName = request.franchiseName || 'Not specified';

    // Fetch device data only when the request itself does not already contain the required data.
    useEffect(() => {
        const fetchDeviceData = async () => {
            if (!imei || imei === 'Not Available' || !db) return;

            // Read optimization: these workflows already carry their device snapshot.
            // Avoid an extra device read each time an Operations detail page is opened.
            if (['TRANSFER_OWNERSHIP', 'DE_MAPPING', 'LOCATION_UPDATE', 'OTP_CHANGE'].includes(request.requestType)) {
                return;
            }
            
            setDeviceLoading(true);
            try {
                const deviceRef = doc(db, 'devices', imei);
                const deviceSnap = await getDoc(deviceRef);
                
                if (deviceSnap.exists()) {
                    setDeviceData(deviceSnap.data());
                }
            } catch (error) {
                console.error('Error fetching device data:', error);
            } finally {
                setDeviceLoading(false);
            }
        };

        fetchDeviceData();
    }, [imei, db, request.requestType]);

    // Use device data for address if available
    const finalAddress = deviceData?.streetAddress || deviceData?.address || address;
    const finalShopName = deviceData?.shopName || shopName;
    const finalCity = deviceData?.city || city;

    // GPS coordinates - comprehensive extraction from multiple possible locations
    const getCoordinates = () => {
        const toCoordinate = (coords) => {
            if (!coords) return null;
            const lat = coords.lat ?? coords.latitude;
            const lng = coords.lng ?? coords.longitude;
            if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
            return { latitude: parsedLat, longitude: parsedLng };
        };

        if (request.requestType === 'LOCATION_UPDATE') {
            const newLocation = request.newLocation || request.locationChangeDetails?.newLocation;
            if (newLocation?.hasCoordinates) {
                const updatedCoords = toCoordinate(newLocation);
                if (updatedCoords) return updatedCoords;
            }
            const currentCoords = toCoordinate(request.currentMapping?.locationDetails || request.previousLocation);
            if (currentCoords) return currentCoords;
        }

        // For DE_MAPPING, try currentMapping first
        if (request.requestType === 'DE_MAPPING') {
            const currentCoords = toCoordinate(request.currentMapping?.locationDetails);
            if (currentCoords) return currentCoords;
        }
        
        // Check multiple possible coordinate locations with proper lat/lng structure
        const coords = request.deviceDetails?.coordinates || 
                     request.deviceDetails?.shopLocation || 
                     request.shopLocation || 
                     request.locationInfo?.coordinates ||
                     (request.latitude && request.longitude ? {
                         latitude: parseFloat(request.latitude),
                         longitude: parseFloat(request.longitude)
                     } : null);
        
        const parsedCoords = toCoordinate(coords);
        if (parsedCoords) return parsedCoords;
        return null;
    };

    const coordinates = getCoordinates();

    // Images
    const shopExteriorUrl = request.deviceDetails?.documents?.shopExterior || request.documents?.shopExterior;
    const shopInteriorUrl = request.deviceDetails?.documents?.shopInterior || request.documents?.shopInterior;

    // Premise relationship
    const premiseRelationship = request.deviceDetails?.premiseRelationship || request.premiseRelationship || 'Not specified';

    // Request type
    const requestType = request.requestType || request.type || 'NEW_MAPPING';

    // Check if Excel download should be available for this request type
    const showExcelDownload = ['NEW_MAPPING', 'TRANSFER_OWNERSHIP', 'OTP_CHANGE'].includes(requestType);

    // Handle Excel download
    const handleExcelDownload = async () => {
        // Create enhanced request with device data for Excel export
        const enhancedRequest = {
            ...request,
            deviceData: deviceData,
            finalAddress: finalAddress,
            finalCity: finalCity,
            finalShopName: finalShopName
        };
        generateExcelFile(enhancedRequest);
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Header */}
            <div className="border-b border-gray-200 pb-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center">
                            <Smartphone className="w-5 h-5 mr-2" />
                            {imei}
                        </h3>
                        <p className="text-sm text-gray-600">Request ID: {request.requestNumber || request.id}</p>
                    </div>
                    <EnhancedStatusPill status={request.status} statusConfig={STATUS_CONFIG} size="lg" />
                </div>
                {/* Request Type Badge */}
                <div className="flex items-center">
                    <RequestTypePill requestType={requestType} size="lg" />
                </div>
            </div>

            {/* OTP Change Summary Banner */}
            {request.requestType === 'OTP_CHANGE' && extractedData.previousOTP && extractedData.newOTP && (
                <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                        <div className="bg-blue-100 rounded-full p-2 mr-3">
                            <span className="text-blue-600 font-bold text-lg">📱</span>
                        </div>
                        <h4 className="font-semibold text-blue-900">OTP Mobile Number Change</h4>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                            <span className="text-gray-600 text-sm mr-2">Previous:</span>
                            <span className="bg-gray-100 px-3 py-1 rounded-md font-mono text-sm text-gray-700">
                                {extractedData.previousOTP}
                            </span>
                        </div>
                        <div className="text-blue-500 font-bold text-lg">→</div>
                        <div className="flex items-center">
                            <span className="text-gray-600 text-sm mr-2">New:</span>
                            <span className="bg-green-100 border border-green-300 px-3 py-1 rounded-md font-mono text-sm text-green-800 font-semibold shadow-sm">
                                {extractedData.newOTP}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Transfer of Ownership Summary Banner */}
            {request.requestType === 'TRANSFER_OWNERSHIP' && extractedData.bdoId && (
                <div className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center mb-3">
                        <div className="bg-purple-100 rounded-full p-2 mr-3">
                            <span className="text-purple-600 font-bold text-lg">🔄</span>
                        </div>
                        <h4 className="font-semibold text-purple-900">Device Transfer of Ownership</h4>
                    </div>
                    <div className="space-y-3">
                        {/* Show transfer flow if we have old BDO info */}
                        {extractedData.oldBdoId && extractedData.oldBdoId !== 'Previous ID' ? (
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center">
                                    <span className="text-gray-600 text-sm mr-2">From BDO:</span>
                                    <span className="bg-gray-100 px-3 py-1 rounded-md font-mono text-sm text-gray-700">
                                        {extractedData.oldBdoId} - {extractedData.oldBdoName}
                                    </span>
                                </div>
                                <div className="text-purple-500 font-bold text-lg">→</div>
                                <div className="flex items-center">
                                    <span className="text-gray-600 text-sm mr-2">To BDO:</span>
                                    <span className="bg-green-100 border border-green-300 px-3 py-1 rounded-md font-mono text-sm text-green-800 font-semibold shadow-sm">
                                        {extractedData.bdoId} - {extractedData.bdoName}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            /* Show only new BDO if old info not available */
                            <div className="flex items-center">
                                <span className="text-gray-600 text-sm mr-2">Transferring to BDO:</span>
                                <span className="bg-green-100 border border-green-300 px-3 py-1 rounded-md font-mono text-sm text-green-800 font-semibold shadow-sm">
                                    {extractedData.bdoId} - {extractedData.bdoName}
                                </span>
                            </div>
                        )}
                        {extractedData.transferReason && extractedData.transferReason !== 'Not specified' && (
                            <div className="bg-purple-50 px-3 py-2 rounded-md">
                                <span className="text-purple-700 text-sm font-medium">Reason: </span>
                                <span className="text-purple-600 text-sm">{extractedData.transferReason}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Location Change Summary Banner */}
            {request.requestType === 'LOCATION_UPDATE' && (
                <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center mb-3">
                        <div className="bg-yellow-100 rounded-full p-2 mr-3">
                            <span className="text-yellow-700 font-bold text-lg">📍</span>
                        </div>
                        <h4 className="font-semibold text-yellow-900">Location Change Request</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="bg-white/70 rounded-md p-3">
                            <span className="text-gray-600 block mb-1">Current coordinates</span>
                            <span className="font-mono text-gray-900">
                                {extractedData.previousLatitude ?? 'null'}, {extractedData.previousLongitude ?? 'null'}
                            </span>
                        </div>
                        <div className="bg-white/70 rounded-md p-3">
                            <span className="text-gray-600 block mb-1">Requested action</span>
                            {extractedData.locationWillReset ? (
                                <span className="font-medium text-orange-800">Reset latitude and longitude to null</span>
                            ) : (
                                <span className="font-mono text-green-800">
                                    {extractedData.newLatitude}, {extractedData.newLongitude}
                                </span>
                            )}
                        </div>
                    </div>
                    {extractedData.locationChangeReason && (
                        <div className="mt-3 bg-yellow-50 px-3 py-2 rounded-md">
                            <span className="text-yellow-800 text-sm font-medium">Remarks: </span>
                            <span className="text-yellow-700 text-sm">{extractedData.locationChangeReason}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Device Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                        <Smartphone className="w-4 h-4 mr-2" />
                        Device Information
                    </h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600">IMEI:</span>
                            <span className="font-medium">{imei}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New Shop Name:' : 'Shop Name:'}</span>
                            <span className="font-medium">
                                {deviceLoading ? 'Loading...' : finalShopName}
                                {deviceData && deviceData.shopName && request.requestType !== 'TRANSFER_OWNERSHIP' && <span className="text-green-600 text-xs ml-1">✓ From devices</span>}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">Premise Relationship:</span>
                            <span className="font-medium">{premiseRelationship}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        {request.requestType === 'TRANSFER_OWNERSHIP' ? 'New BDO/Retailer Information' : 'BDO/Retailer Information'}
                    </h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New Name:' : 'Name:'}</span>
                            <span className="font-medium">{bdoName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New BDO ID:' : 'BDO ID:'}</span>
                            <span className="font-medium">{bdoId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New CNIC:' : 'CNIC:'}</span>
                            <span className="font-medium">{cnic}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New Mobile:' : 'Mobile:'}</span>
                            <span className="font-medium">{mobile}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Location Information */}
            <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    {request.requestType === 'TRANSFER_OWNERSHIP' ? 'New Location Information' : 'Location Information'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New City:' : 'City:'}</span>
                        <span className="font-medium">
                            {deviceLoading ? 'Loading...' : finalCity}
                            {deviceData && deviceData.city && request.requestType !== 'TRANSFER_OWNERSHIP' && <span className="text-green-600 text-xs ml-1">✓ From devices</span>}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Franchise:</span>
                        <span className="font-medium">{franchiseName}</span>
                    </div>
                    <div className="md:col-span-2">
                        <div className="flex justify-between">
                            <span className="text-gray-600">{request.requestType === 'TRANSFER_OWNERSHIP' ? 'New Address:' : 'Address:'}</span>
                            <span className="font-medium text-right">
                                {deviceLoading ? 'Loading...' : finalAddress}
                                {deviceData && (deviceData.streetAddress || deviceData.address) && request.requestType !== 'TRANSFER_OWNERSHIP' && <span className="text-green-600 text-xs ml-1">✓ From devices</span>}
                            </span>
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <div className="flex justify-between">
                            <span className="text-gray-600">GPS Coordinates:</span>
                            <span className="font-medium">
                                {coordinates ? (
                                    <span className="flex items-center">
                                        <MapPin className="w-4 h-4 mr-1 text-green-500" />
                                        Lat: {coordinates.latitude.toFixed(6)}, 
                                        Lng: {coordinates.longitude.toFixed(6)}
                                    </span>
                                ) : (
                                    <span className="text-red-500">Not Available</span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Images */}
            {(shopExteriorUrl || shopInteriorUrl) && (
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900">Shop Images</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {shopExteriorUrl && (
                            <div>
                                <p className="text-sm text-gray-600 mb-2">Shop Exterior</p>
                                <img 
                                    src={shopExteriorUrl} 
                                    alt="Shop Exterior"
                                    className="w-full h-48 object-cover rounded-lg border border-gray-200"
                                />
                            </div>
                        )}
                        {shopInteriorUrl && (
                            <div>
                                <p className="text-sm text-gray-600 mb-2">Shop Interior</p>
                                <img 
                                    src={shopInteriorUrl} 
                                    alt="Shop Interior"
                                    className="w-full h-48 object-cover rounded-lg border border-gray-200"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Operations Notes */}
            {request.operationsNotes && (
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900">Operations Notes</h4>
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-700">{request.operationsNotes}</p>
                    </div>
                </div>
            )}

            {/* Excel Download Section */}
            {showExcelDownload && (
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                        <Download className="w-4 h-4 mr-2" />
                        Export Data
                    </h4>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-900">Excel Export</p>
                                <p className="text-xs text-blue-700">
                                    Download mapping data in Excel format for system integration
                                </p>
                            </div>
                            <button
                                onClick={handleExcelDownload}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Excel</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Timestamps */}
            <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Timeline
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Created:</span>
                        <span className="font-medium">
                            {safeToDate(request.createdAt)?.toLocaleString() || 'Not Available'}
                        </span>
                    </div>
                    {request.assignedToOperationsAt && (
                        <div className="flex justify-between">
                            <span className="text-gray-600">Assigned to Operations:</span>
                            <span className="font-medium">
                                {safeToDate(request.assignedToOperationsAt)?.toLocaleString() || 'Not Available'}
                            </span>
                        </div>
                    )}
                    {request.updatedAt && (
                        <div className="flex justify-between">
                            <span className="text-gray-600">Last Updated:</span>
                            <span className="font-medium">
                                {safeToDate(request.updatedAt)?.toLocaleString() || 'Not Available'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Main Operations Team Dashboard Component
export default function OperationsTeamDashboard({ user, appServices, db, auth }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [requestTypeFilter, setRequestTypeFilter] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionLoading, setActionLoading] = useState({});

    // Calculate 7 days ago timestamp
    const sevenDaysAgo = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        date.setHours(0, 0, 0, 0);
        return Timestamp.fromDate(date);
    }, []);

    // Fetch operations team requests (assigned in last 7 days)
    const fetchRequests = async () => {
        try {
            setLoading(true);
            console.log('[OperationsTeamDashboard] Fetching requests assigned in last 7 days...');
            console.log('[OperationsTeamDashboard] Query filters:', {
                assignedTo: 'Operations Team',
                assignedToOperationsAtGte: sevenDaysAgo,
                currentTime: new Date()
            });

            // Query for requests assigned to operations team in the last 7 days
            const q = query(
                collection(db, 'requestsV2'),
                where('assignedTo', '==', 'Operations Team'),
                where('assignedToOperationsAt', '>=', sevenDaysAgo),
                orderBy('assignedToOperationsAt', 'desc'),
                limit(50)
            );

            const snapshot = await getDocs(q);
            const requestsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log(`[OperationsTeamDashboard] Fetched ${requestsData.length} requests`);
            if (requestsData.length > 0) {
                console.log('[OperationsTeamDashboard] Sample request data:', requestsData[0]);
                console.log('[OperationsTeamDashboard] Request structure analysis:', {
                    hasCurrentMapping: !!requestsData[0].currentMapping,
                    hasBdoDetails: !!requestsData[0].bdoDetails,
                    hasDeviceDetails: !!requestsData[0].deviceDetails,
                    requestType: requestsData[0].requestType
                });
            }
            setRequests(requestsData);
        } catch (error) {
            console.error('[OperationsTeamDashboard] Error fetching requests:', error);
            toast.error('Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchRequests();
    }, []);

    // Filter requests based on search, status, and request type
    const filteredRequests = useMemo(() => {
        console.log(`[OperationsTeamDashboard] Filtering ${requests.length} requests with searchTerm: "${searchTerm}"`);
        
        return requests.filter(request => {
            // Extract data properly for each request type
            const extractedData = extractRequestData(request);
            
            const matchesSearch = !searchTerm || 
                extractedData.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.bdoName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.bdoId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.shopName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.cnic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                extractedData.mobile?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                request.franchiseName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                request.requestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                request.id?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = !statusFilter || request.status === statusFilter;
            
            const requestType = request.requestType || request.type || 'NEW_MAPPING';
            const matchesRequestType = !requestTypeFilter || requestType === requestTypeFilter;

            return matchesSearch && matchesStatus && matchesRequestType;
        });
    }, [requests, searchTerm, statusFilter, requestTypeFilter]);

    // Group requests by status for summary
    const statusCounts = useMemo(() => {
        return requests.reduce((acc, request) => {
            acc[request.status] = (acc[request.status] || 0) + 1;
            return acc;
        }, {});
    }, [requests]);

    // Group requests by request type for summary
    const requestTypeCounts = useMemo(() => {
        return requests.reduce((acc, request) => {
            const requestType = request.requestType || request.type || 'NEW_MAPPING';
            acc[requestType] = (acc[requestType] || 0) + 1;
            return acc;
        }, {});
    }, [requests]);

    // Handle status update actions
    const handleStatusUpdate = async (requestId, newStatus, reason = '') => {
        try {
            setActionLoading(prev => ({ ...prev, [requestId]: true }));

            const currentRequest = requests.find(r => r.id === requestId);
            if (!currentRequest) {
                throw new Error('Request not found');
            }

            console.log(`🚀 [OperationsTeamDashboard] Status update for ${requestId}: ${currentRequest.status} -> ${newStatus}`);

            // Handle different status transitions based on current status
            if (newStatus === OPERATIONS_STATUSES.IN_PROCESSING) {
                // Only use processOperationsReview if current status is OPS_REVIEW or SALES_APPROVED
                if (currentRequest.status === 'OPS_REVIEW' || currentRequest.status === OPERATIONS_STATUSES.SALES_APPROVED) {
                    console.log(`🚀 [OperationsTeamDashboard] Processing operations review for ${requestId}: APPROVED`);
                    
                    if (appServices?.workflowManager) {
                        await appServices.workflowManager.processOperationsReview(
                            requestId,
                            true, // approved
                            reason,
                            '' // externalPortalReference - could be added later
                        );
                        
                        // Update local state with workflow manager's status format
                        setRequests(prev => prev.map(req => 
                            req.id === requestId 
                                ? { ...req, status: 'IN_PROCESSING', updatedAt: Timestamp.now() }
                                : req
                        ));
                    } else {
                        throw new Error('Workflow manager not available');
                    }
                } else if (currentRequest.status === 'IN_PROCESSING') {
                    // Request is already in processing - no action needed
                    console.log(`ℹ️ [OperationsTeamDashboard] Request ${requestId} is already in processing status`);
                    toast.info('Request is already in processing status');
                    return;
                } else {
                    // Request is already processed, just update status directly
                    console.log(`🚀 [OperationsTeamDashboard] Request already processed, updating status directly`);
                    
                    // Map display status to workflow manager status format
                    const workflowStatus = newStatus === OPERATIONS_STATUSES.IN_PROCESSING ? 'IN_PROCESSING' : newStatus;
                    
                    const updateData = {
                        status: workflowStatus,
                        updatedAt: Timestamp.now()
                    };

                    if (reason) {
                        updateData.operationsNotes = reason;
                    }

                    await updateDoc(doc(db, 'requestsV2', requestId), updateData);
                    
                    // Update local state with workflow status format
                    setRequests(prev => prev.map(req => 
                        req.id === requestId 
                            ? { ...req, status: workflowStatus, updatedAt: Timestamp.now() }
                            : req
                    ));
                }
            } else if (newStatus === OPERATIONS_STATUSES.OPS_REJECTED) {
                // Only use processOperationsReview if current status is OPS_REVIEW or SALES_APPROVED
                if (currentRequest.status === 'OPS_REVIEW' || currentRequest.status === OPERATIONS_STATUSES.SALES_APPROVED) {
                    console.log(`🚀 [OperationsTeamDashboard] Processing operations review for ${requestId}: REJECTED`);
                    
                    if (appServices?.workflowManager) {
                        await appServices.workflowManager.processOperationsReview(
                            requestId,
                            false, // rejected
                            reason,
                            '' // externalPortalReference - could be added later
                        );
                        
                        // Update local state with workflow manager's status format
                        setRequests(prev => prev.map(req => 
                            req.id === requestId 
                                ? { ...req, status: 'OPS_REJECTED', updatedAt: Timestamp.now() }
                                : req
                        ));
                    } else {
                        throw new Error('Workflow manager not available');
                    }
                } else {
                    // Direct status update
                    const updateData = {
                        status: newStatus,
                        updatedAt: Timestamp.now(),
                        rejectionReason: reason
                    };

                    await updateDoc(doc(db, 'requestsV2', requestId), updateData);
                    
                    // Update local state
                    setRequests(prev => prev.map(req => 
                        req.id === requestId 
                            ? { ...req, status: newStatus, updatedAt: Timestamp.now() }
                            : req
                    ));
                }
            } else if (newStatus === OPERATIONS_STATUSES.COMPLETED) {
                // Use workflow manager's completeRequest method
                if (appServices?.workflowManager) {
                    console.log(`🏁 [OperationsTeamDashboard] Completing request ${requestId} with notes: ${reason}`);
                    await appServices.workflowManager.completeRequest(requestId, reason);
                    
                    // Update local state with workflow manager's status format
                    setRequests(prev => prev.map(req => 
                        req.id === requestId 
                            ? { ...req, status: 'COMPLETED', updatedAt: Timestamp.now() }
                            : req
                    ));
                } else {
                    // Fallback to direct update
                    const updateData = {
                        status: newStatus,
                        updatedAt: Timestamp.now(),
                        completedAt: Timestamp.now(),
                        completedBy: user.uid,
                        completionNotes: reason
                    };

                    await updateDoc(doc(db, 'requestsV2', requestId), updateData);
                    
                    // Update local state
                    setRequests(prev => prev.map(req => 
                        req.id === requestId 
                            ? { ...req, status: newStatus, updatedAt: Timestamp.now() }
                            : req
                    ));
                }
            } else {
                // For other status updates, use direct Firestore update
                const updateData = {
                    status: newStatus,
                    updatedAt: Timestamp.now(),
                    [`${newStatus}At`]: Timestamp.now(),
                    [`${newStatus}By`]: user.uid
                };

                if (reason) {
                    updateData.operationsNotes = reason;
                }

                await updateDoc(doc(db, 'requestsV2', requestId), updateData);

                // Log the action
                if (appServices?.actionLogger) {
                    await appServices.actionLogger.logAction({
                        action: 'status_update',
                        target: {
                            entityType: 'mapping_request',
                            entityId: requestId
                        },
                        details: {
                            previousStatus: currentRequest.status,
                            newStatus,
                            reason
                        }
                    });
                }
                
                // Update local state
                setRequests(prev => prev.map(req => 
                    req.id === requestId 
                        ? { ...req, status: newStatus, updatedAt: Timestamp.now() }
                        : req
                ));
            }

            const statusLabel = STATUS_CONFIG[newStatus]?.label || newStatus;
            toast.success(`Request ${statusLabel.toLowerCase()} successfully`);

        } catch (error) {
            console.error('[OperationsTeamDashboard] Error updating status:', error);
            toast.error('Failed to update request status: ' + error.message);
        } finally {
            setActionLoading(prev => ({ ...prev, [requestId]: false }));
        }
    };

    // Action handlers
    const handleMarkInProgress = (requestId) => {
        handleStatusUpdate(requestId, OPERATIONS_STATUSES.IN_PROCESSING);
    };

    const handleComplete = (requestId) => {
        // Complete the request with a note
        const completionNotes = prompt('Any completion notes (optional):') || '';
        
        if (appServices?.workflowManager) {
            console.log(`🏁 [OperationsTeamDashboard] Completing request ${requestId} with notes: ${completionNotes}`);
            handleCompleteRequest(requestId, completionNotes);
        } else {
            handleStatusUpdate(requestId, OPERATIONS_STATUSES.COMPLETED, completionNotes);
        }
    };

    const handleCompleteRequest = async (requestId, completionNotes) => {
        try {
            setActionLoading(prev => ({ ...prev, [requestId]: true }));
            
            await appServices.workflowManager.completeRequest(requestId, completionNotes);
            
            // Update local state with workflow manager's status format
            setRequests(prev => prev.map(req => 
                req.id === requestId 
                    ? { ...req, status: 'COMPLETED', updatedAt: Timestamp.now() }
                    : req
            ));
            
            toast.success('Request completed successfully');
        } catch (error) {
            console.error('[OperationsTeamDashboard] Error completing request:', error);
            toast.error('Failed to complete request: ' + error.message);
        } finally {
            setActionLoading(prev => ({ ...prev, [requestId]: false }));
        }
    };

    const handleReject = (requestId) => {
        const reason = prompt('Please provide a reason for rejection:');
        if (reason) {
            handleStatusUpdate(requestId, OPERATIONS_STATUSES.OPS_REJECTED, reason);
        }
    };

    const handleRequestRevision = (requestId) => {
        const reason = prompt('Please provide revision requirements:');
        if (reason) {
            handleStatusUpdate(requestId, OPERATIONS_STATUSES.NEEDS_REVISION, reason);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading operations requests...</p>
                </div>
            </div>
        );
    }

    // Show request detail view
    if (selectedRequest) {
        return (
            <div className="space-y-6">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => setSelectedRequest(null)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2"
                    >
                        <span>← Back to Dashboard</span>
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900">Operations Request Detail</h2>
                </div>

                <OperationsRequestDetail
                    request={selectedRequest}
                    user={user}
                    db={db}
                    onRefresh={fetchRequests}
                    onStatusUpdate={handleStatusUpdate}
                    actionLoading={actionLoading}
                />

                {/* Operations Actions */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Operations Actions</h3>
                    <div className="flex flex-wrap gap-3">
                        {(selectedRequest.status === OPERATIONS_STATUSES.SALES_APPROVED || 
                          selectedRequest.status === 'OPS_REVIEW') && (
                            <button
                                onClick={() => handleMarkInProgress(selectedRequest.id)}
                                disabled={actionLoading[selectedRequest.id]}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50"
                            >
                                <Clock className="w-4 h-4" />
                                <span>Mark In Processing</span>
                            </button>
                        )}

                        {[OPERATIONS_STATUSES.SALES_APPROVED, OPERATIONS_STATUSES.IN_PROCESSING, OPERATIONS_STATUSES.OPS_REVIEW].includes(selectedRequest.status) && (
                            <>
                                <button
                                    onClick={() => handleComplete(selectedRequest.id)}
                                    disabled={actionLoading[selectedRequest.id]}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Complete</span>
                                </button>

                                <button
                                    onClick={() => handleRequestRevision(selectedRequest.id)}
                                    disabled={actionLoading[selectedRequest.id]}
                                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50"
                                >
                                    <FileEdit className="w-4 h-4" />
                                    <span>Request Revision</span>
                                </button>

                                <button
                                    onClick={() => handleReject(selectedRequest.id)}
                                    disabled={actionLoading[selectedRequest.id]}
                                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50"
                                >
                                    <XCircle className="w-4 h-4" />
                                    <span>Reject</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Operations Team Dashboard</h2>
                        <p className="text-gray-600 mt-1">
                            Manage mapping requests assigned in the last 7 days
                        </p>
                    </div>
                    <button
                        onClick={fetchRequests}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Request Type Summary Cards */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Types Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(REQUEST_TYPE_CONFIG).map(([requestType, config]) => (
                        <div 
                            key={requestType} 
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                                requestTypeFilter === requestType 
                                    ? 'border-blue-500 bg-blue-50' 
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                            onClick={() => setRequestTypeFilter(requestTypeFilter === requestType ? '' : requestType)}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">{config.label}</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {requestTypeCounts[requestType] || 0}
                                    </p>
                                </div>
                                <span className="text-2xl">{config.icon}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by IMEI, BDO name/ID, shop name, city, CNIC, mobile, franchise..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={requestTypeFilter}
                        onChange={(e) => setRequestTypeFilter(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Request Types</option>
                        {Object.entries(REQUEST_TYPE_CONFIG).map(([requestType, config]) => (
                            <option key={requestType} value={requestType}>
                                {config.icon} {config.label} ({requestTypeCounts[requestType] || 0})
                            </option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                            <option key={status} value={status}>
                                {config.label} ({statusCounts[status] || 0})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Results Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">
                    Showing <strong>{filteredRequests.length}</strong> of <strong>{requests.length}</strong> operations requests from the last 7 days
                </p>
            </div>

            {/* Requests Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Request Details
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Request Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    BDO/Retailer
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Location
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Assigned Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRequests.map(request => {
                                const requestType = request.requestType || request.type || 'NEW_MAPPING';
                                const extractedData = extractRequestData(request);
                                
                                return (
                                    <tr key={request.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <Smartphone className="w-5 h-5 text-gray-400 mr-3" />
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {extractedData.imei}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {extractedData.shopName}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <RequestTypePill requestType={requestType} size="sm" />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <User className="w-4 h-4 text-gray-400 mr-2" />
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {extractedData.bdoName}
                                                    </div>
                                                    <div className="text-sm text-gray-500">{extractedData.bdoId}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                                                <div>
                                                    <div className="text-sm text-gray-900">{extractedData.city}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {request.franchiseName || 'Unknown Franchise'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <EnhancedStatusPill 
                                                status={request.status} 
                                                statusConfig={STATUS_CONFIG}
                                                size="sm" 
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                                                <span className="text-sm text-gray-500">
                                                    {safeToDate(request.assignedToOperationsAt)?.toLocaleDateString() || 'Not Available'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => setSelectedRequest(request)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                                >
                                                    View Details
                                                </button>

                                                {/* Quick Actions */}
                                                {(request.status === OPERATIONS_STATUSES.SALES_APPROVED || 
                                                  request.status === 'OPS_REVIEW' ||
                                                  request.status === 'SALES_APPROVED') && (
                                                    <button
                                                        onClick={() => handleMarkInProgress(request.id)}
                                                        disabled={actionLoading[request.id]}
                                                        className="text-yellow-600 hover:text-yellow-800 text-sm font-medium disabled:opacity-50"
                                                    >
                                                        Start
                                                    </button>
                                                )}

                                                {([OPERATIONS_STATUSES.SALES_APPROVED, OPERATIONS_STATUSES.IN_PROCESSING, OPERATIONS_STATUSES.OPS_REVIEW].includes(request.status) ||
                                                  ['IN_PROCESSING', 'SALES_APPROVED', 'OPS_REVIEW'].includes(request.status)) && (
                                                    <button
                                                        onClick={() => handleComplete(request.id)}
                                                        disabled={actionLoading[request.id]}
                                                        className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50"
                                                    >
                                                        Complete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {filteredRequests.length === 0 && (
                        <div className="text-center py-12">
                            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">
                                {requests.length === 0 
                                    ? 'No requests assigned to operations in the last 7 days'
                                    : 'No requests match your search criteria'
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
