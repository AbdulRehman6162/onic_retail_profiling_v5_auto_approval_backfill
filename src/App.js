import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getPerformance } from 'firebase/performance';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    updateDoc,
    setDoc,
    addDoc,
    query,
    where,
    getDocs,
    getDoc,
    writeBatch,
    Timestamp,
    orderBy,
    limit,
    runTransaction
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// --- Enhanced Utilities ---
import { ActionLogger, useActionLogger } from './utils/actionLogger';
import ConflictResolver from './utils/conflictResolver';
import { NotificationSystem, useNotificationSystem } from './utils/notificationSystem';
import RequestWorkflowManager from './utils/requestWorkflowManager';
// --- Enhanced Components ---
import NewFeaturesShowcase from './components/NewFeaturesShowcase';
import EnhancedRequestForm from './components/EnhancedRequestForm';
import EnhancedFranchiseDashboard from './components/EnhancedFranchiseDashboard';
import OperationsTeamDashboard from './components/OperationsTeamDashboard';
import MigrationAdminPanel from './components/MigrationAdminPanel';
import DeviceMigrationPanel from './components/DeviceMigrationPanel';
// --- Library Imports ---
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';
import JSZip from 'jszip';
import { Calendar } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import {
    CheckCircle, AlertCircle, Clock, User, FileText, MapPin, Edit, Phone,
    CreditCard, Building, Download, RefreshCw, ArrowLeft, Eye, XCircle,
    AlertTriangle, CheckCircle2, Hourglass, PlayCircle, StopCircle,
    Info, Bell, Search, Filter, Archive, Users, UserPlus,
    Smartphone, Camera, Image, ChevronRight, Upload, MoreVertical,
    Mail
} from 'lucide-react';
// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDuqyLn2AKny4Rk8NSjIl7Amx6-SolxUXQ",
  authDomain: "bwai31mayfolio3.firebaseapp.com",
  projectId: "bwai31mayfolio3",
  storageBucket: "bwai31mayfolio3.firebasestorage.app",
  messagingSenderId: "659827269841",
  appId: "1:659827269841:web:f50c53a5d0e1da7f7225f0",
  measurementId: "G-5N6MN9PHSX"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const perf = getPerformance(app);
// ==================================================================================
// --- CONSTANTS ---
// ==================================================================================
const VIEWS = {
    LIST: 'list',
    FORM: 'form',
    DETAIL: 'detail',
    BDO_LIST: 'bdo_list',
    BDO_FORM: 'bdo_form',
    BDO_DETAIL: 'bdo_detail',
    TRANSFER_OWNERSHIP: 'transfer_ownership' // Add this line
};

// ==================================================================================
// --- UTILITY FUNCTIONS ---
// ==================================================================================

// Utility function to safely format timestamps
const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            return timestamp.toDate().toLocaleString();
        } catch (error) {
            console.warn('Error converting Firestore timestamp:', error);
            return 'Invalid Date';
        }
    }
    
    // Handle regular Date objects
    if (timestamp instanceof Date) {
        return timestamp.toLocaleString();
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date.toLocaleString() : 'Invalid Date';
    }
    
    // Handle milliseconds timestamp
    if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date.toLocaleString() : 'Invalid Date';
    }
    
    return 'N/A';
};

// Utility function to safely format timestamps as date only
const formatTimestampDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            return timestamp.toDate().toLocaleDateString();
        } catch (error) {
            console.warn('Error converting Firestore timestamp:', error);
            return 'Invalid Date';
        }
    }
    
    // Handle regular Date objects
    if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Invalid Date';
    }
    
    // Handle milliseconds timestamp
    if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Invalid Date';
    }
    
    return 'N/A';
};

// Utility function to safely get Date object for sorting
const getDateForSort = (timestamp) => {
    if (!timestamp) return new Date(0);
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            return timestamp.toDate();
        } catch (error) {
            console.warn('Error converting Firestore timestamp for sorting:', error);
            return new Date(0);
        }
    }
    
    // Handle regular Date objects
    if (timestamp instanceof Date) {
        return timestamp;
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date : new Date(0);
    }
    
    // Handle milliseconds timestamp
    if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date : new Date(0);
    }
    
    return new Date(0);
};
const USER_ROLES = {
    FRANCHISE: 'Franchise',
    SALES_TEAM: 'Sales Team',
    OPERATIONS_TEAM: 'Operations Team',
    BVS_TEAM: 'BVS Team',
    ADMIN: 'Admin'
};
const HANDLER_TYPES = {
    BDO: 'BDO',
    RETAILER: 'Retailer'
};
const REQUEST_TYPES = {
    NEW_MAPPING: 'NEW_MAPPING',
    TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
    OTP_CHANGE: 'OTP_CHANGE',
    FAULTY_REPLACEMENT: 'FAULTY_REPLACEMENT',
    DEVICE_RETURN: 'DEVICE_RETURN',
    LOCATION_UPDATE: 'LOCATION_UPDATE',
    DE_MAPPING: 'DE_MAPPING' // Device de-mapping requests
};
// Add new device status constants
const DEVICE_STATUS = {
    AVAILABLE: 'Available',
    MAPPED: 'Mapped',
    IN_TRANSIT: 'In_Transit',
    FAULTY: 'Faulty',
    RETURNED: 'Returned',
    DECOMMISSIONED: 'Decommissioned'
};
const REQUEST_STATUSES = {
    PENDING: 'pending',
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    SALES_REVIEW: 'Sales Review',
    SALES_APPROVED: 'Sales Approved',
    SALES_REJECTED: 'Sales Rejected',
    OPS_REVIEW: 'Operations Review',
    OPS_APPROVED: 'Operations Approved',
    OPERATIONS_APPROVED: 'Operations Approved',
    OPS_REJECTED: 'Operations Rejected',
    NEEDS_REVISION: 'Needs Revision',
    REJECTED: 'Rejected',
    IN_PROCESSING: 'In Processing',
    COMPLETED: 'Completed',
    ON_HOLD: 'On Hold',
    ARCHIVED: 'Archived'
};
const BDO_STATUSES = {
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    NEEDS_REVISION: 'Needs Revision',
    REJECTED: 'Rejected',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive'
};
const FRANCHISE_TABS = {
    ALL_REQUESTS: 'all_requests',
    BDO_RETAILER: 'bdo_retailer',
    NEW_FEATURES: 'new_features'
};
const SALES_TABS = {
    BDO_REQUESTS: 'bdo_requests',
    MAPPING_REQUESTS: 'mapping_requests'
};
const ADMIN_VIEWS = {
    QUEUE: 'queue',
    BDO_QUEUE: 'bdo_queue',
    MAPPED_DEVICES: 'mapped_devices',
    ANALYTICS: 'analytics'
};
// Status configuration
const STATUS_CONFIG = {
    [REQUEST_STATUSES.PENDING]: {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Clock,
        priority: 0
    },
    // Handle lowercase pending
    'pending': {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Clock,
        priority: 0
    },
    [REQUEST_STATUSES.DRAFT]: {
        color: 'bg-gray-100 text-gray-700 border-gray-200',
        icon: Edit,
        priority: 1
    },
    [REQUEST_STATUSES.SUBMITTED]: {
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: PlayCircle,
        priority: 2
    },
    [REQUEST_STATUSES.SALES_REVIEW]: {
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: Eye,
        priority: 3
    },
    [REQUEST_STATUSES.SALES_APPROVED]: {
        color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        icon: CheckCircle,
        priority: 4
    },
    [REQUEST_STATUSES.SALES_REJECTED]: {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        priority: 5
    },
    [REQUEST_STATUSES.OPS_REVIEW]: {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Clock,
        priority: 6
    },
    [REQUEST_STATUSES.OPS_APPROVED]: {
        color: 'bg-teal-100 text-teal-800 border-teal-200',
        icon: CheckCircle2,
        priority: 7
    },
    [REQUEST_STATUSES.OPS_REJECTED]: {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        priority: 8
    },
    [REQUEST_STATUSES.NEEDS_REVISION]: {
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: AlertTriangle,
        priority: 9,
        urgent: true
    },
    [REQUEST_STATUSES.IN_PROCESSING]: {
        color: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        icon: Hourglass,
        priority: 10
    },
    [REQUEST_STATUSES.COMPLETED]: {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle2,
        priority: 11
    },
    // Handle uppercase COMPLETED
    'COMPLETED': {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle2,
        priority: 11
    },
    // Handle active status
    'active': {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle2,
        priority: 11
    },
    [REQUEST_STATUSES.ON_HOLD]: {
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        icon: StopCircle,
        priority: 12
    },
    [REQUEST_STATUSES.ARCHIVED]: {
        color: 'bg-slate-100 text-slate-600 border-slate-200',
        icon: Archive,
        priority: 13
    }
};
const BDO_STATUS_CONFIG = {
    [BDO_STATUSES.PENDING_APPROVAL]: {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Clock
    },
    [BDO_STATUSES.APPROVED]: {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle
    },
    [BDO_STATUSES.NEEDS_REVISION]: {
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: AlertTriangle
    },
    [BDO_STATUSES.REJECTED]: {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle
    },
    [BDO_STATUSES.ACTIVE]: {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle2
    },
    [BDO_STATUSES.INACTIVE]: {
        color: 'bg-gray-100 text-gray-600 border-gray-200',
        icon: StopCircle
    }
};
// ==================================================================================
// --- UTILITY FUNCTIONS ---
// ==================================================================================
const validateFranchiseID = (franchiseId) => {
    const pattern = /^[A-Z]{2}[0-9]$/;
    return pattern.test(franchiseId);
};
const formatFranchiseID = (value) => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
};
const validateCNIC = (cnic) => {
    const cleanCnic = cnic.replace(/\D/g, '');
    return cleanCnic.length === 13;
};
const validateMobile = (mobile) => {
    const cleanMobile = mobile.replace(/\D/g, '');
    return cleanMobile.length === 12 && cleanMobile.startsWith('923');
};
const formatCnic = (value) => {
    let val = value.replace(/-/g, '');
    if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5);
    if (val.length > 13) val = val.slice(0, 13) + '-' + val.slice(13);
    return val;
};
const formatPhone = (value) => {
    // Remove all non-digit characters
    let cleanValue = value.replace(/\D/g, '');
    
    // Automatically convert '03' to '923'
    if (cleanValue.startsWith('03')) {
        cleanValue = '923' + cleanValue.substring(2);
    }
    // Ensure it doesn't exceed 12 digits
    if (cleanValue.length > 12) {
        return cleanValue.substring(0, 12);
    }
    
    return cleanValue;
};
const generateBDOId = async (franchiseId) => {
    try {
        const franchiseDoc = await getDoc(doc(db, 'users', franchiseId));
        
        if (!franchiseDoc.exists()) {
            console.error('Franchise document not found');
            throw new Error('Franchise not found');
        }
        
        const franchiseData = franchiseDoc.data();
        const franchiseCode = franchiseData.franchiseCode;
        
        if (!franchiseCode) {
            throw new Error('Franchise code not found');
        }
        
        const approvedBDOQuery = query(
            collection(db, 'bdoAccounts'),
            where('franchiseCode', '==', franchiseCode)
            // where('status', '==', BDO_STATUSES.APPROVED) // commented out
        );
        
        const approvedBDOSnapshot = await getDocs(approvedBDOQuery);
        const nextNumber = approvedBDOSnapshot.size + 1;
        
        const bdoId = `${franchiseCode}-${String(nextNumber).padStart(5, '0')}`;
        return bdoId;
    } catch (error) {
        console.error('Error in generateBDOId:', error);
        throw error;
    }
};
const exportToCsv = (data, filename) => {
    if (data.length > 500) {
        if (!window.confirm(`You are about to export ${data.length} records. This may take a moment. Do you want to continue?`)) {
            return;
        }
    }
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
const createZipFile = async (requestData, includeDocuments = true) => {
    const zip = new JSZip();
    
    const textContent = `
Request Details
===============
Request ID: ${requestData.id}
IMEI: ${requestData.imei || 'N/A'}
BDO/Retailer ID: ${requestData.bdoId || 'N/A'}
BDO/Retailer Name: ${requestData.bdoName || 'N/A'}
CNIC: ${requestData.cnicNumber || 'N/A'}
Mobile: ${requestData.otpMobileNumber || 'N/A'}
Franchise ID: ${requestData.franchiseId || 'N/A'}
Franchise Name: ${requestData.franchiseName || 'N/A'}
City: ${requestData.city || 'N/A'}
Address: ${requestData.streetAddress || 'N/A'}
Status: ${requestData.status}
Created: ${formatTimestamp(requestData.createdAt)}
    `.trim();
    
    zip.file('request_details.txt', textContent);
    
    if (includeDocuments && requestData.documents) {
        const docsFolder = zip.folder('documents');
        
        for (const [docName, docUrl] of Object.entries(requestData.documents)) {
            try {
                const response = await fetch(docUrl);
                const blob = await response.blob();
                const extension = blob.type.split('/')[1] || 'jpg';
                docsFolder.file(`${docName}.${extension}`, blob);
            } catch (error) {
                // Skip failed downloads
            }
        }
    }
    
    return zip;
};
const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    let time;
    
    // Handle Firestore timestamps with toDate method
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            time = timestamp.toDate();
        } catch (error) {
            console.warn('Error converting Firestore timestamp:', error);
            return 'Invalid Date';
        }
    } 
    // Handle Firestore timestamp objects with seconds and nanoseconds
    else if (timestamp && typeof timestamp === 'object' && 
             typeof timestamp.seconds === 'number' && 
             typeof timestamp.nanoseconds === 'number') {
        try {
            // Convert Firestore timestamp format to Date
            time = new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
        } catch (error) {
            console.warn('Error converting timestamp object:', error);
            return 'Invalid Date';
        }
    }
    // Handle regular Date objects
    else if (timestamp instanceof Date) {
        time = timestamp;
    }
    // Handle string or number timestamps
    else {
        time = new Date(timestamp);
    }
    
    // Check if the resulting date is valid
    if (!time || isNaN(time.getTime())) {
        console.warn('Invalid timestamp received:', timestamp);
        return 'Invalid Date';
    }
    
    const now = new Date();
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return time.toLocaleDateString();
};

// Helper function to safely convert timestamps to Date objects for formatting
const getFormattedDate = (timestamp, format = 'locale') => {
    if (!timestamp) return 'N/A';
    
    let time;
    
    // Handle Firestore timestamps with toDate method
    if (timestamp && typeof timestamp.toDate === 'function') {
        try {
            time = timestamp.toDate();
        } catch (error) {
            console.warn('Error converting Firestore timestamp:', error);
            return 'Invalid Date';
        }
    } 
    // Handle Firestore timestamp objects with seconds and nanoseconds
    else if (timestamp && typeof timestamp === 'object' && 
             typeof timestamp.seconds === 'number' && 
             typeof timestamp.nanoseconds === 'number') {
        try {
            // Convert Firestore timestamp format to Date
            time = new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
        } catch (error) {
            console.warn('Error converting timestamp object:', error);
            return 'Invalid Date';
        }
    }
    // Handle regular Date objects
    else if (timestamp instanceof Date) {
        time = timestamp;
    }
    // Handle string or number timestamps
    else {
        time = new Date(timestamp);
    }
    
    // Check if the resulting date is valid
    if (!time || isNaN(time.getTime())) {
        console.warn('Invalid timestamp received:', timestamp);
        return 'Invalid Date';
    }
    
    // Return formatted date based on format parameter
    switch (format) {
        case 'localeString':
            return time.toLocaleString();
        case 'localeDateString':
            return time.toLocaleDateString();
        case 'locale':
        default:
            return time.toLocaleDateString();
    }
};
const sortRequestsByPriority = (requests) => {
    return [...requests].sort((a, b) => {
        const statusA = STATUS_CONFIG[a.status];
        const statusB = STATUS_CONFIG[b.status];
        
        if (statusA?.urgent && !statusB?.urgent) return -1;
        if (!statusA?.urgent && statusB?.urgent) return 1;
        
        const priorityA = statusA?.priority || 999;
        const priorityB = statusB?.priority || 999;
        if (priorityA !== priorityB) return priorityA - priorityB;
        
        const timeA = getDateForSort(a.createdAt);
        const timeB = getDateForSort(b.createdAt);
        return timeB - timeA;
    });
};
// ==================================================================================
// --- ENHANCED APP SERVICES ---
// ==================================================================================
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
// ==================================================================================
// --- UI COMPONENTS ---
// ==================================================================================
const EnhancedStatusPill = ({ status, showIcon = true, size = 'md', type = 'request' }) => {
    const config = type === 'bdo' ? BDO_STATUS_CONFIG[status] : STATUS_CONFIG[status];
    
    // Fallback config for unknown statuses
    const fallbackConfig = {
        color: 'bg-gray-100 text-gray-700 border-gray-200',
        icon: null,
        priority: 999
    };
    
    const finalConfig = config || fallbackConfig;
    const Icon = finalConfig.icon;
    
    const sizeClasses = {
        sm: 'px-2 py-1 text-xs',
        md: 'px-3 py-1 text-sm',
        lg: 'px-4 py-2 text-base'
    };
    
    return (
        <span className={`${finalConfig.color} ${sizeClasses[size]} font-semibold rounded-full border flex items-center gap-1 ${finalConfig.urgent ? 'animate-pulse ring-2 ring-orange-300' : ''}`}>
            {showIcon && Icon && <Icon className="w-3 h-3" />}
            {status || 'Unknown'}
        </span>
    );
};
const BDOStatusPill = ({ status, size = 'md' }) => (
    <EnhancedStatusPill status={status} type="bdo" size={size} />
);
const InputField = ({ label, name, ...props }) => (
    <div>
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>{label}</label>
        <input id={name} name={name} className="w-full p-3 border rounded-lg bg-white" {...props} />
    </div>
);
const SelectField = ({ label, name, children, ...props }) => (
    <div>
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>{label}</label>
        <select id={name} name={name} className="w-full p-3 border rounded-lg bg-white" {...props}>
            {children}
        </select>
    </div>
);
const FileInput = ({ label, name, onChange, required, accept, file, isCompressing, allowGallery = true }) => (
    <div>
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>{label}</label>
        <div className="flex items-center">
            <div className="relative w-full">
                <input 
                    type="file" 
                    id={name} 
                    name={name} 
                    onChange={onChange} 
                    required={required} 
                    accept={accept} 
                    capture={allowGallery ? undefined : "environment"}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                />
                {allowGallery && (
                    <div className="flex items-center mt-2 text-xs text-gray-500">
                        <Camera className="w-3 h-3 mr-1" />
                        <span>Take photo</span>
                        <span className="mx-2">or</span>
                        <Image className="w-3 h-3 mr-1" />
                        <span>Choose from gallery</span>
                    </div>
                )}
            </div>
            {isCompressing && <span className="ml-4 text-gray-500 text-xs">Compressing...</span>}
            {file && !isCompressing && <span className="ml-4 text-green-600">✓</span>}
        </div>
    </div>
);
const FormattedInput = ({ label, name, value, onChange, format, maxLength, ...props }) => {
    const handleChange = (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (rawValue.length <= maxLength) {
            const formattedValue = format(rawValue);
            onChange(name, formattedValue);
        }
    };
    return (
        <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={name}>{label}</label>
            <input id={name} name={name} value={value} onChange={handleChange} className="w-full p-3 border rounded-lg bg-white" {...props} />
        </div>
    );
};
const ActionModal = ({ isOpen, onClose, onConfirm, title, placeholder, required = false }) => {
    const [inputValue, setInputValue] = useState('');
    useEffect(() => {
        if (!isOpen) {
            setInputValue('');
        }
    }, [isOpen]);
    if (!isOpen) return null;
    const handleSubmit = () => {
        if (required && !inputValue.trim()) {
            toast.error('This field is required');
            return;
        }
        onConfirm(inputValue.trim());
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={placeholder}
                        className="w-full p-3 border border-gray-300 rounded-lg resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        {required && <span className="text-red-500">* Required</span>}
                    </p>
                </div>
                <div className="bg-gray-50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};
// ==================================================================================
// --- FRANCHISE DASHBOARD ---
// ==================================================================================
// ==================================================================================
// --- FRANCHISE DASHBOARD ---
// ==================================================================================
function FranchiseDashboard({ user, appServices, db, auth }) {
    // DEPRECATED: This component is no longer used. Enhanced Dashboard with Cloud Functions is used instead.
    return null;
    
    const [activeTab, setActiveTab] = useState(FRANCHISE_TABS.ALL_REQUESTS);
    const [view, setView] = useState(VIEWS.LIST);
    const [editingRequest, setEditingRequest] = useState(null);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedBDO, setSelectedBDO] = useState(null);
    const [requests, setRequests] = useState([]);
    const [bdoAccounts, setBdoAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    // Fetch mapping requests - Hook must be at top level
    useEffect(() => {
        // Comprehensive validation with early returns for undefined/invalid states
        if (!user) {
            console.log('⏭️ Skipping requests query - no user');
            setRequests([]);
            return;
        }
        if (!db) {
            console.log('⏭️ Skipping requests query - no db connection');
            setRequests([]);
            return;
        }
        // Check franchiseCode with multiple validation layers
        const franchiseCodeValue = user.franchiseCode;
        if (!franchiseCodeValue || 
            franchiseCodeValue === undefined || 
            franchiseCodeValue === null ||
            franchiseCodeValue === '' ||
            franchiseCodeValue === 'undefined' ||
            typeof franchiseCodeValue !== 'string' ||
            franchiseCodeValue.trim() === '') {
            
            console.log('⏭️ Skipping requests query - invalid franchiseCode:', { 
                hasUser: !!user, 
                franchiseCode: franchiseCodeValue,
                franchiseCodeType: typeof franchiseCodeValue,
                stringified: String(franchiseCodeValue),
                hasDb: !!db 
            });
            setRequests([]);
            return;
        }
        
        console.log('🔍 Setting up requests query for franchiseCode:', franchiseCodeValue);
        
        try {
            // Final validation before Firestore query construction
            const validatedCode = String(franchiseCodeValue).trim();
            // Defensive: Final validation with strict checks
            if (!validatedCode || typeof validatedCode === 'undefined' || validatedCode === 'undefined' || validatedCode === null || validatedCode === '') {
                console.error('❌ Final validation failed for franchiseCode, aborting query:', validatedCode);
                setRequests([]);
                return;
            }
            // Construct Firestore query with validated franchise code
            const q = query(
                collection(db, 'requestsV2'), 
                where('franchiseCode', '==', validatedCode)
                // orderBy('createdAt', 'desc') // Commented out temporarily
            );
            
            const unsubscribe = onSnapshot(q, (snap) => {
                const requestsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Sort in memory as temporary workaround
                requestsData.sort((a, b) => {
                    const aTime = getDateForSort(a.createdAt);
                    const bTime = getDateForSort(b.createdAt);
                    return bTime - aTime;
                });
                console.log('✅ Requests loaded:', requestsData.length);
                setRequests(requestsData);
            }, (err) => {
                console.error("❌ Requests error:", err);
                setRequests([]);
                toast.error('Error loading requests');
            });
            
            return unsubscribe;
        } catch (error) {
            console.error('❌ Error setting up requests query:', error);
            setRequests([]);
        }
    }, [user?.uid, user?.franchiseCode, db]); // Keep dependency on user.franchiseCode for updates
    // Fetch BDO/Retailer accounts - Hook must be at top level
    useEffect(() => {
        // Comprehensive validation with early returns for undefined/invalid states
        if (!user) {
            console.log('⏭️ Skipping BDO query - no user');
            setBdoAccounts([]);
            setLoading(false);
            return;
        }
        if (!db) {
            console.log('⏭️ Skipping BDO query - no db connection');
            setBdoAccounts([]);
            setLoading(false);
            return;
        }
        // Check franchiseCode with multiple validation layers
        const franchiseCodeValue = user.franchiseCode;
        if (!franchiseCodeValue || 
            franchiseCodeValue === undefined || 
            franchiseCodeValue === null ||
            franchiseCodeValue === '' ||
            franchiseCodeValue === 'undefined' ||
            typeof franchiseCodeValue !== 'string' ||
            franchiseCodeValue.trim() === '') {
            
            console.log('⏭️ Skipping BDO query - invalid franchiseCode:', { 
                hasUser: !!user, 
                franchiseCode: franchiseCodeValue,
                franchiseCodeType: typeof franchiseCodeValue,
                stringified: String(franchiseCodeValue),
                hasDb: !!db 
            });
            setBdoAccounts([]);
            setLoading(false);
            return;
        }
        
        console.log('🔍 Setting up BDO query for franchiseCode:', franchiseCodeValue);
        
        try {
            // Defensive: Final validation before Firestore query construction
            const validatedCode = String(franchiseCodeValue).trim();
            if (!validatedCode || typeof validatedCode === 'undefined' || validatedCode === 'undefined' || validatedCode === null || validatedCode === '') {
                console.error('❌ Final validation failed for franchiseCode, aborting BDO query:', validatedCode);
                setBdoAccounts([]);
                setLoading(false);
                return;
            }
            // Construct Firestore query with validated franchise code
            const q = query(
                collection(db, 'bdoAccounts'), 
                where('franchiseCode', '==', validatedCode)
                // orderBy('createdAt', 'desc') // Commented out temporarily
            );
            
            const unsubscribe = onSnapshot(q, (snap) => {
                const bdoData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Sort in memory as temporary workaround
                bdoData.sort((a, b) => {
                    const aTime = getDateForSort(a.createdAt);
                    const bTime = getDateForSort(b.createdAt);
                    return bTime - aTime;
                });
                console.log('✅ BDO accounts loaded:', bdoData.length);
                setBdoAccounts(bdoData);
                setLoading(false);
            }, (err) => {
                console.error("❌ BDO error:", err);
                setBdoAccounts([]);
                setLoading(false);
                toast.error('Error loading BDO accounts');
            });
            
            return unsubscribe;
        } catch (error) {
            console.error('❌ Error setting up BDO query:', error);
            setBdoAccounts([]);
            setLoading(false);
        }
    }, [user?.uid, user?.franchiseCode, db]); // Keep dependency on user.franchiseCode for updates
    // Check if user data is ready for rendering - AFTER all hooks
    if (!user || 
        !user.uid || 
        !user.franchiseCode || 
        user.franchiseCode === 'undefined' ||
        user.franchiseCode === undefined ||
        user.franchiseCode === null ||
        user.franchiseCode === '' ||
        typeof user.franchiseCode !== 'string') {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading user data...</p>
                    <p className="text-sm text-gray-400 mt-2">
                        {!user ? 'No user' : 
                         !user.uid ? 'No user ID' :
                         !user.franchiseCode ? 'No franchise code' :
                         user.franchiseCode === 'undefined' ? 'Invalid franchise code' :
                         'Validating user data...'}
                    </p>
                </div>
            </div>
        );
    }
    const handleBackToList = () => {
        setView(VIEWS.LIST);
        setSelectedRequest(null);
        setEditingRequest(null);
        setSelectedBDO(null);
    };
    const handleEditRequest = (request) => {
        setEditingRequest(request);
        setView(VIEWS.FORM);
    };
    const handleViewBDODetail = (bdo) => {
        setSelectedBDO(bdo);
        setView(VIEWS.BDO_DETAIL);
    };
    // Tab Navigation
    const TabNavigation = () => (
        <div className="bg-white rounded-lg shadow-md mb-6">
            <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab(FRANCHISE_TABS.ALL_REQUESTS)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === FRANCHISE_TABS.ALL_REQUESTS
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        All Requests
                        <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                            {requests.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab(FRANCHISE_TABS.BDO_RETAILER)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === FRANCHISE_TABS.BDO_RETAILER
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Retailer / BDO
                        <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                            {bdoAccounts.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab(FRANCHISE_TABS.NEW_FEATURES)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === FRANCHISE_TABS.NEW_FEATURES
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        🚀 New Features
                        <span className="ml-2 bg-green-100 text-green-600 py-0.5 px-2 rounded-full text-xs">
                            NEW
                        </span>
                    </button>
                </nav>
            </div>
        </div>
    );
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-3 text-gray-600">Loading dashboard...</span>
            </div>
        );
    }
    // Handle different views
    if (view === VIEWS.FORM) {
        return (
            <EnhancedRequestForm 
                user={user} 
                appServices={appServices}
                db={db}
                onCancel={handleBackToList} 
                existingRequest={editingRequest} 
            />
        );
    }
    
    if (view === VIEWS.DETAIL) {
        return <RequestDetail request={selectedRequest} user={user} onBack={handleBackToList} onEdit={handleEditRequest} />;
    }
    
    if (view === VIEWS.BDO_FORM) {
        return <CreateBDOForm user={user} onCancel={handleBackToList} />;
    }
    
    if (view === VIEWS.BDO_DETAIL) {
        return <BDODetail bdo={selectedBDO} user={user} onBack={handleBackToList} />;
    }
    
    // New view handler for Transfer of Ownership
    if (view === VIEWS.TRANSFER_OWNERSHIP) {
        return <TransferOwnershipForm user={user} onCancel={handleBackToList} />;
    }
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Franchise Dashboard</h2>
                        <p className="text-gray-600 mt-1">Welcome, {user.name || user.email}</p>
                    </div>
                </div>
                {/* Tab Navigation */}
                <TabNavigation />
                {/* Tab Content */}
                {activeTab === FRANCHISE_TABS.ALL_REQUESTS ? (
                    <AllRequestsTab 
                        requests={requests}
                        onSelectRequest={(req) => { setSelectedRequest(req); setView(VIEWS.DETAIL); }}
                        onNewRequest={() => { setView(VIEWS.FORM); setEditingRequest(null); }}
                        onEditRequest={handleEditRequest}
                        onTransferRequest={() => setView(VIEWS.TRANSFER_OWNERSHIP)} // Prop to handle opening the transfer form
                    />
                ) : activeTab === FRANCHISE_TABS.NEW_FEATURES ? (
                    <NewFeaturesShowcase 
                        appServices={appServices}
                        user={user}
                    />
                ) : (
                    <BDORetailerTab 
                        bdoAccounts={bdoAccounts}
                        onSelectBDO={handleViewBDODetail}
                        onCreateBDO={() => setView(VIEWS.BDO_FORM)}
                    />
                )}
            </div>
        </div>
    );
}
             
// All Requests Tab Component
const AllRequestsTab = ({ requests, onSelectRequest, onNewRequest, onEditRequest, onTransferRequest }) => {
    const groupedRequests = requests.reduce((acc, req) => {
        const group = req.status === REQUEST_STATUSES.NEEDS_REVISION ? 'Needs Revision' :
                      req.status === REQUEST_STATUSES.COMPLETED ? 'Completed' : 'In Progress';
        if (!acc[group]) acc[group] = [];
        acc[group].push(req);
        return acc;
    }, {});
    const priorityOrder = ['Needs Revision', 'In Progress', 'Completed'];
    const needsRevisionCount = groupedRequests['Needs Revision']?.length || 0;
    return (
        <div>
            {/* --- ACTION BUTTONS (UPDATED) --- */}
            <div className="flex flex-col sm:flex-row justify-end mb-6 gap-4">
                <button
                    onClick={onTransferRequest}
                    className="bg-purple-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-600 transition-colors duration-200 shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Transfer Ownership
                </button>
                <button
                    onClick={onNewRequest}
                    className="bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition-colors duration-200 shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                    <span className="inline-block mr-2">+</span>
                    Add New Mapping Request
                </button>
            </div>
            {/* Alerts */}
            {needsRevisionCount > 0 && (
                <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-6 rounded-r-lg">
                    <div className="flex items-center">
                        <AlertTriangle className="w-5 h-5 text-orange-400 mr-2" />
                        <p className="text-sm font-medium text-orange-800">
                            {needsRevisionCount} request{needsRevisionCount > 1 ? 's' : ''} need{needsRevisionCount === 1 ? 's' : ''} your attention
                        </p>
                    </div>
                </div>
            )}
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {priorityOrder.map(group => {
                    const count = groupedRequests[group]?.length || 0;
                    const bgColor = group === 'Needs Revision' ? 'bg-red-50 border-red-200' :
                                   group === 'In Progress' ? 'bg-blue-50 border-blue-200' :
                                   'bg-green-50 border-green-200';
                    const textColor = group === 'Needs Revision' ? 'text-red-700' :
                                     group === 'In Progress' ? 'text-blue-700' :
                                     'text-green-700';
                    
                    return (
                        <div key={group} className={`${bgColor} border rounded-lg p-4 ${group === 'Needs Revision' && count > 0 ? 'ring-2 ring-red-300' : ''}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`text-sm font-medium ${textColor}`}>{group}</p>
                                    <p className={`text-2xl font-bold ${textColor}`}>{count}</p>
                                </div>
                                <div className={`p-2 rounded-full ${textColor}`}>
                                    {group === 'Needs Revision' && <AlertTriangle className="w-6 h-6" />}
                                    {group === 'In Progress' && <Clock className="w-6 h-6" />}
                                    {group === 'Completed' && <CheckCircle2 className="w-6 h-6" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Request Groups */}
            {priorityOrder.map(group => (
                groupedRequests[group] && groupedRequests[group].length > 0 && (
                    <div key={group} className="mb-8">
                        <div className="flex items-center mb-4">
                            <h3 className={`text-lg font-semibold ${
                                group === 'Needs Revision' ? 'text-red-700' :
                                group === 'In Progress' ? 'text-blue-700' :
                                'text-green-700'
                            }`}>
                                {group}
                            </h3>
                            <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                                group === 'Needs Revision' ? 'bg-red-100 text-red-800' :
                                group === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                                {groupedRequests[group].length}
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {groupedRequests[group].map(req => (
                                <div 
                                    key={req.id} 
                                    onClick={() => onSelectRequest(req)} 
                                    className={`bg-white p-4 rounded-xl shadow-md cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 border-l-4 ${
                                        group === 'Needs Revision' ? 'border-red-500 hover:bg-red-50' :
                                        group === 'In Progress' ? 'border-blue-500 hover:bg-blue-50' :
                                        'border-green-500 hover:bg-green-50'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="font-bold text-gray-900 text-sm line-clamp-2">
                                            {req.bdoName || req.franchiseName}
                                        </h4>
                                        <EnhancedStatusPill status={req.status} />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {req.shopName && (
                                            <p className="text-sm text-gray-600">
                                                <span className="font-medium">Shop:</span> {req.shopName}
                                             </p>
                                        )}
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">IMEI:</span> {req.imei}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">BDO ID:</span> {req.bdoId || 'N/A'}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            <span className="font-medium">Submitted:</span> {formatTimestamp(req.createdAt)}
                                        </p>
                                    </div>
                                    
                                    {group === 'Needs Revision' && (
                                        <div className="mt-3 flex items-center text-xs text-red-600 font-medium">
                                            <div className="h-1.5 w-1.5 bg-red-500 rounded-full mr-2"></div>
                                            Click to review and update
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ))}
            {/* Empty State */}
            {requests.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-gray-400 text-6xl mb-4">📋</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No requests yet</h3>
                    <p className="text-gray-600 mb-6">Start by creating your first mapping request</p>
                    <button 
                        onClick={onNewRequest} 
                        className="bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition-colors duration-200"
                    >
                        Create Request
                    </button>
                </div>
            )}
        </div>
    );
};
// BDO/Retailer Tab Component
const BDORetailerTab = ({ bdoAccounts, onSelectBDO, onCreateBDO }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const filteredBDOs = useMemo(() => {
        let filtered = bdoAccounts;
        
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(bdo => 
                bdo.name?.toLowerCase().includes(search) ||
                bdo.bdoId?.toLowerCase().includes(search) ||
                bdo.cnicNumber?.includes(search) ||
                bdo.otpMobileNumber?.includes(search)
            );
        }
        
        if (filterStatus) {
            filtered = filtered.filter(bdo => bdo.status === filterStatus);
        }
        
        return filtered;
    }, [bdoAccounts, searchTerm, filterStatus]);
    const statusCounts = useMemo(() => {
        return bdoAccounts.reduce((acc, bdo) => {
            acc[bdo.status] = (acc[bdo.status] || 0) + 1;
            return acc;
        }, {});
    }, [bdoAccounts]);
    return (
        <div>
            {/* Header with Create Button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                    BDO / Retailer Accounts ({bdoAccounts.length})
                </h3>
                <button 
                    onClick={onCreateBDO} 
                    className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-lg hover:shadow-xl flex items-center"
                >
                    <UserPlus className="w-5 h-5 mr-2" />
                    Create New BDO/Retailer
                </button>
            </div>
            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by name, ID, CNIC, or mobile..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {Object.keys(statusCounts).map(status => (
                            <option key={status} value={status}>
                                {status} ({statusCounts[status]})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {/* BDO Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredBDOs.map(bdo => (
                    <BDOCard key={bdo.id} bdo={bdo} onClick={() => onSelectBDO(bdo)} />
                ))}
            </div>
            {/* Empty State */}
            {filteredBDOs.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg shadow-md">
                    <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {searchTerm || filterStatus ? 'No BDO/Retailer accounts found' : 'No BDO/Retailer accounts yet'}
                    </h3>
                    <p className="text-gray-600 mb-6">
                        {searchTerm || filterStatus ? 'Try adjusting your search criteria' : 'Create your first BDO or Retailer account'}
                    </p>
                    {!(searchTerm || filterStatus) && (
                        <button 
                            onClick={onCreateBDO} 
                            className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                        >
                            Create BDO/Retailer
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
// BDO Card Component
const BDOCard = ({ bdo, onClick }) => {
    const isNotApproved = bdo.status !== BDO_STATUSES.APPROVED;
    
    return (
        <div 
            onClick={onClick}
            className={`bg-white p-6 rounded-xl shadow-md cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 border-l-4 ${
                isNotApproved ? 'border-yellow-500' : 'border-green-500'
            }`}
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="font-bold text-gray-900 text-lg">{bdo.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">ID: {bdo.bdoId}</p>
                </div>
                <BDOStatusPill status={bdo.status} />
            </div>
            
            <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    <span className="font-medium">Type:</span>
                    <span className="ml-1">{bdo.handlerType}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                    <CreditCard className="w-4 h-4 mr-2" />
                    <span className="font-medium">CNIC:</span>
                    <span className="ml-1">{bdo.cnicNumber}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-2" />
                    <span className="font-medium">Mobile:</span>
                    <span className="ml-1">{bdo.otpMobileNumber}</span>
                </div>
            </div>
            
            {isNotApproved && (
                <div className="mt-3 flex items-center text-xs text-yellow-600 font-medium bg-yellow-50 p-2 rounded">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Not yet approved by sales team
                </div>
            )}
        </div>
    );
};
// ==================================================================================
// --- CREATE BDO/RETAILER FORM ---
// ==================================================================================
function CreateBDOForm({ user, onCancel }) {
    const [formData, setFormData] = useState({
        name: '',
        handlerType: '',
        cnicNumber: '',
        otpMobileNumber: ''
    });
    const [files, setFiles] = useState({});
    const [compressing, setCompressing] = useState({});
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generatedBDOId, setGeneratedBDOId] = useState('');
    console.log('Generated BDO ID:', generatedBDOId);
    console.log('Form data:', formData);
    console.log('Files state:', files);
    
    // Generate BDO ID on component mount
    useEffect(() => {
        const generateId = async () => {
            try {
                const bdoId = await generateBDOId(user.uid);
                setGeneratedBDOId(bdoId);
            } catch (error) {
                toast.error('Error generating BDO ID');
            }
        };
        
        generateId();
    }, [user.uid]);
    const handleInputChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleSelectChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleFileChange = async (e) => {
        const { name, files: inputFiles } = e.target;
        if (inputFiles.length === 0) return;
        const file = inputFiles[0];
        if (file.type.startsWith('image/')) {
            setCompressing(prev => ({ ...prev, [name]: true }));
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true
            };
            try {
                const compressedFile = await imageCompression(file, options);
                setFiles(prev => ({ ...prev, [name]: compressedFile }));
                toast.success('Image compressed successfully');
            } catch (compressionError) {
                setError('Failed to compress image. Please try another file.');
                setFiles(prev => ({ ...prev, [name]: null }));
            } finally {
                setCompressing(prev => ({ ...prev, [name]: false }));
            }
        } else {
            setFiles(prev => ({ ...prev, [name]: file }));
        }
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        console.log('Submitting BDO form...'); // Add this
        // Validation
        if (!validateCNIC(formData.cnicNumber)) {
            setError("CNIC must be exactly 13 digits.");
            setIsSubmitting(false);
            return;
        }
        if (!validateMobile(formData.otpMobileNumber)) {
            setError("Mobile number must be in the format 923xxxxxxxxx (12 digits).");
            setIsSubmitting(false);
            return;
        }
        const requiredFiles = ['cnicFront', 'cnicBack'];
        for (const file of requiredFiles) {
            if (!files[file]) {
                const friendlyName = file === 'cnicFront' ? 'CNIC Front' : 'CNIC Back';
                setError(`Please upload the ${friendlyName} image.`);
                setIsSubmitting(false);
                return;
            }
        }
        try {
            // Defensive: Validate CNIC before Firestore query
            if (!formData.cnicNumber || typeof formData.cnicNumber === 'undefined' || formData.cnicNumber === null || formData.cnicNumber === '') {
                console.error('❌ Invalid CNIC for BDO query:', formData.cnicNumber);
                setError('Invalid CNIC number');
                setIsSubmitting(false);
                return;
            }
            // Check if BDO with same CNIC already exists
            const existingBDOQuery = query(
                collection(db, 'bdoAccounts'),
                where('cnicNumber', '==', formData.cnicNumber)
            );
            const existingBDOSnapshot = await getDocs(existingBDOQuery);
            
            if (!existingBDOSnapshot.empty) {
                setError('A BDO/Retailer with this CNIC already exists.');
                setIsSubmitting(false);
                return;
            }
            // Defensive: Validate mobile number before Firestore query
            if (!formData.otpMobileNumber || typeof formData.otpMobileNumber === 'undefined' || formData.otpMobileNumber === null || formData.otpMobileNumber === '') {
                console.error('❌ Invalid mobile number for BDO query:', formData.otpMobileNumber);
                setError('Invalid mobile number');
                setIsSubmitting(false);
                return;
            }
            const existingMobileQuery = query(
                collection(db, 'bdoAccounts'),
                where('otpMobileNumber', '==', formData.otpMobileNumber)
            );
            const existingMobileSnapshot = await getDocs(existingMobileQuery);
            if (!existingMobileSnapshot.empty) {
                setError('This OTP Mobile Number is already registered.');
                setIsSubmitting(false);
                return;
            }
            // Upload documents
            const uploadPromises = Object.keys(files).map(async (key) => {
                const file = files[key];
                const storageRef = ref(storage, `bdo_documents/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                return { key, url };
            });
            const uploadResults = await Promise.all(uploadPromises);
            const fileURLs = {};
            uploadResults.forEach(result => {
                fileURLs[result.key] = result.url;
            });
            // Create BDO account
            const bdoData = {
                ...formData,
                bdoId: generatedBDOId,
                franchiseId: user.uid,
                franchiseName: user.name || user.email,
                franchiseCode: user.franchiseCode,
                status: BDO_STATUSES.PENDING_APPROVAL,
                documents: fileURLs,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                assignedTo: USER_ROLES.SALES_TEAM,
                approvalMode: 'MANUAL_PENDING'
            };
            await addDoc(collection(db, 'bdoAccounts'), bdoData);
            
            toast.success('BDO/Retailer account created successfully!');
            onCancel();
        } catch (error) {
            setError('Failed to create BDO account. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 sm:px-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                                    Create New BDO/Retailer Account
                                </h1>
                                <p className="text-blue-100 mt-2 text-sm sm:text-base">
                                    Register a new BDO or Retailer under your franchise
                                </p>
                            </div>
                            <UserPlus className="w-10 h-10 text-white opacity-50" />
                        </div>
                    </div>
                    <div className="p-4 sm:p-6 lg:p-8">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* BDO ID Display */}
                            {generatedBDOId && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <p className="text-sm font-medium text-blue-800">
                                        BDO/Retailer ID: <span className="font-bold text-lg">{generatedBDOId}</span>
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                        This ID will be permanently assigned after approval
                                    </p>
                                </div>
                            )}
                            {/* Basic Information */}
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-200">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                    <User className="w-5 h-5 mr-2 text-blue-600" />
                                    Basic Information
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <InputField
                                        label="Name"
                                        name="name"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                        placeholder="Enter full name"
                                        required
                                    />
                                    
                                    <SelectField
                                        label="Handler Type"
                                        name="handlerType"
                                        value={formData.handlerType}
                                        onChange={handleSelectChange}
                                        required
                                    >
                                        <option value="">-- Select Type --</option>
                                        <option value={HANDLER_TYPES.BDO}>BDO</option>
                                        <option value={HANDLER_TYPES.RETAILER}>Retailer</option>
                                    </SelectField>
                                    
                                    <FormattedInput
                                        label="CNIC Number"
                                        name="cnicNumber"
                                        value={formData.cnicNumber}
                                        onChange={handleInputChange}
                                        format={formatCnic}
                                        maxLength={13}
                                        placeholder="XXXXX-XXXXXXX-X"
                                        required
                                    />
                                    
                                    <FormattedInput
                                        label="OTP Mobile Number"
                                        name="otpMobileNumber"
                                        value={formData.otpMobileNumber}
                                        onChange={handleInputChange}
                                        format={formatPhone}
                                        maxLength={12}
                                        placeholder="923xxxxxxxxx" // Changed placeholder
                                        required
                                    />
                                </div>
                            </div>
                            {/* Documents */}
                            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 sm:p-6 border border-purple-200">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                    <FileText className="w-5 h-5 mr-2 text-purple-600" />
                                    Required Documents
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FileInput
                                        label="CNIC (Front)"
                                        name="cnicFront"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        required
                                        file={files.cnicFront}
                                        isCompressing={compressing.cnicFront}
                                        allowGallery={true}
                                    />
                                    
                                    <FileInput
                                        label="CNIC (Back)"
                                        name="cnicBack"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        required
                                        file={files.cnicBack}
                                        isCompressing={compressing.cnicBack}
                                        allowGallery={true}
                                    />
                                </div>
                            </div>
                            {/* Error Message */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <div className="flex items-center">
                                        <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                                        <p className="text-red-700 font-medium">{error}</p>
                                    </div>
                                </div>
                            )}
                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="w-full sm:w-auto bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="w-4 h-4 mr-2" />
                                            Create BDO/Retailer
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
// ==================================================================================
// --- BDO DETAIL VIEW ---
// ==================================================================================
function BDODetail({ bdo, user, onBack }) {
    const [mappedRequests, setMappedRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchMappedRequests = async () => {
            try {
                // Defensive: Validate bdoId before Firestore query
                if (!bdo || !bdo.bdoId || typeof bdo.bdoId === 'undefined' || bdo.bdoId === null || bdo.bdoId === '') {
                    console.error('❌ Invalid bdoId for requests query:', bdo?.bdoId);
                    setMappedRequests([]);
                    setLoading(false);
                    return;
                }
                const q = query(
                    collection(db, 'requestsV2'),
                    where('bdoId', '==', bdo.bdoId)
                );
                const snapshot = await getDocs(q);
                const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setMappedRequests(requests);
            } catch (error) {
                toast.error('Error loading mapped devices');
            } finally {
                setLoading(false);
            }
        };
        fetchMappedRequests();
    }, [bdo.bdoId]);
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to BDO List
                </button>
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{bdo.name}</h2>
                                <p className="text-blue-100">ID: {bdo.bdoId}</p>
                            </div>
                            <BDOStatusPill status={bdo.status} size="lg" />
                        </div>
                    </div>
                    {/* Content */}
                    <div className="p-6">
                        {/* Basic Info */}
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-600">Handler Type</p>
                                    <p className="font-medium">{bdo.handlerType}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">CNIC Number</p>
                                    <p className="font-medium">{bdo.cnicNumber}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Mobile Number</p>
                                    <p className="font-medium">{bdo.otpMobileNumber}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Created On</p>
                                    <p className="font-medium">{formatTimestampDate(bdo.createdAt)}</p>
                                </div>
                            </div>
                        </div>
                        {/* Documents */}
                        {bdo.documents && (
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Documents</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(bdo.documents).map(([key, url]) => (
                                        <div key={key} className="bg-gray-50 p-3 rounded-lg">
                                            <h4 className="font-medium text-sm mb-2">
                                                {key === 'cnicFront' ? 'CNIC Front' : 'CNIC Back'}
                                            </h4>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                                            >
                                                <Eye className="w-4 h-4 mr-1" />
                                                View Document
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Mapped Devices */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                Mapped Devices ({mappedRequests.length})
                            </h3>
                            {loading ? (
                                <div className="text-center py-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                </div>
                            ) : mappedRequests.length > 0 ? (
                                <div className="space-y-3">
                                    {mappedRequests.map(request => (
                                        <div key={request.id} className="bg-gray-50 p-4 rounded-lg">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium">IMEI: {request.imei}</p>
                                                    <p className="text-sm text-gray-600">
                                                        Mapped on: {formatTimestampDate(request.createdAt)}
                                                    </p>
                                                </div>
                                                <EnhancedStatusPill status={request.status} size="sm" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-4">No devices mapped to this BDO/Retailer</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
// ==================================================================================
// --- ENHANCED NEW REQUEST FORM WITH BDO SEARCH ---
// ==================================================================================
function NewRequestForm({ user, onCancel, existingRequest = null }) {
    const [searchMode, setSearchMode] = useState(!existingRequest);
    const [selectedBDO, setSelectedBDO] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [formData, setFormData] = useState({
        imei: '',
        shopName: '',
        city: '',
        streetAddress: '',
        latitude: '',
        longitude: '',
        premiseRelationship: ''
    });
    const [files, setFiles] = useState({});
    const [compressing, setCompressing] = useState({});
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const isEditing = !!existingRequest;
    useEffect(() => {
        if (isEditing) {
            const loadExistingData = async () => {
                setFormData({
                    imei: existingRequest.imei || '',
                    shopName: existingRequest.shopName || '',
                    city: existingRequest.city || '',
                    streetAddress: existingRequest.streetAddress || '',
                    latitude: existingRequest.latitude || '',
                    longitude: existingRequest.longitude || '',
                    premiseRelationship: existingRequest.premiseRelationship || ''
                });
                
                if (existingRequest.bdoId) {
                    try {
                        const bdoQuery = query(
                            collection(db, 'bdoAccounts'),
                            where('bdoId', '==', existingRequest.bdoId)
                        );
                        const bdoSnapshot = await getDocs(bdoQuery);
                        if (!bdoSnapshot.empty) {
                            const bdoData = { id: bdoSnapshot.docs[0].id, ...bdoSnapshot.docs[0].data() };
                            setSelectedBDO(bdoData);
                            setSearchMode(false);
                        }
                    } catch (error) {
                        // Handle error silently
                    }
                }
                
                setFiles(existingRequest.documents || {});
            };
            
            loadExistingData();
        }
    }, [isEditing, existingRequest]);
const handleBDOSearch = async () => {
    console.log('=== BDO SEARCH DEBUG ===');
    console.log('Search term:', searchTerm);
    console.log('User franchiseCode:', user?.franchiseCode);
    
    // Enhanced validation for user data before making queries
    if (!user) {
        console.log('Cannot search BDO - no user');
        toast.error('User session not available');
        return;
    }
    const franchiseCodeValue = user.franchiseCode;
    if (!franchiseCodeValue || 
        franchiseCodeValue === undefined || 
        franchiseCodeValue === null ||
        franchiseCodeValue === '' ||
        franchiseCodeValue === 'undefined' ||
        typeof franchiseCodeValue !== 'string' ||
        franchiseCodeValue.trim() === '') {
        
        console.log('Cannot search BDO - invalid franchiseCode:', {
            franchiseCode: franchiseCodeValue,
            type: typeof franchiseCodeValue
        });
        toast.error('Franchise information not available for search');
        return;
    }
    
    if (!searchTerm.trim()) {
        toast.error('Please enter a search term');
        return;
    }
    setSearching(true);
    setError('');
    try {
        const cleanedSearch = searchTerm.replace(/\D/g, '');
        console.log('Cleaned search:', cleanedSearch);
        
        // Final validation before Firestore query construction
        const validatedCode = String(franchiseCodeValue).trim();
        if (!validatedCode || validatedCode === 'undefined') {
            console.log('❌ Final validation failed for franchiseCode, aborting BDO search');
            toast.error('Invalid franchise code for search');
            setSearching(false);
            return;
        }
        // Defensive: Validate validatedCode before Firestore queries
        if (!validatedCode || typeof validatedCode === 'undefined' || validatedCode === 'undefined' || validatedCode === null || validatedCode === '') {
            console.error('❌ Invalid validatedCode for BDO search:', validatedCode);
            setSearchResults([]);
            setSearching(false);
            return;
        }
        
        let q;
        if (cleanedSearch.length === 13) {
            console.log('Searching by CNIC');
            q = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', validatedCode),
                where('cnicNumber', '==', formatCnic(cleanedSearch))
            );
        } else if (cleanedSearch.length === 11) {
            console.log('Searching by Mobile');
            q = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', validatedCode),
                where('otpMobileNumber', '==', formatPhone(cleanedSearch))
            );
        } else {
            console.log('Searching all BDOs for this franchise');
            q = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', validatedCode)
            );
        }
        console.log('Executing query...');
        const snapshot = await getDocs(q);
        console.log('Query returned:', snapshot.size, 'documents');
        
        let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('Raw results:', results);
        if (cleanedSearch.length !== 13 && cleanedSearch.length !== 11) {
            const searchLower = searchTerm.toLowerCase();
            console.log('Filtering by search term:', searchLower);
            
            results = results.filter(bdo => {
                const nameMatch = bdo.name?.toLowerCase().includes(searchLower);
                const idMatch = bdo.bdoId?.toLowerCase().includes(searchLower);
                console.log(`BDO ${bdo.name}: nameMatch=${nameMatch}, idMatch=${idMatch}`);
                return nameMatch || idMatch;
            });
        }
        console.log('Final filtered results:', results);
        setSearchResults(results);
        if (results.length === 0) {
            setError('No BDO/Retailer found. Please create a new account first.');
            console.log('No results found');
        } else {
            console.log('Found', results.length, 'BDO(s)');
        }
    } catch (error) {
        console.error('Search error:', error);
        setError('Error searching for BDO/Retailer: ' + error.message);
    } finally {
        setSearching(false);
        console.log('=== SEARCH COMPLETE ===');
    }
};
    const handleSelectBDO = async (bdo) => {
        try {
            // Defensive: Validate bdoId before Firestore query
            if (!bdo || !bdo.bdoId || typeof bdo.bdoId === 'undefined' || bdo.bdoId === null || bdo.bdoId === '') {
                console.error('❌ Invalid bdoId for mapping query:', bdo?.bdoId);
                toast.error('Invalid BDO selected');
                return;
            }
            const existingMappingQuery = query(
                collection(db, 'requestsV2'),
                where('bdoId', '==', bdo.bdoId),
                where('status', 'in', [
                    REQUEST_STATUSES.SUBMITTED,
                    REQUEST_STATUSES.SALES_APPROVED,
                    REQUEST_STATUSES.OPERATIONS_APPROVED,
                    REQUEST_STATUSES.IN_PROCESSING,
                    REQUEST_STATUSES.COMPLETED
                ])
            );
            
            const existingMappingSnapshot = await getDocs(existingMappingQuery);
            
            if (!existingMappingSnapshot.empty && !isEditing) {
                setError('This BDO/Retailer already has an active or pending mapping request. Please contact Phygital team.');
                return;
            }
            setSelectedBDO(bdo);
            setSearchMode(false);
            setError('');
        } catch (error) {
            setError('Error selecting BDO/Retailer');
        }
    };
    const handleInputChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleSelectChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleFileChange = async (e) => {
        const { name, files: inputFiles } = e.target;
        if (inputFiles.length === 0) return;
        const file = inputFiles[0];
        if (file.type.startsWith('image/')) {
            setCompressing(prev => ({ ...prev, [name]: true }));
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true
            };
            try {
                const compressedFile = await imageCompression(file, options);
                setFiles(prev => ({ ...prev, [name]: compressedFile }));
                toast.success('Image compressed successfully');
            } catch (compressionError) {
                setError('Failed to compress image. Please try another file.');
                setFiles(prev => ({ ...prev, [name]: null }));
            } finally {
                setCompressing(prev => ({ ...prev, [name]: false }));
            }
        } else {
            setFiles(prev => ({ ...prev, [name]: file }));
        }
    };
    const handleGetLocation = () => {
        if (navigator.geolocation) {
            setIsLoadingLocation(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude.toFixed(6),
                        longitude: position.coords.longitude.toFixed(6)
                    }));
                    setIsLoadingLocation(false);
                },
                () => {
                    setError('Unable to retrieve location. Please enter manually.');
                    setIsLoadingLocation(false);
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        if (!selectedBDO) {
            setError("Please select a BDO/Retailer first.");
            setIsSubmitting(false);
            return;
        }
        if (!formData.latitude || !formData.longitude) {
        setError("Latitude and Longitude are required. Please use the 'Get Location' button or enter them manually.");
        setIsSubmitting(false);
        return;
    }
        if (!formData.imei || formData.imei.trim().length === 0) {
            setError("IMEI is required.");
            setIsSubmitting(false);
            return;
        }
        // Check if IMEI is already mapped
        try {
            const imeiQuery = query(
                collection(db, 'requestsV2'),
                where('imei', '==', formData.imei),
                where('status', 'in', [
                    REQUEST_STATUSES.SUBMITTED,
                    REQUEST_STATUSES.SALES_APPROVED,
                    REQUEST_STATUSES.OPERATIONS_APPROVED,
                    REQUEST_STATUSES.IN_PROCESSING,
                    REQUEST_STATUSES.COMPLETED
                ])
            );
            
            const imeiSnapshot = await getDocs(imeiQuery);
            
            if (!imeiSnapshot.empty && !isEditing) {
                setError('This IMEI is already mapped or has a pending request.');
                setIsSubmitting(false);
                return;
            }
        } catch (error) {
            setError('Error validating IMEI');
            setIsSubmitting(false);
            return;
        }
        const requiredFiles = ['shopPictureInside', 'shopPictureOutside'];
        
        if (!isEditing) {
            if (!selectedBDO.documents?.cnicFront || !selectedBDO.documents?.cnicBack) {
                setError('BDO/Retailer documents are missing. Please contact support.');
                setIsSubmitting(false);
                return;
            }
        }
        
        for (const file of requiredFiles) {
            if (!files[file] && (!existingRequest || !existingRequest.documents?.[file])) {
                const friendlyName = file.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                setError(`Please upload the "${friendlyName}" image.`);
                setIsSubmitting(false);
                return;
            }
        }
        await handleFinalSubmit();
    };
    const handleFinalSubmit = async () => {
        try {
            // Upload new files
            const uploadPromises = Object.keys(files).map(async (key) => {
                const file = files[key];
                if (typeof file === 'string') {
                    return { key, url: file };
                }
                const storageRef = ref(storage, `documents/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                return { key, url };
            });
            const uploadResults = await Promise.all(uploadPromises);
            const fileURLs = {};
            
            uploadResults.forEach(result => {
                fileURLs[result.key] = result.url;
            });
            // Include BDO's CNIC documents
            if (!isEditing && selectedBDO.documents) {
                fileURLs.cnicFront = selectedBDO.documents.cnicFront;
                fileURLs.cnicBack = selectedBDO.documents.cnicBack;
            }
            const requestData = {
                ...formData,
                franchiseId: user.uid,
                franchiseName: user.name || user.email,
                franchiseCode: user.franchiseCode,
                bdoId: selectedBDO.bdoId,
                bdoName: selectedBDO.name,
                cnicNumber: selectedBDO.cnicNumber,
                otpMobileNumber: selectedBDO.otpMobileNumber,
                shopLocation: {
                    latitude: parseFloat(formData.latitude) || 0,
                    longitude: parseFloat(formData.longitude) || 0
                },
                updatedAt: Timestamp.now(),
                documents: fileURLs
            };
            if (isEditing) {
                requestData.status = REQUEST_STATUSES.SUBMITTED; // Use proper constant instead of string
                requestData.assignedTo = USER_ROLES.SALES_TEAM;
                requestData.isResubmission = true;
                requestData.revisionCount = (existingRequest.revisionCount || 0) + 1;
                requestData.previousRejectionReason = existingRequest.rejectionReason;
                requestData.resubmittedAt = Timestamp.now();
                
                // Build revision history
                requestData.revisionHistory = [
                    ...(existingRequest.revisionHistory || []),
                    {
                        rejectedAt: existingRequest.updatedAt,
                        rejectionReason: existingRequest.rejectionReason,
                        resubmittedAt: new Date(), // Use Date object instead of serverTimestamp() in arrays
                        revisionNumber: (existingRequest.revisionCount || 0) + 1
                    }
                ];
                
                // Clear current rejection reason after storing in history
                requestData.rejectionReason = "";
                
                const requestRef = doc(db, 'requestsV2', existingRequest.id);
                await updateDoc(requestRef, requestData);
                toast.success('Request updated successfully!');
            } else {
                requestData.status = REQUEST_STATUSES.SUBMITTED;  // Use proper constant
                requestData.assignedTo = USER_ROLES.SALES_TEAM;
                requestData.createdAt = Timestamp.now();
                requestData.isResubmission = false;
                requestData.revisionCount = 0;
                requestData.revisionHistory = [];
                requestData.rejectionReason = "";
                await addDoc(collection(db, 'requestsV2'), requestData);
                toast.success('Request submitted successfully!');
            }
            onCancel();
        } catch (err) {
            console.error(err);
            setError('A critical error occurred during submission. Please try again.');
            setIsSubmitting(false);
        }
    };
    const pakistaniCities = ["Abbottabad", "Arifwala", "Attock", "Awaran", "Bahawalpur", "Bahawalnagar", "Bannu", "Barkhan", "Bhakkar", "Burewala", "Chagai", "Chakwal", "Chaman", "Charsadda", "Chichawatni", "Chiniot", "Chitral", "Dadu", "Daska", "Dera Ghazi Khan", "Dera Ismail Khan", "Faisalabad", "Ghotki", "Gilgit", "Gojra", "Gujranwala", "Gujrat", "Gwadar", "Hafizabad", "Haripur", "Hyderabad", "Islamabad", "Jacobabad", "Jamshoro", "Jhang", "Jhelum", "Kamoke", "Karachi", "Kasur", "Khairpur", "Khanewal", "Hassan Abdal" ,"Kharan", "Kharian", "Khushab", "Khuzdar", "Killa Abdullah", "Killa Saifullah", "Kohat", "Kot Addu", "Lahore", "Larkana", "Layyah", "Lodhran", "Loralai", "Mandi Bahauddin", "Mansehra", "Mardan", "Mianwali", "Mingora", "Mirpur", "Mirpur Khas", "Multan", "Muridke", "Muzaffargarh", "Narowal", "Nawabshah", "Nowshera", "Okara", "Pakpattan", "Peshawar", "Quetta", "Rahim Yar Khan", "Rawalpindi", "Sadiqabad", "Sahiwal", "Sanghar", "Sargodha", "Shahdadkot", "Sheikhupura", "Sherani", "Shikarpur", "Sialkot", "Sibi", "Sohbatpur", "Sukkur", "SWABI", "Tando Allahyar", "Tando Muhammad Khan", "Taxilla", "Thatta", "Toba Tek Singh", "Turbat", "Umerkot", "Vehari", "Wah Cantonment", "Washuk", "Wazirabad", "Zhob"].sort();
    if (isSubmitting) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl flex items-center space-x-4 max-w-sm mx-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <div>
                        <p className="text-lg font-semibold text-gray-800">Please wait...</p>
                        <p className="text-sm text-gray-600">Submitting your request</p>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 sm:px-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                                    {isEditing ? 'Edit Mapping Request' : 'New BVS Device Mapping Request'}
                                </h1>
                                <p className="text-blue-100 mt-2 text-sm sm:text-base">
                                    Complete the form below to submit your request
                                </p>
                            </div>
                            <Smartphone className="w-10 h-10 text-white opacity-50" />
                        </div>
                    </div>
                    <div className="p-4 sm:p-6 lg:p-8">
                        {/* Edit Warning */}
                        {isEditing && existingRequest.rejectionReason && (
                            <div className="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-400 p-4 mb-6 rounded-r-lg">
                                <div className="flex items-start">
                                    <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5" />
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-orange-800">Request Revision Required</h3>
                                        <p className="text-sm text-orange-700 mt-1">
                                            <strong>Team feedback:</strong> {existingRequest.rejectionReason}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* BDO Search Section */}
                        {searchMode && !isEditing ? (
                            <div className="mb-6">
                                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 sm:p-6 border border-purple-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                        <Search className="w-5 h-5 mr-2 text-purple-600" />
                                        Search BDO/Retailer
                                    </h3>
                                    
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Search by CNIC, Mobile, Name, or BDO ID..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                onKeyPress={(e) => e.key === 'Enter' && handleBDOSearch()}
                                                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                            />
                                            <button
                                                onClick={handleBDOSearch}
                                                disabled={searching}
                                                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                                            >
                                                {searching ? (
                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                                ) : (
                                                    'Search'
                                                )}
                                            </button>
                                        </div>
                                        {/* Search Results */}
                                        {searchResults.length > 0 && (
                                            <div className="mt-4 space-y-2">
                                                <p className="text-sm font-medium text-gray-700">
                                                    Found {searchResults.length} result{searchResults.length > 1 ? 's' : ''}:
                                                </p>
                                                <div className="max-h-60 overflow-y-auto space-y-2">
                                                    {searchResults.map(bdo => (
                                                        <div
                                                            key={bdo.id}
                                                            onClick={() => handleSelectBDO(bdo)}
                                                            className={`p-4 border rounded-lg cursor-pointer transition-all ${
                                                                bdo.status !== BDO_STATUSES.APPROVED
                                                                    ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100'
                                                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="font-semibold">{bdo.name}</p>
                                                                    <p className="text-sm text-gray-600">
                                                                        ID: {bdo.bdoId} | CNIC: {bdo.cnicNumber}
                                                                    </p>
                                                                </div>
                                                                <BDOStatusPill status={bdo.status} size="sm" />
                                                            </div>
                                                            {bdo.status !== BDO_STATUSES.APPROVED && (
                                                                <p className="text-xs text-yellow-600 mt-2">
                                                                    ⚠️ Not yet approved by sales team
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* No BDO Found */}
                                        {error && error.includes('No BDO/Retailer found') && (
                                            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                <p className="text-blue-800 mb-3">{error}</p>
                                                <button
                                                    onClick={() => onCancel()}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                                                >
                                                    <UserPlus className="w-4 h-4 inline mr-2" />
                                                    Create New BDO/Retailer
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Selected BDO Display */}
                                {selectedBDO && (
                                    <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-semibold text-green-800">Selected BDO/Retailer</h3>
                                                <p className="text-sm text-green-700 mt-1">
                                                    {selectedBDO.name} - ID: {selectedBDO.bdoId}
                                                </p>
                                                <p className="text-xs text-green-600 mt-1">
                                                    CNIC: {selectedBDO.cnicNumber} | Mobile: {selectedBDO.otpMobileNumber}
                                                </p>
                                            </div>
                                            {!isEditing && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedBDO(null);
                                                        setSearchMode(true);
                                                        setSearchResults([]);
                                                        setSearchTerm('');
                                                    }}
                                                    className="text-green-600 hover:text-green-800 text-sm"
                                                >
                                                    Change
                                                </button>
                                            )}
                                        </div>
                                        {selectedBDO.status !== BDO_STATUSES.APPROVED && (
                                            <p className="text-xs text-yellow-600 mt-2 bg-yellow-50 p-2 rounded">
                                                ⚠️ Note: This BDO/Retailer is not yet approved by sales team
                                            </p>
                                        )}
                                    </div>
                                )}
                                {/* Request Form */}
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Device Information */}
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-200">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                            <Smartphone className="w-5 h-5 mr-2 text-blue-600" />
                                            Device Information
                                        </h3>
                                        
                                        <InputField
                                            label="BVS Device IMEI"
                                            name="imei"
                                            value={formData.imei}
                                            onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                            placeholder="Enter IMEI number"
                                            required
                                        />
                                    </div>
                                    {/* Location Details */}
                                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 sm:p-6 border border-green-200">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                            <MapPin className="w-5 h-5 mr-2 text-green-600" />
                                            Location Details
                                        </h3>
                                        
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
                                            <InputField
                                                label="Shop or Location Name"
                                                name="shopName"
                                                value={formData.shopName}
                                                onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                                placeholder="Enter shop or business name"
                                                required
                                            />
                                            <SelectField
                                                label="City"
                                                name="city"
                                                value={formData.city}
                                                onChange={handleSelectChange}
                                                required
                                            >
                                                <option value="">-- Select City --</option>
                                                {pakistaniCities.map(c => <option key={c} value={c}>{c}</option>)}
                                                </SelectField>
                                            </div>
                                            <div className="mb-6">
                                                <InputField
                                                label="Street Address of Seller Location"
                                                name="streetAddress"
                                                value={formData.streetAddress}
                                                onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                                required
                                            />
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                                            <InputField
                                                label="Latitude"
                                                name="latitude"
                                                type="number"
                                                step="any"
                                                value={formData.latitude}
                                                onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                                placeholder="e.g., 33.6844"
                                                required
                                            />
                                            <InputField
                                                label="Longitude"
                                                name="longitude"
                                                type="number"
                                                step="any"
                                                value={formData.longitude}
                                                onChange={(e) => handleInputChange(e.target.name, e.target.value)}
                                                placeholder="e.g., 73.0479"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={handleGetLocation}
                                                disabled={isLoadingLocation}
                                                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 disabled:opacity-50 h-12 flex items-center justify-center"
                                            >
                                                {isLoadingLocation ? (
                                                    <div className="flex items-center">
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                        Getting Location...
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center">
                                                        <MapPin className="w-4 h-4 mr-2" />
                                                        <span className="hidden sm:inline">Get Location</span>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                        
                                        <div className="mt-6">
                                            <SelectField
                                                label="Relationship with Premises"
                                                name="premiseRelationship"
                                                value={formData.premiseRelationship}
                                                onChange={handleSelectChange}
                                                required
                                            >
                                                <option value="">-- Select Relationship --</option>
                                                <option>Owner</option>
                                                <option>Tenant</option>
                                                <option>Partner</option>
                                                <option>Family Member</option>
                                            </SelectField>
                                        </div>
                                    </div>
                                    {/* Required Documents */}
                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 sm:p-6 border border-purple-200">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                            <FileText className="w-5 h-5 mr-2 text-purple-600" />
                                            Shop Pictures
                                        </h3>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                            <FileInput
                                                label="Shop Picture (Inside)"
                                                name="shopPictureInside"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                                required={!existingRequest?.documents?.shopPictureInside}
                                                file={files.shopPictureInside}
                                                isCompressing={compressing.shopPictureInside}
                                                allowGallery={true}
                                            />
                                            <FileInput
                                                label="Shop Picture (Outside)"
                                                name="shopPictureOutside"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                                required={!existingRequest?.documents?.shopPictureOutside}
                                                file={files.shopPictureOutside}
                                                isCompressing={compressing.shopPictureOutside}
                                                allowGallery={true}
                                            />
                                        </div>
                                        
                                        {selectedBDO && (
                                            <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                                                <p className="text-sm text-purple-800">
                                                    <Info className="w-4 h-4 inline mr-1" />
                                                    CNIC documents will be automatically included from the selected BDO/Retailer profile
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {/* Error Message */}
                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <div className="flex items-center">
                                                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                                                <p className="text-red-700 font-medium">{error}</p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t border-gray-200">
                                        <button
                                            type="button"
                                            onClick={onCancel}
                                            className="w-full sm:w-auto bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors duration-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !selectedBDO}
                                            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                    Processing...
                                                </div>
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                    Submit Request
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
// ==================================================================================
// --- TRANSFER OF OWNERSHIP FORM ---
// ==================================================================================
function TransferOwnershipForm({ user, onCancel }) {
    const [step, setStep] = useState(1); // 1 for IMEI search, 2 for form
    const [searchImei, setSearchImei] = useState('');
    const [isFetchingImei, setIsFetchingImei] = useState(false);
    const [originalRequest, setOriginalRequest] = useState(null);
    const [selectedNewBDO, setSelectedNewBDO] = useState(null);
    const [newBdoSearchTerm, setNewBdoSearchTerm] = useState('');
    const [newBdoSearchResults, setNewBdoSearchResults] = useState([]);
    const [searchingNewBdo, setSearchingNewBdo] = useState(false);
    // [UPDATED] Added latitude, longitude, and isLoadingLocation state
    const [formData, setFormData] = useState({
        shopName: '',
        city: '',
        streetAddress: '',
        latitude: '',
        longitude: ''
    });
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [files, setFiles] = useState({});
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // --- IMEI Search Logic ---
    const handleImeiSearch = async () => {
        if (!searchImei) {
            toast.error("Please enter an IMEI to search.");
            return;
        }
        setIsFetchingImei(true);
        setError('');
        try {
            const q = query(
                collection(db, 'requestsV2'),
                where('imei', '==', searchImei),
                // where('status', '==', REQUEST_STATUSES.COMPLETED) // You may want to enforce this later
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                setError(`No request found for IMEI: ${searchImei}. Only existing requests can be transferred.`);
            } else {
                const doc = snapshot.docs[0];
                setOriginalRequest({ id: doc.id, ...doc.data() });
                setStep(2); // Move to the next step
            }
        } catch (err) {
            setError("An error occurred while searching for the IMEI.");
        } finally {
            setIsFetchingImei(false);
        }
    };
    // --- New BDO Search Logic (similar to NewRequestForm) ---
    const handleNewBdoSearch = async () => {
        if (!newBdoSearchTerm.trim()) return;
        
        // Enhanced validation for user data before making queries
        if (!user) {
            console.log('Cannot search BDO - no user');
            toast.error('User session not available');
            return;
        }
        const franchiseCodeValue = user.franchiseCode;
        if (!franchiseCodeValue || 
            franchiseCodeValue === undefined || 
            franchiseCodeValue === null ||
            franchiseCodeValue === '' ||
            franchiseCodeValue === 'undefined' ||
            typeof franchiseCodeValue !== 'string' ||
            franchiseCodeValue.trim() === '') {
            
            console.log('Cannot search BDO - invalid franchiseCode:', {
                franchiseCode: franchiseCodeValue,
                type: typeof franchiseCodeValue
            });
            toast.error('Franchise information not available for search');
            return;
        }
        
        setSearchingNewBdo(true);
        try {
            // Final validation before Firestore query construction
            const validatedCode = String(franchiseCodeValue).trim();
            if (!validatedCode || validatedCode === 'undefined') {
                console.log('❌ Final validation failed for franchiseCode, aborting new BDO search');
                toast.error('Invalid franchise code for search');
                setSearchingNewBdo(false);
                return;
            }
            const q = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', validatedCode),
                // where('status', '==', BDO_STATUSES.APPROVED) // You may want to enforce this later
            );
            const snapshot = await getDocs(q);
            let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const searchLower = newBdoSearchTerm.toLowerCase();
            results = results.filter(bdo =>
                bdo.name?.toLowerCase().includes(searchLower) ||
                bdo.bdoId?.toLowerCase().includes(searchLower) ||
                bdo.cnicNumber?.includes(searchLower)
            );
            setNewBdoSearchResults(results);
        } catch (err) {
            console.error('Error in new BDO search:', err);
            toast.error("Failed to search for BDOs.");
        } finally {
            setSearchingNewBdo(false);
        }
    };
    // [NEW] Function to get GPS location
    const handleGetLocation = () => {
        if (navigator.geolocation) {
            setIsLoadingLocation(true);
            setError('');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude.toFixed(6),
                        longitude: position.coords.longitude.toFixed(6)
                    }));
                    setIsLoadingLocation(false);
                    toast.success('Location captured!');
                },
                () => {
                    setError('Unable to retrieve location. Please grant permission or enter manually.');
                    setIsLoadingLocation(false);
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    };
    // [UPDATED] Main Submission Logic with validation and new fields
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!selectedNewBDO || !files.shopPictureInside || !files.shopPictureOutside) {
            setError("Please select a new BDO and upload both shop pictures.");
            return;
        }
        // Validation for latitude and longitude
        if (!formData.latitude || !formData.longitude) {
            setError("Latitude and Longitude are required. Please use the 'Get Location' button or enter them manually.");
            setIsSubmitting(false);
            return;
        }
        setIsSubmitting(true);
        try {
            // 1. Upload new images to Cloud Storage
            const uploadPromises = Object.keys(files).map(async (key) => {
                const file = files[key];
                const storageRef = ref(storage, `documents/${user.uid}/transfers/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                return { key, url: await getDownloadURL(snapshot.ref) };
            });
            const uploadResults = await Promise.all(uploadPromises);
            const newFileURLs = {};
            uploadResults.forEach(result => newFileURLs[result.key] = result.url);
            // 2. Prepare the new transfer request document
            const transferRequestData = {
                type: 'Transfer',
                status: "Pending", // Hardcoded status
                assignedTo: USER_ROLES.SALES_TEAM,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                franchiseId: user.uid,
                franchiseName: user.name || user.email,
                franchiseCode: user.franchiseCode,
                imei: originalRequest.imei,
                // Original ownership info
                originalRequestId: originalRequest.id,
                originalBdoId: originalRequest.bdoId,
                originalBdoName: originalRequest.bdoName,
                // New ownership info
                bdoId: selectedNewBDO.bdoId,
                bdoName: selectedNewBDO.name,
                cnicNumber: selectedNewBDO.cnicNumber,
                otpMobileNumber: selectedNewBDO.otpMobileNumber,
                // New location and documents
                ...formData,
                shopLocation: {
                    latitude: parseFloat(formData.latitude) || 0,
                    longitude: parseFloat(formData.longitude) || 0
                },
                documents: {
                    ...newFileURLs,
                    cnicFront: selectedNewBDO.documents.cnicFront,
                    cnicBack: selectedNewBDO.documents.cnicBack,
                }
            };
            // 3. Save the new request to Firestore
            await addDoc(collection(db, 'requestsV2'), transferRequestData);
            toast.success('Transfer of ownership request submitted successfully!');
            onCancel();
        } catch (err) {
            console.error("Transfer submission error:", err);
            setError("Failed to submit transfer request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Transfer of Ownership</h1>
                {/* Step 1: IMEI Search */}
                {step === 1 && (
                    <div className="space-y-4">
                        <p className="text-gray-600">Enter the IMEI of the device you wish to transfer.</p>
                        <div className="flex gap-2">
                            <InputField
                                label="Device IMEI"
                                name="imei"
                                value={searchImei}
                                onChange={(e) => setSearchImei(e.target.value)}
                                placeholder="Enter 15-digit IMEI"
                                required
                            />
                            <button onClick={handleImeiSearch} disabled={isFetchingImei} className="self-end bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                                {isFetchingImei ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>
                )}
                {/* Step 2: Transfer Form */}
                {step === 2 && originalRequest && (
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Original Details Section */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">Original Details</h2>
                            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-md">
                                <p><strong>IMEI:</strong> {originalRequest.imei}</p>
                                <p><strong>Status:</strong> <span className="font-mono bg-green-100 text-green-800 px-2 py-1 rounded">{originalRequest.status}</span></p>
                                <p><strong>Original BDO:</strong> {originalRequest.bdoName}</p>
                                <p><strong>Original BDO ID:</strong> {originalRequest.bdoId}</p>
                                <p className="col-span-2"><strong>Original Shop:</strong> {originalRequest.shopName} in {originalRequest.city}</p>
                            </div>
                        </div>
                        {/* New BDO Section */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">New Owner Details</h2>
                            <div className="flex gap-2 mb-2">
                                <InputField
                                    label="Search for New BDO/Retailer"
                                    placeholder="Search by name, ID, or CNIC"
                                    value={newBdoSearchTerm}
                                    onChange={(e) => setNewBdoSearchTerm(e.target.value)}
                                />
                                <button type="button" onClick={handleNewBdoSearch} disabled={searchingNewBdo} className="self-end bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                                    {searchingNewBdo ? '...' : 'Search'}
                                </button>
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                                {newBdoSearchResults.map(bdo => (
                                    <div key={bdo.id} onClick={() => { setSelectedNewBDO(bdo); setNewBdoSearchResults([]); }} className="p-2 border rounded-md cursor-pointer hover:bg-gray-100">
                                        <p className="font-semibold">{bdo.name} ({bdo.bdoId})</p>
                                    </div>
                                ))}
                            </div>
                            {selectedNewBDO && (
                                <div className="mt-4 bg-green-50 p-3 rounded-md text-green-800">
                                    <strong>Selected:</strong> {selectedNewBDO.name} ({selectedNewBDO.bdoId})
                                </div>
                            )}
                        </div>
                        {/* [UPDATED] New Location Section with coordinates */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">New Location Details</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField label="New Shop Name" name="shopName" value={formData.shopName} onChange={(e) => setFormData({...formData, shopName: e.target.value})} required />
                                <InputField label="City" name="city" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} required />
                                <div className="md:col-span-2">
                                    <InputField label="Street Address" name="streetAddress" value={formData.streetAddress} onChange={(e) => setFormData({...formData, streetAddress: e.target.value})} required />
                                </div>
                                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                                    <InputField
                                        label="Latitude"
                                        name="latitude"
                                        type="number"
                                        step="any"
                                        value={formData.latitude}
                                        onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                                        placeholder="e.g., 33.6844"
                                        required
                                    />
                                    <InputField
                                        label="Longitude"
                                        name="longitude"
                                        type="number"
                                        step="any"
                                        value={formData.longitude}
                                        onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                                        placeholder="e.g., 73.0479"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGetLocation}
                                        disabled={isLoadingLocation}
                                        className="bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition-all duration-200 disabled:opacity-50 h-12 flex items-center justify-center"
                                    >
                                        {isLoadingLocation ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        ) : (
                                          <div className="flex items-center">
                                            <MapPin className="w-4 h-4 mr-2" />
                                            <span>Get Location</span>
                                          </div>
                                        )}
                                    </button>
                                </div>
                                <FileInput label="New Shop Picture (Inside)" name="shopPictureInside" onChange={(e) => setFiles({...files, shopPictureInside: e.target.files[0]})} required />
                                <FileInput label="New Shop Picture (Outside)" name="shopPictureOutside" onChange={(e) => setFiles({...files, shopPictureOutside: e.target.files[0]})} required />
                            </div>
                        </div>
                        {/* Error & Action Buttons */}
                        {error && <p className="text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
                        <div className="flex justify-end gap-4 pt-4 border-t">
                            <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {isSubmitting ? 'Submitting...' : 'Submit Transfer Request'}
                            </button>
                        </div>
                    </form>
                )}
                 {error && !originalRequest && step === 1 && (
                    <div className="mt-4 text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
                )}
            </div>
        </div>
    );
}
// ==================================================================================
// --- SALES TEAM DASHBOARD ---
// ==================================================================================
function SalesTeamDashboard({ user, appServices, db }) {
    const [activeTab, setActiveTab] = useState(SALES_TABS.MAPPING_REQUESTS);
    const [dataScope, setDataScope] = useState('pending');
    const [selectedBDOId, setSelectedBDOId] = useState(null);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({});
    const [bdoRequests, setBdoRequests] = useState([]);
    const [mappingRequests, setMappingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [autoApproval, setAutoApproval] = useState({
        enabled: false,
        loading: true,
        updating: false,
        updatedAt: null,
        updatedBy: null
    });

    const SALES_PAGE_SIZE = 50;

    const uniqueValues = (values) => [...new Set(values.filter(Boolean))].slice(0, 10);

    const buildSalesQueries = useCallback(() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoTs = Timestamp.fromDate(sevenDaysAgo);

        const bdoPendingStatuses = uniqueValues([
            BDO_STATUSES.PENDING_APPROVAL,
            BDO_STATUSES.NEEDS_REVISION,
            BDO_STATUSES.REJECTED,
            BDO_STATUSES.ACTIVE,
            'Pending',
            'active',
            'PENDING_APPROVAL',
            'NEEDS_REVISION'
        ]);

        const requestPendingStatuses = uniqueValues([
            REQUEST_STATUSES.PENDING,
            REQUEST_STATUSES.SUBMITTED,
            REQUEST_STATUSES.SALES_REVIEW,
            REQUEST_STATUSES.NEEDS_REVISION,
            'Pending',
            'SUBMITTED',
            'SALES_REVIEW',
            'NEEDS_REVISION'
        ]);

        const completedRequestStatuses = uniqueValues([
            REQUEST_STATUSES.COMPLETED,
            'COMPLETED'
        ]);

        if (dataScope === 'completed') {
            return {
                bdoQuery: query(
                    collection(db, 'bdoAccounts'),
                    where('status', 'in', uniqueValues([BDO_STATUSES.APPROVED, BDO_STATUSES.ACTIVE])),
                    orderBy('createdAt', 'desc'),
                    limit(25)
                ),
                mappingQuery: query(
                    collection(db, 'requestsV2'),
                    where('status', 'in', completedRequestStatuses),
                    orderBy('createdAt', 'desc'),
                    limit(SALES_PAGE_SIZE)
                )
            };
        }

        if (dataScope === 'recent') {
            return {
                bdoQuery: query(
                    collection(db, 'bdoAccounts'),
                    where('createdAt', '>=', sevenDaysAgoTs),
                    orderBy('createdAt', 'desc'),
                    limit(SALES_PAGE_SIZE)
                ),
                mappingQuery: query(
                    collection(db, 'requestsV2'),
                    where('createdAt', '>=', sevenDaysAgoTs),
                    orderBy('createdAt', 'desc'),
                    limit(SALES_PAGE_SIZE)
                )
            };
        }

        return {
            bdoQuery: query(
                collection(db, 'bdoAccounts'),
                where('status', 'in', bdoPendingStatuses),
                orderBy('createdAt', 'desc'),
                limit(SALES_PAGE_SIZE)
            ),
            mappingQuery: query(
                collection(db, 'requestsV2'),
                where('status', 'in', requestPendingStatuses),
                orderBy('createdAt', 'desc'),
                limit(SALES_PAGE_SIZE)
            )
        };
    }, [dataScope, db]);

    const fetchSalesDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const { bdoQuery, mappingQuery } = buildSalesQueries();
            const [bdoSnap, mappingSnap] = await Promise.all([
                getDocs(bdoQuery),
                getDocs(mappingQuery)
            ]);

            const nextBdoRequests = bdoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const nextMappingRequests = mappingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            setBdoRequests(nextBdoRequests);
            setMappingRequests(nextMappingRequests);
            setSelectedBDOId(prev => prev && nextBdoRequests.some(item => item.id === prev) ? prev : null);
            setSelectedRequestId(prev => prev && nextMappingRequests.some(item => item.id === prev) ? prev : null);
        } catch (err) {
            console.error('Error loading sales dashboard data:', err);
            toast.error('Error loading dashboard records. Check Firestore indexes if this was just deployed.');
        } finally {
            setLoading(false);
        }
    }, [buildSalesQueries]);

    useEffect(() => {
        const settingRef = doc(db, 'systemSettings', 'salesAutoApproval');

        const unsubscribe = onSnapshot(
            settingRef,
            (snapshot) => {
                const setting = snapshot.exists() ? snapshot.data() : {};
                setAutoApproval(prev => ({
                    ...prev,
                    enabled: setting.enabled === true,
                    loading: false,
                    updatedAt: setting.updatedAt || null,
                    updatedBy: setting.updatedBy || null,
                    mode: setting.mode || (setting.enabled === true ? 'AUTO' : 'MANUAL')
                }));
            },
            (error) => {
                console.error('Error loading sales auto approval setting:', error);
                toast.error('Unable to load auto approval setting');
                setAutoApproval(prev => ({ ...prev, loading: false }));
            }
        );

        return () => unsubscribe();
    }, [db]);

    useEffect(() => {
        fetchSalesDashboardData();
    }, [fetchSalesDashboardData]);

    const handleRefreshMappingRequests = useCallback(() => {
        fetchSalesDashboardData();
    }, [fetchSalesDashboardData]);

    const handleAutoApprovalToggle = async () => {
        const nextEnabled = !autoApproval.enabled;
        setAutoApproval(prev => ({ ...prev, updating: true }));

        try {
            await setDoc(doc(db, 'systemSettings', 'salesAutoApproval'), {
                enabled: nextEnabled,
                mode: nextEnabled ? 'AUTO' : 'MANUAL',
                appliesTo: ['requestsV2', 'bdoAccounts'],
                updatedAt: Timestamp.now(),
                updatedBy: user.email || user.uid || 'Sales Team',
                updatedByUid: user.uid || null,
                updatedByRole: user.role || USER_ROLES.SALES_TEAM
            }, { merge: true });

            toast.success(nextEnabled
                ? 'Sales auto approval turned on. New incoming requests will go directly to Operations.'
                : 'Sales auto approval turned off. New incoming requests will stay in manual Sales review.'
            );
        } catch (error) {
            console.error('Failed to update sales auto approval setting:', error);
            toast.error('Failed to update auto approval setting');
        } finally {
            setAutoApproval(prev => ({ ...prev, updating: false }));
        }
    };

    const handleScopeChange = (scope) => {
        if (scope === dataScope) return;
        setDataScope(scope);
        setSearchTerm('');
        setFilters({});
        setSelectedBDOId(null);
        setSelectedRequestId(null);
    };

    const filterRequests = (requests, isBDO = false) => {
        let filtered = requests;
        
        if (searchTerm) {
            const search = searchTerm.toLowerCase().trim();
            filtered = filtered.filter(req => {
                if (isBDO) {
                    return req.name?.toLowerCase().includes(search) ||
                           req.bdoId?.toLowerCase().includes(search) ||
                           req.cnicNumber?.includes(search) ||
                           req.cnic?.includes(search) ||
                           req.otpMobileNumber?.includes(search) ||
                           req.franchiseName?.toLowerCase().includes(search) ||
                           req.handlerType?.toLowerCase().includes(search) ||
                           req.status?.toLowerCase().includes(search) ||
                           req.franchiseCode?.toLowerCase().includes(search);
                }

                const imei = req.deviceDetails?.imei || req.imei || '';
                const bdoId = req.bdoDetails?.bdoId || req.bdoId || '';
                const bdoName = req.bdoDetails?.name || req.bdoName || '';
                const cnicNumber = req.bdoDetails?.cnicNumber || req.cnicNumber || '';
                const otpMobile = req.bdoDetails?.otpMobileNumber || req.otpMobileNumber || '';
                const shopName = req.deviceDetails?.shopName || req.shopName || '';
                const city = req.deviceDetails?.city || req.city || '';
                const franchiseName = req.franchiseName || '';
                const franchiseCode = req.franchiseCode || '';
                const streetAddress = req.deviceDetails?.streetAddress || req.streetAddress || '';
                const requestType = req.requestType || req.type || '';
                const requestNumber = req.requestNumber || req.id || '';
                const status = req.status || '';
                const handlerType = req.bdoDetails?.handlerType || req.handlerType || '';
                
                return imei.toLowerCase().includes(search) ||
                       bdoId.toLowerCase().includes(search) ||
                       bdoName.toLowerCase().includes(search) ||
                       cnicNumber.includes(search) ||
                       otpMobile.includes(search) ||
                       shopName.toLowerCase().includes(search) ||
                       franchiseName.toLowerCase().includes(search) ||
                       franchiseCode.toLowerCase().includes(search) ||
                       city.toLowerCase().includes(search) ||
                       streetAddress.toLowerCase().includes(search) ||
                       requestType.toLowerCase().includes(search) ||
                       requestNumber.toLowerCase().includes(search) ||
                       status.toLowerCase().includes(search) ||
                       handlerType.toLowerCase().includes(search);
            });
        }
        
        if (filters.status) {
            const expectedStatus = String(filters.status).toLowerCase();
            filtered = filtered.filter(req => String(req.status || '').toLowerCase() === expectedStatus);
        }
        
        return filtered;
    };

    const countByStatus = (items, status) => items.filter(item => String(item.status || '').toLowerCase() === String(status || '').toLowerCase()).length;

    const handleDownloadCSV = (data, filename) => {
        exportToCsv(data, filename);
        toast.success('CSV exported successfully');
    };

    const handleDownloadZip = async (request) => {
        try {
            toast.info('Preparing download...');
            const zip = await createZipFile(request, true);
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${request.bdoId || request.id}_documents.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('Download completed');
        } catch (error) {
            toast.error('Failed to download files');
        }
    };

    const filteredBDORequests = filterRequests(bdoRequests, true);
    const filteredMappingRequests = filterRequests(mappingRequests, false);
    const revisionRequests = filteredMappingRequests.filter(req => req.isResubmission || String(req.status || '').toLowerCase() === String(REQUEST_STATUSES.NEEDS_REVISION).toLowerCase());
    const newRequests = filteredMappingRequests.filter(req => !req.isResubmission);

    const scopeOptions = [
        { id: 'pending', label: 'Pending queue', hint: 'Default sales worklist' },
        { id: 'recent', label: 'Last 7 days', hint: 'Recent activity only' },
        { id: 'completed', label: 'Completed', hint: 'Load on demand' }
    ];

    if (loading && bdoRequests.length === 0 && mappingRequests.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Sales Team Dashboard</h2>
                        <p className="text-sm md:text-base text-gray-600 mt-1">Review BDO/Retailer accounts and mapping requests with limited, on-demand reads.</p>
                        {revisionRequests.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                    {revisionRequests.length} revision{revisionRequests.length > 1 ? 's' : ''} pending
                                </span>
                                <span className="text-sm text-gray-500">Require immediate attention</span>
                            </div>
                        )}
                    </div>
                    <div className="w-full md:w-auto md:text-right">
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div className="text-center bg-blue-50 rounded-lg p-3">
                                <p className="text-2xl font-bold text-blue-600">{newRequests.length}</p>
                                <p className="text-xs text-gray-500">Loaded requests</p>
                            </div>
                            <div className="text-center bg-orange-50 rounded-lg p-3">
                                <p className="text-2xl font-bold text-orange-600">{revisionRequests.length}</p>
                                <p className="text-xs text-gray-500">Revisions</p>
                            </div>
                        </div>
                        <div className="mt-2 pt-2 border-t">
                            <p className="text-lg font-bold text-gray-800">{bdoRequests.length + mappingRequests.length}</p>
                            <p className="text-xs text-gray-500">Loaded records</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4 border border-blue-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900">Sales auto approval</h3>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                autoApproval.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                                {autoApproval.loading ? 'Loading' : autoApproval.enabled ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500">
                            When ON, new incoming mapping/transfer/location/OTP/de-mapping requests are Sales-approved automatically and assigned to Operations. New BDO/Retailer accounts are also approved automatically.
                        </p>
                        {autoApproval.updatedBy && (
                            <p className="text-xs text-gray-400 mt-1">
                                Last changed by {autoApproval.updatedBy}
                                {autoApproval.updatedAt ? ` • ${getFormattedDate(autoApproval.updatedAt, 'localeString')}` : ''}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleAutoApprovalToggle}
                        disabled={autoApproval.loading || autoApproval.updating}
                        className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
                            autoApproval.enabled
                                ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {autoApproval.updating
                            ? 'Updating...'
                            : autoApproval.enabled
                            ? 'Turn Auto Approval OFF'
                            : 'Turn Auto Approval ON'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Smart loading</h3>
                        <p className="text-xs text-gray-500">Only the selected scope is read from Firestore. Completed records are loaded only when selected.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {scopeOptions.map(option => (
                            <button
                                key={option.id}
                                onClick={() => handleScopeChange(option.id)}
                                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                                    dataScope === option.id
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                                title={option.hint}
                            >
                                {option.label}
                            </button>
                        ))}
                        <button
                            onClick={handleRefreshMappingRequests}
                            disabled={loading}
                            className="px-3 py-2 rounded-lg border text-sm text-gray-700 border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 inline mr-1 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md">
                <div className="border-b border-gray-200">
                    <nav className="flex gap-4 overflow-x-auto px-4 md:px-6" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab(SALES_TABS.BDO_REQUESTS)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeTab === SALES_TABS.BDO_REQUESTS
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            BDO/Retailer Requests
                            <span className="ml-2 bg-yellow-100 text-yellow-600 py-0.5 px-2 rounded-full text-xs">{bdoRequests.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab(SALES_TABS.MAPPING_REQUESTS)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeTab === SALES_TABS.MAPPING_REQUESTS
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Mapping Requests
                            <span className="ml-2 bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">{mappingRequests.length}</span>
                        </button>
                    </nav>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex flex-col lg:flex-row gap-4 mb-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder={activeTab === SALES_TABS.BDO_REQUESTS ?
                                "Search loaded BDOs: ID, CNIC, mobile, name, franchise..." :
                                "Search loaded requests: IMEI, BDO ID, name, CNIC, shop, city..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            setFilters({});
                        }}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Clear All
                    </button>
                </div>

                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Quick Status Filters</h4>
                    {activeTab === SALES_TABS.MAPPING_REQUESTS ? (
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setFilters(prev => ({ ...prev, status: '' }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${!filters.status ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>All ({filteredMappingRequests.length})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: REQUEST_STATUSES.PENDING }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === REQUEST_STATUSES.PENDING ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Pending ({countByStatus(mappingRequests, REQUEST_STATUSES.PENDING)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: REQUEST_STATUSES.SUBMITTED }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === REQUEST_STATUSES.SUBMITTED ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Submitted ({countByStatus(mappingRequests, REQUEST_STATUSES.SUBMITTED)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: REQUEST_STATUSES.SALES_REVIEW }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === REQUEST_STATUSES.SALES_REVIEW ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Sales Review ({countByStatus(mappingRequests, REQUEST_STATUSES.SALES_REVIEW)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: REQUEST_STATUSES.NEEDS_REVISION }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === REQUEST_STATUSES.NEEDS_REVISION ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Needs Revision ({countByStatus(mappingRequests, REQUEST_STATUSES.NEEDS_REVISION)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: REQUEST_STATUSES.COMPLETED }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === REQUEST_STATUSES.COMPLETED ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Completed ({countByStatus(mappingRequests, REQUEST_STATUSES.COMPLETED)})</button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setFilters(prev => ({ ...prev, status: '' }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${!filters.status ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>All ({filteredBDORequests.length})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: BDO_STATUSES.PENDING_APPROVAL }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === BDO_STATUSES.PENDING_APPROVAL ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Pending ({countByStatus(bdoRequests, BDO_STATUSES.PENDING_APPROVAL)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: BDO_STATUSES.NEEDS_REVISION }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === BDO_STATUSES.NEEDS_REVISION ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Needs Revision ({countByStatus(bdoRequests, BDO_STATUSES.NEEDS_REVISION)})</button>
                            <button onClick={() => setFilters(prev => ({ ...prev, status: BDO_STATUSES.APPROVED }))} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${filters.status === BDO_STATUSES.APPROVED ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>Approved ({countByStatus(bdoRequests, BDO_STATUSES.APPROVED)})</button>
                        </div>
                    )}
                </div>
            </div>

            {activeTab === SALES_TABS.BDO_REQUESTS ? (
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    <div className="xl:col-span-1">
                        <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">BDO Requests ({filteredBDORequests.length})</h3>
                            <button onClick={() => handleDownloadCSV(filteredBDORequests, 'bdo_requests.csv')} disabled={filteredBDORequests.length === 0} className="text-sm bg-gray-600 text-white py-2 px-3 rounded hover:bg-gray-700 disabled:opacity-50">
                                <Download className="w-3 h-3 inline mr-1" />CSV
                            </button>
                        </div>
                        <BDORequestList requests={filteredBDORequests} onSelectRequest={setSelectedBDOId} selectedRequestId={selectedBDOId} />
                    </div>
                    <div className="xl:col-span-3">
                        {selectedBDOId && filteredBDORequests.find(r => r.id === selectedBDOId) ? (
                            <BDORequestDetail request={filteredBDORequests.find(r => r.id === selectedBDOId)} user={user} onRefresh={handleRefreshMappingRequests} onDownloadZip={handleDownloadZip} />
                        ) : (
                            <div className="bg-white p-8 rounded-lg shadow-md text-center h-full flex items-center justify-center">
                                <div>
                                    <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                    <p className="text-gray-500 text-lg">{filteredBDORequests.length === 0 ? "No BDO requests found for the current scope/filter" : "Select a BDO request to view details"}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    <div className="xl:col-span-1">
                        <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">Mapping Requests ({filteredMappingRequests.length})</h3>
                            <button onClick={() => handleDownloadCSV(filteredMappingRequests, 'mapping_requests.csv')} disabled={filteredMappingRequests.length === 0} className="text-sm bg-gray-600 text-white py-2 px-3 rounded hover:bg-gray-700 disabled:opacity-50">
                                <Download className="w-3 h-3 inline mr-1" />CSV
                            </button>
                        </div>
                        <MappingRequestList requests={filteredMappingRequests} onSelectRequest={setSelectedRequestId} selectedRequestId={selectedRequestId} />
                    </div>
                    <div className="xl:col-span-3">
                        {selectedRequestId && filteredMappingRequests.find(r => r.id === selectedRequestId) ? (
                            <MappingRequestDetail request={filteredMappingRequests.find(r => r.id === selectedRequestId)} user={user} db={db} onRefresh={handleRefreshMappingRequests} onDownloadZip={handleDownloadZip} />
                        ) : (
                            <div className="bg-white p-8 rounded-lg shadow-md text-center h-full flex items-center justify-center">
                                <div>
                                    <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                    <p className="text-gray-500 text-lg">{filteredMappingRequests.length === 0 ? "No mapping requests found for the current scope/filter" : "Select a mapping request to view details"}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
// BDO Request List Component
const BDORequestList = ({ requests, onSelectRequest, selectedRequestId }) => {
    if (requests.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No BDO requests found</h3>
                <p className="text-gray-500">No requests match your current filters</p>
            </div>
        );
    }
    return (
        <div className="bg-white rounded-lg shadow-md max-h-[80vh] overflow-y-auto">
            <div className="p-4">
                <div className="space-y-3">
                    {requests.map((request) => (
                        <div
                            key={request.id}
                            onClick={() => onSelectRequest(request.id)}
                            className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                                selectedRequestId === request.id
                                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                        {request.name}
                                    </p>
                                    <p className="text-xs text-gray-600 mb-1">
                                        <span className="font-medium">Type:</span> {request.handlerType}
                                    </p>
                                    <p className="text-xs text-gray-600 mb-1">
                                        <span className="font-medium">ID:</span> {request.bdoId}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {getTimeAgo(request.createdAt)} • {request.franchiseName}
                                    </p>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                    <BDOStatusPill status={request.status} size="sm" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
// Mapping Request List Component
const MappingRequestList = ({ requests, onSelectRequest, selectedRequestId }) => {
    if (requests.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No mapping requests found</h3>
                <p className="text-gray-500">No requests match your current filters</p>
            </div>
        );
    }
    const getRequestTypeIcon = (requestType) => {
        switch (requestType) {
            case 'NEW_MAPPING':
                return '📱';
            case 'TRANSFER_OWNERSHIP':
                return '🔄';
            case 'OTP_CHANGE':
                return '📞';
            case 'DEVICE_REPLACEMENT':
                return '🔧';
            case 'DE_MAPPING':
                return '🔓';
            case 'LOCATION_UPDATE':
                return '📍';
            default:
                return '📋';
        }
    };

    const getRequestTypeLabel = (requestType) => {
        switch (requestType) {
            case 'NEW_MAPPING':
                return 'New Mapping';
            case 'TRANSFER_OWNERSHIP':
                return 'Transfer Ownership';
            case 'OTP_CHANGE':
                return 'OTP Change';
            case 'DEVICE_REPLACEMENT':
                return 'Device Replacement';
            case 'DE_MAPPING':
                return 'De-Mapping';
            case 'LOCATION_UPDATE':
                return 'Location Change';
            default:
                return 'Unknown Request';
        }
    };

    const getRequestTypeColors = (requestType) => {
        switch (requestType) {
            case 'NEW_MAPPING':
                return 'bg-blue-100 text-blue-900 border-blue-300';
            case 'TRANSFER_OWNERSHIP':
                return 'bg-teal-100 text-teal-900 border-teal-300';
            case 'OTP_CHANGE':
                return 'bg-orange-100 text-orange-900 border-orange-300';
            case 'DEVICE_REPLACEMENT':
                return 'bg-purple-100 text-purple-900 border-purple-300';
            case 'DE_MAPPING':
                return 'bg-red-100 text-red-900 border-red-300';
            case 'LOCATION_UPDATE':
                return 'bg-yellow-100 text-yellow-900 border-yellow-300';
            default:
                return 'bg-gray-100 text-gray-900 border-gray-300';
        }
    };
    
    // Sort requests to prioritize revisions
    const sortedRequests = [...requests].sort((a, b) => {
        // Revision requests first
        if (a.isResubmission && !b.isResubmission) return -1;
        if (!a.isResubmission && b.isResubmission) return 1;
        
        // Then by creation date (newest first)
        const aDate = getDateForSort(a.createdAt);
        const bDate = getDateForSort(b.createdAt);
        
        return bDate - aDate;
    });
    
    return (
        <div className="bg-white rounded-lg shadow-md max-h-[80vh] overflow-y-auto">
            <div className="p-4">
                <div className="space-y-3">
                    {sortedRequests.map((request) => (
                        <div
                            key={request.id}
                            onClick={() => onSelectRequest(request.id)}
                            className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                                selectedRequestId === request.id
                                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                                    : request.isResubmission 
                                    ? 'bg-orange-50 border-orange-300 hover:bg-orange-100'
                                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center mb-1 flex-wrap gap-2">
                                        <span className="text-lg">
                                            {getRequestTypeIcon(request.requestType || request.type)}
                                        </span>
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {request.bdoDetails?.name || request.bdoName || request.franchiseName}
                                        </p>
                                        
                                        {/* Request Type Badge with Colors */}
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium border ${getRequestTypeColors(request.requestType || request.type)}`}>
                                            {getRequestTypeLabel(request.requestType || request.type)}
                                        </span>
                                        
                                        {/* Revision Indicator */}
                                        {request.isResubmission && request.revisionCount > 0 && (
                                            <span className="bg-orange-100 text-orange-800 border border-orange-200 text-xs px-2 py-1 rounded-full flex items-center font-medium">
                                                🔄 Revision #{request.revisionCount}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Previous Rejection Warning for Sales Team */}
                                    {request.isResubmission && request.previousRejectionReason && (
                                        <div className="bg-orange-100 border-l-2 border-orange-400 p-2 mb-2 rounded-r text-xs">
                                            <p className="font-medium text-orange-800">Previously rejected:</p>
                                            <p className="text-orange-700 truncate">{request.previousRejectionReason}</p>
                                        </div>
                                    )}
                                    
                                    <p className="text-xs text-gray-600 mb-1">
                                        <span className="font-medium">IMEI:</span> {request.deviceDetails?.imei || request.imei || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-600 mb-1">
                                        <span className="font-medium">BDO ID:</span> {request.bdoDetails?.bdoId || request.bdoId}
                                    </p>
                                    <p className="text-xs text-gray-600 mb-1">
                                        <span className="font-medium">Shop:</span> {request.deviceDetails?.shopName || request.shopName || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {getTimeAgo(request.createdAt)} • {request.deviceDetails?.city || request.city}
                                        {request.resubmittedAt && (
                                            <span className="text-orange-600 ml-2">
                                                • Resubmitted: {getTimeAgo(request.resubmittedAt)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex-shrink-0 ml-2 flex flex-col items-end space-y-1">
                                    {/* Status Pill - More Prominent */}
                                    <div className="flex items-center">
                                        <EnhancedStatusPill status={request.status} size="sm" />
                                    </div>
                                    
                                    {/* Revision Badge */}
                                    {request.isResubmission && (
                                        <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium border border-orange-600">
                                            REVISION
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
// ==================================================================================
// --- REQUEST DETAIL COMPONENTS ---
// ==================================================================================
// BDO Request Detail Component
const BDORequestDetail = ({ request, user, onRefresh, onDownloadZip }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, type: null });
    const handleUpdateBDO = async (updatePayload) => {
        setIsProcessing(true);
        try {
            const requestRef = doc(db, 'bdoAccounts', request.id);
            
            await updateDoc(requestRef, {
                ...updatePayload,
                updatedAt: Timestamp.now(),
                lastUpdatedBy: user.uid
            });
            // If rejecting BDO, also reject related mapping requests
            if (updatePayload.status === BDO_STATUSES.REJECTED) {
                const mappingQuery = query(
                    collection(db, 'requestsV2'),
                    where('bdoId', '==', request.bdoId),
                    where('status', 'in', [REQUEST_STATUSES.SUBMITTED, REQUEST_STATUSES.PENDING])
                );
                
                const mappingSnapshot = await getDocs(mappingQuery);
                const batch = writeBatch(db);
                
                mappingSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        status: REQUEST_STATUSES.REJECTED,
                        rejectionReason: 'BDO/Retailer request was rejected',
                        updatedAt: Timestamp.now()
                    });
                });
                
                await batch.commit();
            }
            toast.success('BDO request updated successfully!');
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error('Failed to update BDO request');
        } finally {
            setIsProcessing(false);
        }
    };
    const openModal = (type) => setModalState({ isOpen: true, type });
    const closeModal = () => setModalState({ isOpen: false, type: null });
    
    const confirmAction = (inputValue) => {
        const updatePayload = {};
        
        switch (modalState.type) {
            case 'approve':
                updatePayload.status = BDO_STATUSES.APPROVED;
                break;
            case 'revision':
                updatePayload.status = BDO_STATUSES.NEEDS_REVISION;
                updatePayload.revisionReason = inputValue;
                break;
            case 'reject':
                updatePayload.status = BDO_STATUSES.REJECTED;
                updatePayload.rejectionReason = inputValue;
                break;
            default:
                break;
        }
        
        handleUpdateBDO(updatePayload);
        closeModal();
    };
    return (
        <div className="bg-white rounded-lg shadow-md h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <User className="w-5 h-5 mr-2" />
                            {request.name}
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Type:</span> {request.handlerType} • 
                            <span className="font-medium"> ID:</span> {request.bdoId}
                        </p>
                    </div>
                    <BDOStatusPill status={request.status} size="lg" />
                </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Basic Information */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-600">Full Name</p>
                            <p className="font-medium">{request.name}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Handler Type</p>
                            <p className="font-medium">{request.handlerType}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">CNIC Number</p>
                            <p className="font-medium">{request.cnicNumber}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Mobile Number</p>
                            <p className="font-medium">{request.otpMobileNumber}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Franchise</p>
                            <p className="font-medium">{request.franchiseName}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Created</p>
                            <p className="font-medium">{getFormattedDate(request.createdAt, 'localeString')}</p>
                        </div>
                    </div>
                </div>
                {/* Documents */}
                {request.documents && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Documents</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(request.documents).map(([key, url]) => (
                                <div key={key} className="bg-gray-50 p-3 rounded-lg">
                                    <h4 className="font-medium text-sm mb-2">
                                        {key === 'cnicFront' ? 'CNIC Front' : 'CNIC Back'}
                                    </h4>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                                    >
                                        <Eye className="w-4 h-4 mr-1" />
                                        View Document
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {/* Actions */}
                <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Actions</h3>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => handleUpdateBDO({ status: BDO_STATUSES.APPROVED })}
                            disabled={isProcessing}
                            className="bg-green-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </button>
                        <button
                            onClick={() => openModal('revision')}
                            disabled={isProcessing}
                            className="bg-orange-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center"
                        >
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Request Revision
                        </button>
                        <button
                            onClick={() => openModal('reject')}
                            disabled={isProcessing}
                            className="bg-red-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </button>
                        <button
                            onClick={() => onDownloadZip(request)}
                            className="bg-blue-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-600 flex items-center"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download Files
                        </button>
                    </div>
                </div>
            </div>
            {/* Action Modal */}
            <ActionModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                onConfirm={confirmAction}
                title={
                    modalState.type === 'revision' ? 'Revision Reason' :
                    modalState.type === 'reject' ? 'Rejection Reason' : 'Confirm Action'
                }
                placeholder={
                    modalState.type === 'revision' ? 'Please provide reason for revision...' :
                    modalState.type === 'reject' ? 'Please provide reason for rejection...' :
                    'Add notes...'
                }
                required={modalState.type === 'revision' || modalState.type === 'reject'}
            />
        </div>
    );
};
// Mapping Request Detail Component
const MappingRequestDetail = ({ request, user, db, onRefresh, onDownloadZip }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, type: null });
    const [currentBdoDetails, setCurrentBdoDetails] = useState(null);
    const [loadingCurrentBdo, setLoadingCurrentBdo] = useState(false);
    const [newBdoDetails, setNewBdoDetails] = useState(null);
    const [loadingNewBdo, setLoadingNewBdo] = useState(false);
    
    // Fetch current BDO details from bdoAccounts collection
    const fetchCurrentBdoDetails = async (bdoId) => {
        if (!bdoId) return null;
        
        setLoadingCurrentBdo(true);
        console.log('Fetching BDO details for ID:', bdoId);
        
        try {
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('bdoId', '==', bdoId)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);
            console.log('BDO query result - docs count:', bdoSnapshot.docs.length);
            
            if (!bdoSnapshot.empty) {
                const bdoData = bdoSnapshot.docs[0].data();
                console.log('BDO data found:', bdoData);
                setCurrentBdoDetails(bdoData);
                return bdoData;
            } else {
                console.warn('Current BDO not found in bdoAccounts collection:', bdoId);
                setCurrentBdoDetails(null);
                return null;
            }
        } catch (error) {
            console.error('Error fetching current BDO details:', error);
            setCurrentBdoDetails(null);
            return null;
        } finally {
            setLoadingCurrentBdo(false);
        }
    };

    // Fetch new BDO details from bdoAccounts collection
    const fetchNewBdoDetails = async (bdoId) => {
        if (!bdoId) return null;
        
        setLoadingNewBdo(true);
        console.log('Fetching NEW BDO details for ID:', bdoId);
        
        try {
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('bdoId', '==', bdoId)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);
            console.log('NEW BDO query result - docs count:', bdoSnapshot.docs.length);
            
            if (!bdoSnapshot.empty) {
                const bdoData = bdoSnapshot.docs[0].data();
                console.log('NEW BDO data found:', bdoData);
                setNewBdoDetails(bdoData);
                return bdoData;
            } else {
                console.warn('New BDO not found in bdoAccounts collection:', bdoId);
                setNewBdoDetails(null);
                return null;
            }
        } catch (error) {
            console.error('Error fetching new BDO details:', error);
            setNewBdoDetails(null);
            return null;
        } finally {
            setLoadingNewBdo(false);
        }
    };

    // Load BDO details sequentially for transfer requests
    useEffect(() => {
        if (request.requestType === 'TRANSFER_OWNERSHIP') {
            const sourceBdoId = request.transferDetails?.sourceBdoId;
            const newBdoId = request.bdoDetails?.bdoId || request.bdoId;
            
            console.log('Transfer request detected. Source BDO ID:', sourceBdoId, 'New BDO ID:', newBdoId);
            
            // Sequential loading: first current BDO, then new BDO
            const loadBdoDetails = async () => {
                // Load current BDO first
                if (sourceBdoId) {
                    await fetchCurrentBdoDetails(sourceBdoId);
                }
                
                // Then load new BDO
                if (newBdoId) {
                    await fetchNewBdoDetails(newBdoId);
                }
            };
            
            loadBdoDetails();
        }
    }, [request.requestType, request.transferDetails?.sourceBdoId, request.bdoDetails?.bdoId, request.bdoId]);

    // Debug: Log request structure to help diagnose data issues
    console.log('MappingRequestDetail - Request data:', {
        request,
        hasDeviceDetails: !!request.deviceDetails,
        hasBdoDetails: !!request.bdoDetails,
        hasDocuments: !!request.documents,
        hasDeviceDocuments: !!request.deviceDetails?.documents,
        coordinates: {
            deviceDetailsShopLocation: request.deviceDetails?.shopLocation,
            shopLocation: request.shopLocation,
            locationInfoCoordinates: request.locationInfo?.coordinates,
            directLatLng: { lat: request.latitude, lng: request.longitude }
        }
    });
    const handleUpdateRequest = async (updatePayload) => {
        setIsProcessing(true);
        try {
            const requestRef = doc(db, 'requestsV2', request.id);
            
            const finalPayload = {
                ...updatePayload,
                updatedAt: Timestamp.now(),
                lastUpdatedBy: user.uid
            };
            
            await updateDoc(requestRef, finalPayload);
            toast.success('Request updated successfully!');
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error updating request:', error);
            toast.error('Failed to update request: ' + error.message);
        } finally {
            setIsProcessing(false);
        }
    };
    const checkBDOApproval = async () => {
        try {
            // Enhanced BDO ID detection for different request types
            let bdoId = null;
            
            if (request.requestType === 'DE_MAPPING' || request.requestType === 'LOCATION_UPDATE') {
                // For DE_MAPPING and LOCATION_UPDATE, check current mapping first, then fallback to standard locations
                bdoId = request.currentMapping?.bdoDetails?.bdoId || 
                        request.bdoDetails?.bdoId || 
                        request.bdoId;
            } else if (request.requestType === 'TRANSFER_OWNERSHIP') {
                // For transfers, check new BDO (the one being transferred to)
                bdoId = request.bdoDetails?.bdoId || request.bdoId;
            } else {
                // For standard requests (NEW_MAPPING, OTP_CHANGE, etc.)
                bdoId = request.bdoDetails?.bdoId || request.bdoId;
            }
            
            if (!bdoId) {
                console.log('BDO ID lookup failed. Request data:', {
                    requestType: request.requestType,
                    bdoDetails: request.bdoDetails,
                    currentMapping: request.currentMapping,
                    directBdoId: request.bdoId
                });
                toast.error('No BDO ID found in request');
                return false;
            }
            
            console.log(`Found BDO ID for ${request.requestType}: ${bdoId}`);
            
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('bdoId', '==', bdoId)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);
            
            if (!bdoSnapshot.empty) {
                const bdoData = bdoSnapshot.docs[0].data();
                
                if (bdoData.status !== BDO_STATUSES.APPROVED) {
                    const requestTypeLabel = request.requestType === 'DE_MAPPING' ? 'de-mapping' :
                                           request.requestType === 'LOCATION_UPDATE' ? 'location change' :
                                           request.requestType === 'TRANSFER_OWNERSHIP' ? 'transfer' : 'mapping';
                    toast.error(`BDO/Retailer (${bdoId}) must be approved first before approving the ${requestTypeLabel} request`);
                    return false;
                }
                
                console.log(`BDO approval check passed for ${request.requestType} request: ${bdoId} is approved`);
                return true;
            } else {
                toast.error(`BDO/Retailer (${bdoId}) not found in system`);
                return false;
            }
        } catch (error) {
            console.error('Error checking BDO approval:', error);
            toast.error('Error checking BDO approval: ' + error.message);
            return false;
        }
    };
    const openModal = (type) => setModalState({ isOpen: true, type });
    const closeModal = () => setModalState({ isOpen: false, type: null });
    
    const confirmAction = async (inputValue) => {
        const updatePayload = {};
        
        switch (modalState.type) {
            case 'approve':
                const canApprove = await checkBDOApproval();
                if (!canApprove) {
                    closeModal();
                    return;
                }
                updatePayload.status = REQUEST_STATUSES.SALES_APPROVED;
                updatePayload.assignedTo = USER_ROLES.OPERATIONS_TEAM;
                updatePayload.assignedToOperationsAt = Timestamp.now();
                break;
            case 'revision':
                updatePayload.status = REQUEST_STATUSES.NEEDS_REVISION;
                updatePayload.rejectionReason = inputValue;
                updatePayload.assignedTo = USER_ROLES.FRANCHISE;
                break;
            case 'reject':
                updatePayload.status = REQUEST_STATUSES.REJECTED;
                updatePayload.rejectionReason = inputValue;
                break;
            default:
                break;
        }
        
        handleUpdateRequest(updatePayload);
        closeModal();
    };
    // Function to get request type display
    const getRequestTypeDisplay = () => {
        const requestType = request.requestType || request.type;
        switch (requestType) {
            case 'NEW_MAPPING':
                return { label: 'New Device Mapping', icon: '📱', color: 'bg-blue-100 text-blue-800' };
            case 'TRANSFER_OWNERSHIP':
                return { label: 'Transfer of Ownership', icon: '🔄', color: 'bg-green-100 text-green-800' };
            case 'OTP_CHANGE':
                return { label: 'OTP Mobile Change', icon: '📞', color: 'bg-orange-100 text-orange-800' };
            case 'DEVICE_REPLACEMENT':
                return { label: 'Device Replacement', icon: '🔧', color: 'bg-purple-100 text-purple-800' };
            case 'DE_MAPPING':
                return { label: 'Device De-Mapping', icon: '❌', color: 'bg-red-100 text-red-800' };
            case 'LOCATION_UPDATE':
                return { label: 'Location Change', icon: '📍', color: 'bg-yellow-100 text-yellow-800' };
            default:
                return { label: 'Mapping Request', icon: '📋', color: 'bg-gray-100 text-gray-800' };
        }
    };
    const requestTypeInfo = getRequestTypeDisplay();
    return (
        <div className="bg-white rounded-lg shadow-md h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <Smartphone className="w-5 h-5 mr-2" />
                            {request.deviceDetails?.imei || request.imei || 'No IMEI'}
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Request ID: {request.requestNumber || request.id}
                        </p>
                    </div>
                    <EnhancedStatusPill status={request.status} size="lg" />
                </div>
                 
                {/* Request Type Badge */}
                <div className="flex items-center mb-3">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${requestTypeInfo.color}`}>
                        <span className="mr-2">{requestTypeInfo.icon}</span>
                        {requestTypeInfo.label}
                    </span>
                </div>
                
                {/* Revision Status Banner */}
                {request.isResubmission && (
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-l-4 border-orange-400 p-4 mb-4 rounded-r-lg">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3 flex-1">
                                <h3 className="text-sm font-medium text-orange-800">
                                    🔄 REVISION REQUEST - This request was previously rejected
                                </h3>
                                <div className="mt-1 text-sm text-orange-700">
                                    <p>
                                        <span className="font-medium">Revision #{request.revisionCount}</span> • 
                                        Resubmitted on {getFormattedDate(request.resubmittedAt, 'localeDateString')}
                                    </p>
                                    {request.previousRejectionReason && (
                                        <p className="mt-1">
                                            <span className="font-medium">Previous rejection reason:</span> {request.previousRejectionReason}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Transfer-specific sections or standard sections based on request type */}
                {request.requestType === 'TRANSFER_OWNERSHIP' ? (
                    <>
                        {/* Transfer Overview */}
                        <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                                Transfer Overview
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Device IMEI</p>
                                    <p className="text-lg font-mono text-blue-800">{request.deviceDetails?.imei || request.imei}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Original Request ID</p>
                                    <p className="text-sm text-gray-700">{request.transferDetails?.originalRequestId || request.originalRequestId|| 'N/A'}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Franchise</p>
                                    <p className="text-sm text-gray-700">{request.franchiseName || 'Unknown'}</p>
                                </div>
                            </div>
                        </div>

                        {/* BDO Transfer Details */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                BDO Transfer Details
                            </h3>

                            {/* Current BDO (From) */}
                            <div className="bg-red-50 border-l-4 border-red-400 rounded-r-lg p-4">
                                <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Transferring FROM (Current BDO)
                                </h4>
                                <div className="bg-white rounded-lg p-4">
                                    {loadingCurrentBdo ? (
                                        <div className="flex items-center justify-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
                                            <span className="ml-2 text-gray-600">Loading current BDO details...</span>
                                        </div>
                                    ) : currentBdoDetails ? (
                                        <div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">BDO ID</p>
                                                    <p className="font-medium text-lg">{currentBdoDetails.bdoId}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Full Name</p>
                                                    <p className="font-medium">{currentBdoDetails.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">CNIC Number</p>
                                                    <p className="font-medium font-mono">{currentBdoDetails.cnic || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                                    <p className="font-medium font-mono">{currentBdoDetails.otpMobileNumber || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Franchise Code</p>
                                                    <p className="font-medium">{currentBdoDetails.franchiseCode || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Status</p>
                                                    <p className="font-medium">
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            currentBdoDetails.status === 'active' ? 'bg-green-100 text-green-800' :
                                                            currentBdoDetails.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {currentBdoDetails.status || 'Unknown'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            {/* Current BDO CNIC Images from bdoAccounts */}
                                            {(currentBdoDetails.cnicFrontImageUrl || currentBdoDetails.cnicBackImageUrl) && (
                                                <div className="border-t pt-3">
                                                    <h5 className="text-sm font-medium text-gray-700 mb-2">Current BDO CNIC Documents</h5>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {currentBdoDetails.cnicFrontImageUrl && (
                                                            <div>
                                                                <p className="text-xs text-gray-600 mb-1">CNIC Front</p>
                                                                <img 
                                                                    src={currentBdoDetails.cnicFrontImageUrl} 
                                                                    alt="Current BDO CNIC Front" 
                                                                    className="w-full max-w-xs border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                                                    onClick={() => window.open(currentBdoDetails.cnicFrontImageUrl, '_blank')}
                                                                />
                                                            </div>
                                                        )}
                                                        {currentBdoDetails.cnicBackImageUrl && (
                                                            <div>
                                                                <p className="text-xs text-gray-600 mb-1">CNIC Back</p>
                                                                <img 
                                                                    src={currentBdoDetails.cnicBackImageUrl} 
                                                                    alt="Current BDO CNIC Back" 
                                                                    className="w-full max-w-xs border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                                                    onClick={() => window.open(currentBdoDetails.cnicBackImageUrl, '_blank')}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                                <p className="text-yellow-800 text-sm">
                                                    ⚠️ Current BDO details not found in bdoAccounts collection. 
                                                    Showing fallback data from request.
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">BDO ID</p>
                                                    <p className="font-medium text-lg">{request.transferDetails?.sourceBdoId || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Full Name</p>
                                                    <p className="font-medium">{request.transferDetails?.sourceBdoName || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">CNIC Number</p>
                                                    <p className="font-medium">{request.originalBdoCnic || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                                    <p className="font-medium">{request.originalBdoOtp || 'Not Available'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Fallback: Show original BDO documents if available and no bdoAccounts data */}
                                    {!currentBdoDetails && (request.originalBdoDocuments?.cnicFront || request.originalBdoDocuments?.cnicBack) && (
                                        <div className="border-t pt-3">
                                            <h5 className="text-sm font-medium text-gray-700 mb-2">Current BDO CNIC Documents (from request)</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {request.originalBdoDocuments?.cnicFront && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">CNIC Front</p>
                                                        <img 
                                                            src={request.originalBdoDocuments.cnicFront} 
                                                            alt="Current BDO CNIC Front" 
                                                            className="w-full h-32 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.originalBdoDocuments.cnicFront, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                                {request.originalBdoDocuments?.cnicBack && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">CNIC Back</p>
                                                        <img 
                                                            src={request.originalBdoDocuments.cnicBack} 
                                                            alt="Current BDO CNIC Back" 
                                                            className="w-full h-32 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.originalBdoDocuments.cnicBack, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Transfer Arrow */}
                            <div className="flex justify-center">
                                <div className="bg-blue-100 p-3 rounded-full">
                                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                    </svg>
                                </div>
                            </div>

                            {/* New BDO (To) */}
                            <div className="bg-green-50 border-l-4 border-green-400 rounded-r-lg p-4">
                                <h4 className="font-semibold text-green-800 mb-3 flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                    Transferring TO (New BDO)
                                </h4>
                                <div className="bg-white rounded-lg p-4">
                                    {loadingNewBdo ? (
                                        <div className="flex items-center justify-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                                            <span className="ml-2 text-gray-600">Loading new BDO details...</span>
                                        </div>
                                    ) : newBdoDetails ? (
                                        <div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">BDO ID</p>
                                                    <p className="font-medium text-lg">{newBdoDetails.bdoId}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Full Name</p>
                                                    <p className="font-medium">{newBdoDetails.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">CNIC Number</p>
                                                    <p className="font-medium font-mono">{newBdoDetails.cnic || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                                    <p className="font-medium font-mono">{newBdoDetails.otpMobileNumber || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Franchise Code</p>
                                                    <p className="font-medium">{newBdoDetails.franchiseCode || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Status</p>
                                                    <p className="font-medium">
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            newBdoDetails.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                                            newBdoDetails.status === 'active' ? 'bg-green-100 text-green-800' :
                                                            newBdoDetails.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {newBdoDetails.status || 'Unknown'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            {/* New BDO CNIC Images from bdoAccounts */}
                                            {(newBdoDetails.cnicFrontImageUrl || newBdoDetails.cnicBackImageUrl) && (
                                                <div className="border-t pt-3">
                                                    <h5 className="text-sm font-medium text-gray-700 mb-2">New BDO CNIC Documents (from bdoAccounts)</h5>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {newBdoDetails.cnicFrontImageUrl && (
                                                            <div>
                                                                <p className="text-xs text-gray-600 mb-1">CNIC Front</p>
                                                                <img 
                                                                    src={newBdoDetails.cnicFrontImageUrl} 
                                                                    alt="New BDO CNIC Front" 
                                                                    className="w-full max-w-xs border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                                                    onClick={() => window.open(newBdoDetails.cnicFrontImageUrl, '_blank')}
                                                                />
                                                            </div>
                                                        )}
                                                        {newBdoDetails.cnicBackImageUrl && (
                                                            <div>
                                                                <p className="text-xs text-gray-600 mb-1">CNIC Back</p>
                                                                <img 
                                                                    src={newBdoDetails.cnicBackImageUrl} 
                                                                    alt="New BDO CNIC Back" 
                                                                    className="w-full max-w-xs border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                                                    onClick={() => window.open(newBdoDetails.cnicBackImageUrl, '_blank')}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                                <p className="text-yellow-800 text-sm">
                                                    ⚠️ New BDO details not found in bdoAccounts collection. 
                                                    Showing fallback data from request.
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">BDO ID</p>
                                                    <p className="font-medium text-lg">{request.bdoDetails?.bdoId || request.bdoId || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Full Name</p>
                                                    <p className="font-medium">{request.bdoDetails?.name || request.bdoName || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">CNIC Number</p>
                                                    <p className="font-medium">{request.bdoDetails?.cnic || request.bdoDetails?.cnicNumber || request.cnicNumber || 'Not Available'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                                    <p className="font-medium">{request.bdoDetails?.otpMobileNumber || request.otpMobileNumber || 'Not Available'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Fallback: Show new BDO documents from request if no bdoAccounts data */}
                                    {!newBdoDetails && (request.bdoDocuments?.cnicFront || request.bdoDocuments?.cnicBack) && (
                                        <div className="border-t pt-3">
                                            <h5 className="text-sm font-medium text-gray-700 mb-2">New BDO CNIC Documents (from request)</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {request.bdoDocuments?.cnicFront && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">CNIC Front</p>
                                                        <img 
                                                            src={request.bdoDocuments.cnicFront} 
                                                            alt="New BDO CNIC Front" 
                                                            className="w-full h-32 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.bdoDocuments.cnicFront, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                                {request.bdoDocuments?.cnicBack && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">CNIC Back</p>
                                                        <img 
                                                            src={request.bdoDocuments.cnicBack} 
                                                            alt="New BDO CNIC Back" 
                                                            className="w-full h-32 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.bdoDocuments.cnicBack, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Location Transfer Details */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Location Transfer Details
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Current Location */}
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Current Location
                                    </h4>
                                    <div className="bg-white rounded-lg p-3 mb-3">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-sm text-gray-600">Shop Name</p>
                                                <p className="font-medium">{request.deviceDetails?.currentShopName || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">City</p>
                                                <p className="font-medium">{request.deviceDetails?.currentCity || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Street Address</p>
                                                <p className="font-medium">{request.deviceDetails?.currentStreetAddress || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">GPS Coordinates</p>
                                                <p className="font-medium">
                                                    {(() => {
                                                        const coords = request.deviceDetails?.coordinates;
                                                        if (coords && coords.lat && coords.lng) {
                                                            return (
                                                                <span className="flex items-center text-sm">
                                                                    <svg className="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    {parseFloat(coords.lat)?.toFixed(6)}, {parseFloat(coords.lng)?.toFixed(6)}
                                                                </span>
                                                            );
                                                        }
                                                        return <span className="text-red-500">Not Available</span>;
                                                    })()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Location Shop Images */}
                                    {(request.currentShopImages?.inside || request.currentShopImages?.outside) && (
                                        <div>
                                            <h5 className="text-sm font-medium text-gray-700 mb-2">Current Shop Images</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {request.currentShopImages?.inside && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">Inside</p>
                                                        <img 
                                                            src={request.currentShopImages.inside} 
                                                            alt="Current Shop Inside" 
                                                            className="w-full h-24 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.currentShopImages.inside, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                                {request.currentShopImages?.outside && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">Outside</p>
                                                        <img 
                                                            src={request.currentShopImages.outside} 
                                                            alt="Current Shop Outside" 
                                                            className="w-full h-24 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.currentShopImages.outside, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* New Location */}
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-green-800 mb-3 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        New Location
                                    </h4>
                                    <div className="bg-white rounded-lg p-3 mb-3">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-sm text-gray-600">Shop Name</p>
                                                <p className="font-medium">{request.deviceDetails?.newShopName || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">City</p>
                                                <p className="font-medium">{request.deviceDetails?.newCity || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Street Address</p>
                                                <p className="font-medium">{request.deviceDetails?.newStreetAddress || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Premise Relationship</p>
                                                <p className="font-medium">{request.deviceDetails?.premiseRelationship || 'Not Available'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">GPS Coordinates</p>
                                                <p className="font-medium">
                                                    {(() => {
                                                        const coords = request.deviceDetails?.newCoordinates;
                                                        if (coords && (coords.lat || coords.latitude) && (coords.lng || coords.longitude)) {
                                                            const lat = coords.lat || coords.latitude;
                                                            const lng = coords.lng || coords.longitude;
                                                            return (
                                                                <span className="flex items-center text-sm">
                                                                    <svg className="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    {parseFloat(lat)?.toFixed(6)}, {parseFloat(lng)?.toFixed(6)}
                                                                </span>
                                                            );
                                                        }
                                                        return <span className="text-red-500">Not Available</span>;
                                                    })()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* New Location Shop Images */}
                                    {(request.documents?.shopInsideImage || request.documents?.shopOutsideImage || 
                                      request.deviceDetails?.shopInsideImage || request.deviceDetails?.shopOutsideImage) && (
                                        <div>
                                            <h5 className="text-sm font-medium text-gray-700 mb-2">New Shop Images</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {(request.documents?.shopInsideImage || request.deviceDetails?.shopInsideImage) && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">Inside</p>
                                                        <img 
                                                            src={request.documents?.shopInsideImage || request.deviceDetails?.shopInsideImage} 
                                                            alt="New Shop Inside" 
                                                            className="w-full h-24 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.documents?.shopInsideImage || request.deviceDetails?.shopInsideImage, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                                {(request.documents?.shopOutsideImage || request.deviceDetails?.shopOutsideImage) && (
                                                    <div>
                                                        <p className="text-xs text-gray-600 mb-1">Outside</p>
                                                        <img 
                                                            src={request.documents?.shopOutsideImage || request.deviceDetails?.shopOutsideImage} 
                                                            alt="New Shop Outside" 
                                                            className="w-full h-24 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.documents?.shopOutsideImage || request.deviceDetails?.shopOutsideImage, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : request.requestType === 'LOCATION_UPDATE' ? (
                    <>
                        {/* LOCATION_UPDATE Overview */}
                        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-yellow-900 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Location Change Request
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Device IMEI</p>
                                    <p className="text-lg font-mono text-yellow-900 break-all">
                                        {request.device?.imei || request.deviceInfo?.imei || request.deviceDetails?.imei || request.currentMapping?.deviceInfo?.imei || 'Not Available'}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Current BDO ID</p>
                                    <p className="text-sm text-gray-700">{request.bdoDetails?.bdoId || request.currentMapping?.bdoDetails?.bdoId || 'N/A'}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Franchise</p>
                                    <p className="text-sm text-gray-700">{request.franchiseName || 'Unknown'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <h4 className="font-semibold text-gray-800 mb-3">Current Location Snapshot</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <span className="text-gray-600">Shop</span>
                                        <span className="font-medium text-right">{request.currentMapping?.locationDetails?.shopName || request.deviceDetails?.shopName || 'Not Available'}</span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <span className="text-gray-600">City</span>
                                        <span className="font-medium text-right">{request.currentMapping?.locationDetails?.city || request.deviceDetails?.city || 'Not Available'}</span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <span className="text-gray-600">Current Lat/Lon</span>
                                        <span className="font-mono text-right break-all">
                                            {request.previousLocation?.latitude ?? request.currentMapping?.locationDetails?.latitude ?? request.deviceDetails?.latitude ?? 'null'}, {request.previousLocation?.longitude ?? request.currentMapping?.locationDetails?.longitude ?? request.deviceDetails?.longitude ?? 'null'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <h4 className="font-semibold text-yellow-900 mb-3">Requested Action</h4>
                                {request.newLocation?.hasCoordinates ? (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between gap-3">
                                            <span className="text-yellow-800">New Latitude</span>
                                            <span className="font-mono text-yellow-900">{request.newLocation.latitude}</span>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <span className="text-yellow-800">New Longitude</span>
                                            <span className="font-mono text-yellow-900">{request.newLocation.longitude}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-yellow-900 font-medium">Reset device latitude and longitude to null after Operations completion.</p>
                                )}
                            </div>
                        </div>

                        {request.locationChangeReason && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h4 className="font-semibold text-gray-800 mb-2">Remarks</h4>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.locationChangeReason}</p>
                            </div>
                        )}
                    </>
                ) : request.requestType === 'DE_MAPPING' ? (
                    <>
                        {/* DE_MAPPING Overview */}
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                                Device De-Mapping Request
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Device IMEI</p>
                                    <p className="text-lg font-mono text-red-800">{request.deviceInfo?.imei || request.imei || request.currentMapping?.deviceInfo?.imei || 'Not Available'}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Current BDO ID</p>
                                    <p className="text-sm text-gray-700">{request.bdoDetails?.bdoId || request.currentMapping?.bdoDetails?.bdoId || 'N/A'}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-600 font-medium">Franchise</p>
                                    <p className="text-sm text-gray-700">{request.franchiseName || 'Unknown'}</p>
                                </div>
                            </div>
                        </div>

                        {/* De-mapping Reason */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h4 className="font-semibold text-yellow-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Reason for De-Mapping
                            </h4>
                            <div className="bg-white rounded-lg p-4">
                                <p className="text-gray-800 font-medium">
                                    {request.demappingReason || request.demapReason || 'No reason specified'}
                                </p>
                            </div>
                        </div>

                        {/* Current Mapping Details */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                Current BDO/Retailer Details
                            </h3>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="bg-white rounded-lg p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-600">BDO ID</p>
                                            <p className="font-medium text-lg">{request.bdoDetails?.bdoId || request.currentMapping?.bdoDetails?.bdoId || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Full Name</p>
                                            <p className="font-medium">{request.bdoDetails?.name || request.currentMapping?.bdoDetails?.name || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">CNIC Number</p>
                                            <p className="font-medium font-mono">{request.bdoDetails?.cnic || request.currentMapping?.bdoDetails?.cnic || request.bdoCnic || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                            <p className="font-medium font-mono">{request.bdoDetails?.phoneNumber || request.currentMapping?.bdoDetails?.phoneNumber || request.otpMobileNumber || 'Not Available'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Current Location Details */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Current Location Details
                            </h3>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="bg-white rounded-lg p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Shop Name</p>
                                            <p className="font-medium">{request.currentMapping?.locationDetails?.shopName || request.shopName || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">City</p>
                                            <p className="font-medium">{request.currentMapping?.locationDetails?.city || request.city || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Street Address</p>
                                            <p className="font-medium">{request.currentMapping?.locationDetails?.streetAddress || request.streetAddress || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Premise Relationship</p>
                                            <p className="font-medium">{request.premiseRelationship || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">GPS Coordinates</p>
                                            <p className="font-medium">
                                                {(() => {
                                                    const coords = request.currentMapping?.locationDetails;
                                                    const lat = coords?.latitude || request.latitude;
                                                    const lng = coords?.longitude || request.longitude;
                                                    
                                                    if (lat && lng) {
                                                        return (
                                                            <span className="flex items-center text-sm">
                                                                <svg className="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                                {parseFloat(lat)?.toFixed(6)}, {parseFloat(lng)?.toFixed(6)}
                                                            </span>
                                                        );
                                                    }
                                                    return <span className="text-red-500">Not Available</span>;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Device Information */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Device Information
                            </h3>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="bg-white rounded-lg p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Device IMEI</p>
                                            <p className="font-medium font-mono text-lg">{request.deviceInfo?.imei || request.imei || request.currentMapping?.deviceInfo?.imei || 'Not Available'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Device Model</p>
                                            <p className="font-medium">{request.deviceInfo?.model || request.currentMapping?.deviceInfo?.model || 'Not specified'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Current Status</p>
                                            <p className="font-medium">
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    (request.deviceInfo?.status || request.currentMapping?.deviceInfo?.status) === 'Mapped' ? 'bg-green-100 text-green-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {request.deviceInfo?.status || request.currentMapping?.deviceInfo?.status || 'Unknown'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Standard BDO Information for non-transfer requests */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <Users className="w-5 h-5 mr-2" />
                                BDO/Retailer Details
                            </h3>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-600">BDO ID</p>
                                        <p className="font-medium text-lg">{request.bdoDetails?.bdoId || request.bdoId || 'Not Available'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Full Name</p>
                                        <p className="font-medium">{request.bdoDetails?.name || request.bdoName || 'Not Available'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">CNIC Number</p>
                                        <p className="font-medium">{request.bdoDetails?.cnic || request.bdoDetails?.cnicNumber || request.cnicNumber || 'Not Available'}</p>
                                    </div>
                                    {request.requestType === 'OTP_CHANGE' ? (
                                        // For OTP Change requests, show both previous and new OTP numbers
                                        <>
                                            <div>
                                                <p className="text-sm text-gray-600">Previous OTP Number</p>
                                                <p className="font-medium text-red-600">
                                                    {request.bdoDetails?.currentOtpMobileNumber || request.bdoDetails?.otpMobileNumber || request.otpMobileNumber || 'Not Available'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">New OTP Number</p>
                                                <p className="font-medium text-green-600">
                                                    {request.bdoDetails?.newOtpMobileNumber || 'Not Available'}
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        // For other request types, show standard OTP mobile number
                                        <div>
                                            <p className="text-sm text-gray-600">OTP Mobile Number</p>
                                            <p className="font-medium">{request.bdoDetails?.otpMobileNumber || request.otpMobileNumber || 'Not Available'}</p>
                                        </div>
                                    )}
                                </div>
                                
                                {/* OTP Change Summary for OTP_CHANGE requests */}
                                {request.requestType === 'OTP_CHANGE' && (
                                    <div className="mt-4 pt-4 border-t border-gray-300">
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-orange-800 mb-2 flex items-center">
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                </svg>
                                                OTP Mobile Change Summary
                                            </h4>
                                            <div className="text-sm text-orange-700">
                                                <p className="flex items-center justify-between">
                                                    <span className="font-medium">From:</span>
                                                    <span className="font-mono text-red-600">
                                                        {request.bdoDetails?.currentOtpMobileNumber || request.bdoDetails?.otpMobileNumber || request.otpMobileNumber || 'N/A'}
                                                    </span>
                                                </p>
                                                <div className="flex justify-center my-2">
                                                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                    </svg>
                                                </div>
                                                <p className="flex items-center justify-between">
                                                    <span className="font-medium">To:</span>
                                                    <span className="font-mono text-green-600">
                                                        {request.bdoDetails?.newOtpMobileNumber || 'N/A'}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Standard Location Information for non-transfer requests */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <MapPin className="w-5 h-5 mr-2" />
                                Complete Location Details
                            </h3>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-600">Shop Name</p>
                                        <p className="font-medium">{request.deviceDetails?.shopName || request.shopName || 'Not specified'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">City</p>
                                        <p className="font-medium">{request.deviceDetails?.city || request.city}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Street Address</p>
                                        <p className="font-medium">{request.deviceDetails?.streetAddress || request.streetAddress}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Premise Relationship</p>
                                        <p className="font-medium">{request.deviceDetails?.premiseRelationship || request.premiseRelationship || 'Not Available'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Franchise</p>
                                        <p className="font-medium">{request.franchiseName || 'Unknown Franchise'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">GPS Coordinates</p>
                                        <p className="font-medium">
                                            {(() => {
                                                // Check multiple possible coordinate locations with proper lat/lng structure
                                                const coords = request.deviceDetails?.coordinates || 
                                                             request.deviceDetails?.shopLocation || 
                                                             request.shopLocation || 
                                                             request.locationInfo?.coordinates ||
                                                             (request.latitude && request.longitude ? {
                                                                 latitude: parseFloat(request.latitude),
                                                                 longitude: parseFloat(request.longitude)
                                                             } : null);
                                                
                                                if (coords) {
                                                    // Handle both lat/lng and latitude/longitude formats
                                                    const lat = coords.lat || coords.latitude;
                                                    const lng = coords.lng || coords.longitude;
                                                    
                                                    if (lat && lng) {
                                                        return (
                                                            <span className="flex items-center">
                                                                <MapPin className="w-4 h-4 mr-1 text-green-500" />
                                                                Lat: {parseFloat(lat)?.toFixed(6)}, 
                                                                Lng: {parseFloat(lng)?.toFixed(6)}
                                                            </span>
                                                        );
                                                    }
                                                }
                                                return <span className="text-red-500">Not Available</span>;
                                            })()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                
                {/* Revision History Section */}
                {request.isResubmission && request.revisionHistory && request.revisionHistory.length > 0 && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Revision History
                        </h3>
                        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                            <div className="space-y-3">
                                {/* Current Status */}
                                <div className="bg-white p-3 rounded border-l-4 border-blue-500">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900">Current Submission</p>
                                            <p className="text-sm text-gray-600">
                                                Revision #{request.revisionCount} • Resubmitted on{' '}
                                                {getFormattedDate(request.resubmittedAt, 'localeDateString')}
                                            </p>
                                        </div>
                                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                                            Current
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Previous Revisions */}
                                {request.revisionHistory.slice().reverse().map((revision, index) => (
                                    <div key={index} className="bg-white p-3 rounded border-l-4 border-orange-500">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900">
                                                    Revision #{revision.revisionNumber || index + 1}
                                                </p>
                                                <p className="text-sm text-gray-600 mb-2">
                                                    Rejected on {getFormattedDate(revision.rejectedAt, 'localeDateString')}
                                                    {revision.resubmittedAt && (
                                                        <span> • Resubmitted on {getFormattedDate(revision.resubmittedAt, 'localeDateString')}</span>
                                                    )}
                                                </p>
                                                {revision.rejectionReason && (
                                                    <div className="bg-red-50 p-2 rounded text-sm">
                                                        <p className="font-medium text-red-800">Sales Team Feedback:</p>
                                                        <p className="text-red-700 mt-1">{revision.rejectionReason}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full ml-2">
                                                Rejected
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Original Submission */}
                                <div className="bg-white p-3 rounded border-l-4 border-gray-500">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900">Original Submission</p>
                                            <p className="text-sm text-gray-600">
                                                Submitted on {getFormattedDate(request.createdAt, 'localeDateString')}
                                            </p>
                                        </div>
                                        <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">
                                            Original
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Documents & Images */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                        <FileText className="w-5 h-5 mr-2" />
                        Documents & Images
                    </h3>
                    {(() => {
                        if (request.requestType === 'TRANSFER_OWNERSHIP') {
                            // Transfer-specific image organization
                            return (
                                <div className="space-y-6">
                                    {/* Current BDO Documents */}
                                    {(request.originalBdoDocuments?.cnicFront || request.originalBdoDocuments?.cnicBack) && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-red-800 mb-3">Current BDO Documents</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {request.originalBdoDocuments?.cnicFront && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">CNIC Front</span>
                                                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Current</span>
                                                        </div>
                                                        <img 
                                                            src={request.originalBdoDocuments.cnicFront} 
                                                            alt="Current BDO CNIC Front" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.originalBdoDocuments.cnicFront, '_blank')}
                                                        />
                                                        <a
                                                            href={request.originalBdoDocuments.cnicFront}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                                {request.originalBdoDocuments?.cnicBack && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">CNIC Back</span>
                                                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Current</span>
                                                        </div>
                                                        <img 
                                                            src={request.originalBdoDocuments.cnicBack} 
                                                            alt="Current BDO CNIC Back" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.originalBdoDocuments.cnicBack, '_blank')}
                                                        />
                                                        <a
                                                            href={request.originalBdoDocuments.cnicBack}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* New BDO Documents */}
                                    {(request.bdoDocuments?.cnicFront || request.bdoDocuments?.cnicBack) && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-green-800 mb-3">New BDO Documents</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {request.bdoDocuments?.cnicFront && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">CNIC Front</span>
                                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">New</span>
                                                        </div>
                                                        <img 
                                                            src={request.bdoDocuments.cnicFront} 
                                                            alt="New BDO CNIC Front" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.bdoDocuments.cnicFront, '_blank')}
                                                        />
                                                        <a
                                                            href={request.bdoDocuments.cnicFront}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                                {request.bdoDocuments?.cnicBack && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">CNIC Back</span>
                                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">New</span>
                                                        </div>
                                                        <img 
                                                            src={request.bdoDocuments.cnicBack} 
                                                            alt="New BDO CNIC Back" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.bdoDocuments.cnicBack, '_blank')}
                                                        />
                                                        <a
                                                            href={request.bdoDocuments.cnicBack}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Current Shop Images */}
                                    {(request.currentShopImages?.inside || request.currentShopImages?.outside) && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-red-800 mb-3">Current Shop Images</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {request.currentShopImages?.inside && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">Shop Inside</span>
                                                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Current</span>
                                                        </div>
                                                        <img 
                                                            src={request.currentShopImages.inside} 
                                                            alt="Current Shop Inside" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.currentShopImages.inside, '_blank')}
                                                        />
                                                        <a
                                                            href={request.currentShopImages.inside}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                                {request.currentShopImages?.outside && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">Shop Outside</span>
                                                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Current</span>
                                                        </div>
                                                        <img 
                                                            src={request.currentShopImages.outside} 
                                                            alt="Current Shop Outside" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.currentShopImages.outside, '_blank')}
                                                        />
                                                        <a
                                                            href={request.currentShopImages.outside}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* New Shop Images */}
                                    {(request.newShopImages?.inside || request.newShopImages?.outside || 
                                      request.deviceDetails?.shopInsideImage || request.deviceDetails?.shopOutsideImage) && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-green-800 mb-3">New Shop Images</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {(request.newShopImages?.inside || request.deviceDetails?.shopInsideImage) && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">Shop Inside</span>
                                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">New</span>
                                                        </div>
                                                        <img 
                                                            src={request.newShopImages?.inside || request.deviceDetails?.shopInsideImage} 
                                                            alt="New Shop Inside" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.newShopImages?.inside || request.deviceDetails?.shopInsideImage, '_blank')}
                                                        />
                                                        <a
                                                            href={request.newShopImages?.inside || request.deviceDetails?.shopInsideImage}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                                {(request.newShopImages?.outside || request.deviceDetails?.shopOutsideImage) && (
                                                    <div className="bg-white rounded-lg p-3 border">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium">Shop Outside</span>
                                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">New</span>
                                                        </div>
                                                        <img 
                                                            src={request.newShopImages?.outside || request.deviceDetails?.shopOutsideImage} 
                                                            alt="New Shop Outside" 
                                                            className="w-full h-32 object-cover rounded cursor-pointer hover:shadow-lg transition-shadow"
                                                            onClick={() => window.open(request.newShopImages?.outside || request.deviceDetails?.shopOutsideImage, '_blank')}
                                                        />
                                                        <a
                                                            href={request.newShopImages?.outside || request.deviceDetails?.shopOutsideImage}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* No images fallback */}
                                    {!(request.originalBdoDocuments?.cnicFront || request.originalBdoDocuments?.cnicBack ||
                                       request.bdoDocuments?.cnicFront || request.bdoDocuments?.cnicBack ||
                                       request.currentShopImages?.inside || request.currentShopImages?.outside ||
                                       request.newShopImages?.inside || request.newShopImages?.outside ||
                                       request.deviceDetails?.shopInsideImage || request.deviceDetails?.shopOutsideImage) && (
                                        <div className="bg-gray-50 rounded-lg p-6 text-center">
                                            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-gray-500">No documents or images uploaded for this transfer request</p>
                                        </div>
                                    )}
                                </div>
                            );
                        } else if (request.requestType === 'DE_MAPPING') {
                            // DE_MAPPING specific document display
                            const imageCollection = [];
                            
                            // BDO CNIC Images (from current mapping)
                            if (request.cnicFrontUrl) {
                                imageCollection.push({
                                    key: 'cnicFront',
                                    url: request.cnicFrontUrl,
                                    label: 'BDO CNIC Front',
                                    type: 'CNIC',
                                    category: 'cnic'
                                });
                            }
                            
                            if (request.cnicBackUrl) {
                                imageCollection.push({
                                    key: 'cnicBack',
                                    url: request.cnicBackUrl,
                                    label: 'BDO CNIC Back',
                                    type: 'CNIC',
                                    category: 'cnic'
                                });
                            }
                            
                            // Shop Images (from current mapping)
                            if (request.shopInsideImageUrl) {
                                imageCollection.push({
                                    key: 'shopInside',
                                    url: request.shopInsideImageUrl,
                                    label: 'Shop Inside Image',
                                    type: 'Shop',
                                    category: 'shop'
                                });
                            }
                            
                            if (request.shopOutsideImageUrl) {
                                imageCollection.push({
                                    key: 'shopOutside',
                                    url: request.shopOutsideImageUrl,
                                    label: 'Shop Outside Image',
                                    type: 'Shop',
                                    category: 'shop'
                                });
                            }

                            return imageCollection.length > 0 ? (
                                <div className="space-y-6">
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                        <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Current Mapping Documents
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {imageCollection.map((item) => (
                                                <div key={item.key} className="bg-white rounded-lg p-3 border">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-sm font-medium">{item.label}</span>
                                                        <span className={`text-xs px-2 py-1 rounded ${
                                                            item.type === 'CNIC' ? 'bg-blue-100 text-blue-700' :
                                                            item.type === 'Shop' ? 'bg-green-100 text-green-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {item.type}
                                                        </span>
                                                    </div>
                                                    <img 
                                                        src={item.url} 
                                                        alt={item.label}
                                                        className="w-full h-32 object-cover rounded border cursor-pointer hover:shadow-lg transition-shadow"
                                                        onClick={() => window.open(item.url, '_blank')}
                                                    />
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-center mt-2"
                                                    >
                                                        <Eye className="w-3 h-3 mr-1" />
                                                        View Full Size
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 rounded-lg p-6 text-center">
                                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-gray-500">No documents available for this de-mapping request</p>
                                </div>
                            );
                        } else {
                            // Standard image handling for non-transfer requests
                            const imageCollection = [];
                            
                            // CNIC Images from bdoDetails
                            if (request.bdoDetails?.cnicFrontImageUrl) {
                                imageCollection.push({
                                    key: 'cnicFrontImage',
                                    url: request.bdoDetails.cnicFrontImageUrl,
                                    label: 'CNIC Front',
                                    type: 'CNIC',
                                    category: 'cnic'
                                });
                            }
                            
                            if (request.bdoDetails?.cnicBackImageUrl) {
                                imageCollection.push({
                                    key: 'cnicBackImage',
                                    url: request.bdoDetails.cnicBackImageUrl,
                                    label: 'CNIC Back',
                                    type: 'CNIC',
                                    category: 'cnic'
                                });
                            }
                            
                            // Shop Images from deviceDetails
                            if (request.deviceDetails?.shopInsideImage) {
                                imageCollection.push({
                                    key: 'shopInsideImage',
                                    url: request.deviceDetails.shopInsideImage,
                                    label: 'Shop Inside',
                                    type: 'Shop',
                                    category: 'shop'
                                });
                            }
                            
                            if (request.deviceDetails?.shopOutsideImage) {
                                imageCollection.push({
                                    key: 'shopOutsideImage',
                                    url: request.deviceDetails.shopOutsideImage,
                                    label: 'Shop Outside',
                                    type: 'Shop',
                                    category: 'shop'
                                });
                            }
                            
                            // Legacy documents support (fallback for older requests)
                            const legacyDocs = request.documents || request.deviceDetails?.documents || {};
                            Object.entries(legacyDocs).forEach(([key, url]) => {
                                const keyLower = key.toLowerCase();
                                const isCNIC = keyLower.includes('cnic') || keyLower.includes('front') || keyLower.includes('back');
                                const isShop = keyLower.includes('shop') || keyLower.includes('inside') || keyLower.includes('outside');
                                
                                imageCollection.push({
                                    key: key,
                                    url: url,
                                    label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                                    type: isCNIC ? 'CNIC' : isShop ? 'Shop' : 'Document',
                                    category: isCNIC ? 'cnic' : isShop ? 'shop' : 'other'
                                });
                            });
                            
                            return imageCollection.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {imageCollection.map((item) => {
                                        const isImage = item.url && (
                                            item.url.toLowerCase().includes('.jpg') ||
                                            item.url.toLowerCase().includes('.jpeg') ||
                                            item.url.toLowerCase().includes('.png') ||
                                            item.url.toLowerCase().includes('.gif') ||
                                            item.url.toLowerCase().includes('.webp') ||
                                            item.category === 'cnic' ||
                                            item.category === 'shop'
                                        );
                                        
                                        return (
                                            <div key={item.key} className="bg-white border rounded-lg p-3 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-medium text-sm">{item.label}</h4>
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        item.type === 'CNIC' ? 'bg-blue-100 text-blue-700' :
                                                        item.type === 'Shop' ? 'bg-green-100 text-green-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {item.type}
                                                    </span>
                                                </div>
                                                
                                                {isImage ? (
                                                    <div className="space-y-2">
                                                        <img 
                                                            src={item.url} 
                                                            alt={item.label}
                                                            className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => window.open(item.url, '_blank')}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                                e.target.nextSibling.innerHTML = '<p class="text-red-500 text-xs">Failed to load image</p>';
                                                            }}
                                                        />
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 text-sm flex items-center justify-center"
                                                        >
                                                            <Eye className="w-4 h-4 mr-1" />
                                                            View Full Size
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                                                    >
                                                        <FileText className="w-4 h-4 mr-1" />
                                                        View Document
                                                    </a>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-gray-50 rounded-lg p-6 text-center">
                                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-gray-500">No documents or images uploaded for this request</p>
                                </div>
                            );
                        }
                    })()}
                </div>
                {/* Actions */}
                <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Actions</h3>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => openModal('approve')}
                            disabled={isProcessing}
                            className="bg-green-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </button>
                        <button
                            onClick={() => openModal('revision')}
                            disabled={isProcessing}
                            className="bg-orange-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center"
                        >
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Request Revision
                        </button>
                        <button
                            onClick={() => openModal('reject')}
                            disabled={isProcessing}
                            className="bg-red-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </button>
                        <button
                            onClick={() => onDownloadZip(request)}
                            className="bg-blue-500 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-600 flex items-center"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download Files
                        </button>
                    </div>
                </div>
            </div>
            {/* Action Modal */}
            <ActionModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                onConfirm={confirmAction}
                title={
                    modalState.type === 'revision' ? 'Revision Reason' :
                    modalState.type === 'reject' ? 'Rejection Reason' : 
                    modalState.type === 'approve' ? 'Confirm Approval' : 'Confirm Action'
                }
                placeholder={
                    modalState.type === 'revision' ? 'Please provide reason for revision...' :
                    modalState.type === 'reject' ? 'Please provide reason for rejection...' :
                    'Add notes...'
                }
                required={modalState.type === 'revision' || modalState.type === 'reject'}
            />
        </div>
    );
};
// Request Detail Component for Franchise
function RequestDetail({ request, user, onBack, onEdit }) {
    const [expandedSections, setExpandedSections] = useState({
        details: true,
        documents: true,
        bdoInfo: true,
        revision: true
    });
    
    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };
    const CollapsibleSection = ({ title, isExpanded, onToggle, children, icon: Icon }) => (
        <div className="border-t pt-4">
            <button onClick={onToggle} className="flex items-center justify-between w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                <div className="flex items-center">
                    {Icon && <Icon className="w-5 h-5 mr-2" />}
                    <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isExpanded && <div className="mt-4">{children}</div>}
        </div>
    );
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to List
                </button>
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-white flex items-center">
                                    <Smartphone className="w-6 h-6 mr-2" />
                                    Request Details
                                </h2>
                                <p className="text-blue-100 mt-1">
                                    <Calendar className="w-4 h-4 inline mr-1" />
                                    Created {getTimeAgo(request.createdAt)}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <EnhancedStatusPill status={request.status} size="lg" />
                            </div>
                        </div>
                    </div>
                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* BDO Information */}
                        <CollapsibleSection
                            title="BDO/Retailer Information"
                            isExpanded={expandedSections.bdoInfo}
                            onToggle={() => toggleSection('bdoInfo')}
                            icon={User}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <strong>Name:</strong> {request.bdoName}
                                </div>
                                <div>
                                    <strong>ID:</strong> {request.bdoId}
                                </div>
                                <div>
                                    <strong>CNIC:</strong> {request.cnicNumber}
                                </div>
                                <div>
                                    <strong>Mobile:</strong> {request.otpMobileNumber}
                                </div>
                            </div>
                        </CollapsibleSection>
                        {/* Request Details */}
                        <CollapsibleSection
                            title="Location Details"
                            isExpanded={expandedSections.details}
                            onToggle={() => toggleSection('details')}
                            icon={MapPin}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <strong>IMEI:</strong> {request.imei}
                                </div>
                                <div>
                                    <strong>Shop Name:</strong> {request.shopName || 'Not specified'}
                                </div>
                                <div>
                                    <strong>City:</strong> {request.city}
                                </div>
                                <div>
                                    <strong>Address:</strong> {request.streetAddress}
                                </div>
                                <div>
                                    <strong>Relationship:</strong> {request.premiseRelationship}
                                </div>
                                <div>
                                    <strong>Coordinates:</strong> {request.latitude}, {request.longitude}
                                </div>
                            </div>
                        </CollapsibleSection>
                        {/* Documents */}
                        {request.documents && (
                            <CollapsibleSection
                                title="Documents"
                                isExpanded={expandedSections.documents}
                                onToggle={() => toggleSection('documents')}
                                icon={FileText}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.entries(request.documents).map(([key, url]) => (
                                        <div key={key} className="bg-gray-50 p-3 rounded-lg">
                                            <h4 className="font-medium text-sm mb-2">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</h4>
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm flex items-center">
                                                <Eye className="w-4 h-4 mr-1" />
                                                View Document
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleSection>
                        )}
                        {/* Rejection Reason */}
                        {request.rejectionReason && (
                            <CollapsibleSection
                                title="Revision Required"
                                isExpanded={expandedSections.revision}
                                onToggle={() => toggleSection('revision')}
                                icon={AlertCircle}
                            >
                                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                                    <p className="text-red-800">{request.rejectionReason}</p>
                                </div>
                            </CollapsibleSection>
                        )}
                        {/* Actions for Franchise */}
                        {user.role === USER_ROLES.FRANCHISE && request.status === REQUEST_STATUSES.NEEDS_REVISION && (
                            <div className="border-t pt-4">
                                <h3 className="text-lg font-semibold mb-4 text-gray-800">Actions</h3>
                                <button 
                                    onClick={() => onEdit(request)}
                                    className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 flex items-center"
                                >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit & Resubmit
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
// ==================================================================================
// --- ADMIN DASHBOARD ---
// ==================================================================================
function AdminDashboard({ user, appServices }) {
    const [activeView, setActiveView] = useState(ADMIN_VIEWS.QUEUE);
    const [requests, setRequests] = useState([]);
    const [bdoAccounts, setBdoAccounts] = useState([]);
    const [mappedDevices, setMappedDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMigrationPanel, setShowMigrationPanel] = useState(false);
    const [showDeviceMigrationPanel, setShowDeviceMigrationPanel] = useState(false);
    const loadAdminDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const [requestsSnap, bdoSnap, mappedSnap] = await Promise.all([
                getDocs(query(collection(db, 'requestsV2'), orderBy('createdAt', 'desc'), limit(100))),
                getDocs(query(collection(db, 'bdoAccounts'), orderBy('createdAt', 'desc'), limit(100))),
                getDocs(query(
                    collection(db, 'requestsV2'),
                    where('status', 'in', [REQUEST_STATUSES.COMPLETED, 'COMPLETED']),
                    orderBy('updatedAt', 'desc'),
                    limit(100)
                ))
            ]);

            setRequests(requestsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setBdoAccounts(bdoSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setMappedDevices(mappedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error('Error loading admin dashboard data:', error);
            toast.error('Error loading admin data. Check Firestore indexes if this was just deployed.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAdminDashboardData();
    }, [loadAdminDashboardData]);
    const handleExportCSV = (data, filename) => {
        exportToCsv(data, filename);
        toast.success('Data exported successfully');
    };
    const handleBulkDownload = async (data, filename) => {
        if (!window.confirm(`Download documents for ${data.length} records?`)) {
            return;
        }
        toast.info('Preparing bulk download...');
        const zip = new JSZip();
        try {
            for (const item of data.slice(0, 50)) {
                const itemZip = await createZipFile(item, true);
                const content = await itemZip.generateAsync({ type: 'blob' });
                zip.file(`${item.bdoId || item.id}_documents.zip`, content);
            }
            const finalZip = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(finalZip);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('Bulk download completed');
        } catch (error) {
            toast.error('Failed to complete bulk download');
        }
    };
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-3 text-gray-600">Loading admin dashboard...</span>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Admin Dashboard</h2>
                        <p className="text-sm md:text-base text-gray-600 mt-1">Limited system overview and management. Full exports should be run only when needed.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={loadAdminDashboardData}
                            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={() => setShowMigrationPanel(true)}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            🔄 Migration Panel
                        </button>
                        <button
                            onClick={() => setShowDeviceMigrationPanel(true)}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            📱 Device Migration
                        </button>
                    </div>
                </div>
            </div>
            {/* Navigation */}
            <div className="bg-white rounded-lg shadow-md">
                <div className="border-b border-gray-200 px-6">
                    <nav className="flex space-x-8 overflow-x-auto" aria-label="Admin Navigation">
                        <button
                            onClick={() => setActiveView(ADMIN_VIEWS.QUEUE)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeView === ADMIN_VIEWS.QUEUE
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            All Mapping Requests
                            <span className="ml-2 bg-blue-100 text-blue-600 py-1 px-2 rounded-full text-xs">
                                {requests.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveView(ADMIN_VIEWS.BDO_QUEUE)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeView === ADMIN_VIEWS.BDO_QUEUE
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            All BDO Requests
                            <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                                {bdoAccounts.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveView(ADMIN_VIEWS.MAPPED_DEVICES)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeView === ADMIN_VIEWS.MAPPED_DEVICES
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Successfully Mapped
                            <span className="ml-2 bg-green-100 text-green-600 py-1 px-2 rounded-full text-xs">
                                {mappedDevices.length}
                            </span>
                        </button>
                    </nav>
                </div>
            </div>
            {/* Content */}
            {activeView === ADMIN_VIEWS.QUEUE && (
                <AdminAllRequestsView 
                    requests={requests}
                    onExportCSV={handleExportCSV}
                    onBulkDownload={handleBulkDownload}
                />
            )}
            {activeView === ADMIN_VIEWS.BDO_QUEUE && (
                <AdminBDOView 
                    bdoAccounts={bdoAccounts}
                    onExportCSV={handleExportCSV}
                    onBulkDownload={handleBulkDownload}
                />
            )}
            {activeView === ADMIN_VIEWS.MAPPED_DEVICES && (
                <AdminMappedDevicesView 
                    mappedDevices={mappedDevices}
                    onExportCSV={handleExportCSV}
                    onBulkDownload={handleBulkDownload}
                />
            )}
            {/* Migration Panel */}
            {showMigrationPanel && (
                <MigrationAdminPanel
                    user={user}
                    app={app}
                    onClose={() => setShowMigrationPanel(false)}
                />
            )}
            {/* Device Migration Panel */}
            {showDeviceMigrationPanel && (
                <DeviceMigrationPanel
                    user={user}
                    db={db}
                    onClose={() => setShowDeviceMigrationPanel(false)}
                />
            )}
        </div>
    );
}
// Admin All Requests View
const AdminAllRequestsView = ({ requests, onExportCSV, onBulkDownload }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const filteredRequests = useMemo(() => {
        let filtered = requests;
        
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(req =>
                req.imei?.toLowerCase().includes(search) ||
                req.bdoId?.toLowerCase().includes(search) ||
                req.bdoName?.toLowerCase().includes(search) ||
                req.franchiseName?.toLowerCase().includes(search) ||
                req.city?.toLowerCase().includes(search)
            );
        }
        
        if (filterStatus) {
            filtered = filtered.filter(req => req.status === filterStatus);
        }
        
        return filtered;
    }, [requests, searchTerm, filterStatus]);
    const statusCounts = useMemo(() => {
        return requests.reduce((acc, req) => {
            acc[req.status] = (acc[req.status] || 0) + 1;
            return acc;
        }, {});
    }, [requests]);
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">All Mapping Requests</h2>
                        <p className="text-gray-600 mt-1">Complete list of all mapping requests</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onExportCSV(filteredRequests, 'all_mapping_requests.csv')}
                            className="bg-gray-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Export CSV
                        </button>
                        <button
                            onClick={() => onBulkDownload(filteredRequests, `mapping_requests_${new Date().toISOString().split('T')[0]}.zip`)}
                            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Download All
                        </button>
                    </div>
                </div>
            </div>
            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by IMEI, BDO ID, name, shop name, franchise, or city..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {Object.keys(statusCounts).map(status => (
                            <option key={status} value={status}>
                                {status} ({statusCounts[status]})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {/* Results Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">
                    Showing <strong>{filteredRequests.length}</strong> of <strong>{requests.length}</strong> mapping requests
                </p>
            </div>
            {/* Requests Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    IMEI
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Shop Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    BDO/Retailer
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Franchise
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Location
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRequests.map(request => (
                                <tr key={request.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm font-medium text-gray-900">{request.imei}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{request.shopName || 'Not specified'}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{request.bdoName}</div>
                                            <div className="text-sm text-gray-500">{request.bdoId}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{request.franchiseName}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div className="text-sm text-gray-900">{request.city}</div>
                                            <div className="text-sm text-gray-500">{request.streetAddress}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <EnhancedStatusPill status={request.status} size="sm" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-500">
                                            {formatTimestampDate(request.createdAt)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={async () => {
                                                const zip = await createZipFile(request, true);
                                                const content = await zip.generateAsync({ type: 'blob' });
                                                const url = URL.createObjectURL(content);
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.download = `${request.imei}_documents.zip`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 text-sm"
                                        >
                                            <Download className="w-4 h-4 inline" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredRequests.length === 0 && (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">No mapping requests found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// Admin BDO View
const AdminBDOView = ({ bdoAccounts, onExportCSV, onBulkDownload }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const filteredBDOs = useMemo(() => {
        let filtered = bdoAccounts;
        
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(bdo =>
                bdo.name?.toLowerCase().includes(search) ||
                bdo.bdoId?.toLowerCase().includes(search) ||
                bdo.cnicNumber?.includes(search) ||
                bdo.franchiseName?.toLowerCase().includes(search)
            );
        }
        
        if (filterStatus) {
            filtered = filtered.filter(bdo => bdo.status === filterStatus);
        }
        
        return filtered;
    }, [bdoAccounts, searchTerm, filterStatus]);
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">All BDO/Retailer Accounts</h2>
                        <p className="text-gray-600 mt-1">Complete list of all registered BDO and Retailer accounts</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onExportCSV(filteredBDOs, 'all_bdo_accounts.csv')}
                            className="bg-gray-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Export CSV
                        </button>
                        <button
                            onClick={() => onBulkDownload(filteredBDOs, `bdo_accounts_${new Date().toISOString().split('T')[0]}.zip`)}
                            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Download All
                        </button>
                    </div>
                </div>
            </div>
            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, ID, CNIC, or franchise..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {Object.values(BDO_STATUSES).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
            </div>
            {/* Results Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">
                    Showing <strong>{filteredBDOs.length}</strong> of <strong>{bdoAccounts.length}</strong> BDO/Retailer accounts
                </p>
            </div>
            {/* BDO List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    BDO/Retailer
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    CNIC
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Mobile
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Franchise
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredBDOs.map(bdo => (
                                <tr key={bdo.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{bdo.name}</div>
                                            <div className="text-sm text-gray-500">{bdo.bdoId}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{bdo.handlerType}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{bdo.cnicNumber}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{bdo.otpMobileNumber}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{bdo.franchiseName}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <BDOStatusPill status={bdo.status} size="sm" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-500">
                                            {formatTimestampDate(bdo.createdAt)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={async () => {
                                                const zip = await createZipFile(bdo, true);
                                                const content = await zip.generateAsync({ type: 'blob' });
                                                const url = URL.createObjectURL(content);
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.download = `${bdo.bdoId}_documents.zip`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 text-sm"
                                        >
                                            <Download className="w-4 h-4 inline" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredBDOs.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">No BDO/Retailer accounts found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// Admin Mapped Devices View
const AdminMappedDevicesView = ({ mappedDevices, onExportCSV, onBulkDownload }) => {
    const [searchTerm, setSearchTerm] = useState('');
    
    const filteredDevices = useMemo(() => {
        if (!searchTerm) return mappedDevices;
        
        const search = searchTerm.toLowerCase();
        return mappedDevices.filter(device =>
            device.imei?.toLowerCase().includes(search) ||
            device.bdoId?.toLowerCase().includes(search) ||
            device.bdoName?.toLowerCase().includes(search) ||
            device.franchiseName?.toLowerCase().includes(search) ||
            device.city?.toLowerCase().includes(search)
        );
    }, [mappedDevices, searchTerm]);
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Successfully Mapped Devices</h2>
                        <p className="text-gray-600 mt-1">Complete list of all successfully mapped BVS devices</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onExportCSV(filteredDevices, 'mapped_devices.csv')}
                            className="bg-gray-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Export CSV
                        </button>
                        <button
                            onClick={() => onBulkDownload(filteredDevices, `mapped_devices_${new Date().toISOString().split('T')[0]}.zip`)}
                            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700"
                        >
                            <Download className="w-4 h-4 inline mr-2" />
                            Download All
                        </button>
                    </div>
                </div>
            </div>
            {/* Search */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by IMEI, BDO ID, name, franchise, or city..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
            {/* Results Summary */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800">
                    Showing <strong>{filteredDevices.length}</strong> of <strong>{mappedDevices.length}</strong> successfully mapped devices
                </p>
            </div>
            {/* Mapped Devices Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    IMEI
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    BDO/Retailer
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Location
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Franchise
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Completed Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredDevices.map(device => (
                                <tr key={device.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm font-medium text-gray-900">{device.imei}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{device.bdoName}</div>
                                            <div className="text-sm text-gray-500">{device.bdoId}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div className="text-sm text-gray-900">{device.city}</div>
                                            <div className="text-sm text-gray-500">{device.streetAddress}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900">{device.franchiseName}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-500">
                                            {formatTimestampDate(device.updatedAt)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={async () => {
                                                const zip = await createZipFile(device, true);
                                                const content = await zip.generateAsync({ type: 'blob' });
                                                const url = URL.createObjectURL(content);
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.download = `${device.imei}_documents.zip`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 text-sm"
                                        >
                                            <Download className="w-4 h-4 inline" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredDevices.length === 0 && (
                        <div className="text-center py-12">
                            <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">No mapped devices found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// ==================================================================================
// --- MAIN APP COMPONENT ---
// ==================================================================================
export default function App() {
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [servicesReady, setServicesReady] = useState(false);
    const [error, setError] = useState(null);
    // Initialize enhanced app services - with null checks
    console.log('[App] Initializing appServices with:', { db, userData });
    const appServices = useAppServices(db, userData);
    console.log('[App] appServices loaded:', appServices);
    // Track when services are ready
    useEffect(() => {
        console.log('[App] Checking servicesReady - userData:', userData, 'actionLogger:', appServices.actionLogger);
        if (userData && appServices.actionLogger) {
            setServicesReady(true);
        } else {
            setServicesReady(false);
        }
    }, [userData, appServices.actionLogger]);
    
    // Debug render conditions
    useEffect(() => {
        console.log('[App] Render state - loading:', loading, 'userData:', userData, 'servicesReady:', servicesReady, 'error:', error);
    }, [loading, userData, servicesReady, error]);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    console.log('🔐 User authenticated:', firebaseUser.email);
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        console.log('👤 User data loaded from Firestore:', userData);
                        
                        // Ensure franchiseCode is always valid
                        const franchiseCode = userData.franchiseCode || 
                            (firebaseUser.email.includes('testing') ? 'TEST001' : 'SALES001');
                        
                        const finalUserData = { 
                            ...userData, 
                            uid: firebaseUser.uid, 
                            email: firebaseUser.email,
                            franchiseCode: String(franchiseCode).trim() // Ensure it's always a valid string
                        };
                        
                        console.log('✅ Final user data with validated franchiseCode:', finalUserData);
                        setUserData(finalUserData);
                    } else {
                        console.log('📝 User document does not exist, creating default user data');
                        // User document doesn't exist, create a default one based on email
                        const defaultUserData = {
                            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                            email: firebaseUser.email,
                            role: firebaseUser.email.includes('testing') ? USER_ROLES.FRANCHISE : USER_ROLES.SALES_TEAM,
                            franchiseCode: firebaseUser.email.includes('testing') ? 'TEST001' : 'SALES001',
                            createdAt: Timestamp.now(),
                            isActive: true
                        };
                        
                        console.log('🏭 Setting default user data:', defaultUserData);
                        setUserData({ 
                            ...defaultUserData, 
                            uid: firebaseUser.uid
                        });
                    }
                } catch (error) {
                    console.error('❌ Error loading user profile:', error);
                    setError('Error loading user profile: ' + error.message);
                    toast.error('Error loading user profile');
                    
                    // Create fallback user data
                    const fallbackUserData = { 
                        name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                        email: firebaseUser.email,
                        role: firebaseUser.email.includes('testing') ? USER_ROLES.FRANCHISE : USER_ROLES.SALES_TEAM,
                        franchiseCode: firebaseUser.email.includes('testing') ? 'TEST001' : 'SALES001',
                        uid: firebaseUser.uid
                    };
                    console.log('🔄 Setting fallback user data:', fallbackUserData);
                    setUserData(fallbackUserData);
                }
            } else {
                console.log('👋 User logged out');
                // Log user logout if we had a user
                if (userData && appServices.actionLogger) {
                    try {
                        await appServices.actionLogger.logUserLogout();
                    } catch (logoutError) {
                        console.error('Error logging logout:', logoutError);
                    }
                }
                setUserData(null);
                setServicesReady(false);
                setError(null);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, []); // Remove dependency on appServices.actionLogger to avoid infinite loops
    const handleLogout = async () => {
        try {
            // Log logout before signing out
            if (appServices.actionLogger) {
                await appServices.actionLogger.logUserLogout();
            }
            await signOut(auth);
            toast.success('Successfully logged out');
        } catch (error) {
            console.error('Error during logout:', error);
            toast.error('Error during logout');
        }
    };
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg font-semibold text-gray-700">Loading ONIC Portal...</p>
                    <p className="text-sm text-gray-500 mt-2">Please wait while we prepare your dashboard</p>
                </div>
            </div>
        );
    }
    return (
        <div className="bg-gray-50 min-h-screen">
            <Toaster 
                position="top-center" 
                reverseOrder={false}
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#363636',
                        color: '#fff',
                    },
                    success: {
                        duration: 3000,
                        iconTheme: {
                            primary: '#4ade80',
                            secondary: '#fff',
                        },
                    },
                    error: {
                        duration: 5000,
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#fff',
                        },
                    },
                }}
            />
            {userData ? (
                <React.Fragment>
                    <Header user={userData} onLogout={handleLogout} />
                    <main className="p-4 md:p-8">
                        {userData.role === USER_ROLES.FRANCHISE && (
                            // Always use Enhanced Dashboard with Cloud Functions for better performance
                            <EnhancedFranchiseDashboard 
                                user={userData} 
                                appServices={appServices}
                                app={app}
                                auth={auth}
                            />
                        )}
                        {userData.role === USER_ROLES.SALES_TEAM && (
                            <SalesTeamDashboard 
                                user={userData} 
                                appServices={appServices}
                                db={db}
                                auth={auth}
                            />
                        )}
                        {userData.role === USER_ROLES.OPERATIONS_TEAM && (
                            <OperationsTeamDashboard 
                                user={userData} 
                                appServices={appServices}
                                db={db}
                                auth={auth}
                            />
                        )}
                        {userData.role === USER_ROLES.ADMIN && (
                            <AdminDashboard 
                                user={userData} 
                                appServices={appServices}
                                db={db}
                                auth={auth}
                            />
                        )}
                        {userData.role === 'Unknown' && (
                            <div className="text-center py-12">
                                <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-gray-800 mb-2">Role Configuration Required</h3>
                                <p className="text-gray-600">Your role is not configured. Please contact an administrator.</p>
                            </div>
                        )}
                    </main>
                </React.Fragment>
            ) : <LoginPage />}
        </div>
    );
}
// ==================================================================================
// --- HEADER COMPONENT ---
// ==================================================================================
const Header = ({ user, onLogout }) => (
    <header className="bg-white shadow-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center min-h-16 py-2 gap-3">
                <div className="flex items-center min-w-0">
                    <div className="flex-shrink-0 flex items-center">
                        {/* Onic Logo */}
                        <div className="mr-3">
                            <img 
                                src="https://www.onic.pk/assets/website-revamp/footer/Onic-Logo.webp" 
                                alt="Onic Pakistan" 
                                className="h-7 sm:h-8 w-auto"
                                onError={(e) => {
                                    // Fallback to gradient icon if logo fails to load
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                }}
                            />
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-2" style={{ display: 'none' }}>
                                <Building className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-xl font-bold text-gray-900 truncate">Profiling & Mapping Portal</h1>
                            <p className="text-xs text-gray-500 hidden sm:block">Pakistan's First Digital Telco</p>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                    <div className="hidden md:flex items-center text-sm text-gray-600">
                        <User className="w-4 h-4 mr-2" />
                        <span className="font-medium">{user.name || user.email}</span>
                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                            {user.role}
                        </span>
                    </div>
                    
                    <button 
                        onClick={onLogout} 
                        className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 flex items-center"
                    >
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </div>
    </header>
);
// ==================================================================================
// --- LOGIN PAGE WITH FRANCHISE ID SUPPORT ---
// ==================================================================================
function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            toast.success('Login successful!');
        } catch (err) {
            setError('Failed to login. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Onic Brand Background */}
            <div 
                className="absolute inset-0 bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800"
                style={{
                    background: `linear-gradient(135deg, #9749FF 0%, #4F46E5 50%, #1E40AF 100%)`
                }}
            >
                {/* Animated background elements */}
                <div className="absolute inset-0">
                    {/* Purple circles */}
                    <div 
                        className="absolute top-20 left-20 w-96 h-96 rounded-full opacity-20 animate-pulse"
                        style={{ backgroundColor: '#9749FF' }}
                    ></div>
                    <div 
                        className="absolute bottom-20 right-20 w-80 h-80 rounded-full opacity-20 animate-pulse delay-1000"
                        style={{ backgroundColor: '#00FF9C' }}
                    ></div>
                    <div 
                        className="absolute top-1/2 left-1/4 w-64 h-64 rounded-full opacity-10 animate-pulse delay-2000"
                        style={{ backgroundColor: '#9749FF' }}
                    ></div>
                </div>
                
                {/* Decorative grid pattern */}
                <div className="absolute inset-0 opacity-5">
                    <div className="h-full w-full" style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
                        backgroundSize: '50px 50px'
                    }}></div>
                </div>
            </div>

            {/* Login Container */}
            <div className="relative w-full max-w-md mx-4 z-10">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
                    {/* Header with Onic Logo */}
                    <div className="text-center mb-8">
                        <div className="mb-6">
                            <div 
                                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg relative overflow-hidden"
                                style={{
                                    background: `linear-gradient(135deg, #9749FF 0%, #00FF9C 100%)`
                                }}
                            >
                                <img 
                                    src="https://www.onic.pk/assets/website-revamp/footer/Onic-Logo.webp" 
                                    alt="Onic" 
                                    className="w-12 h-12 object-contain filter brightness-0 invert"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <Building className="w-10 h-10 text-white hidden" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h1>
                        <p className="text-gray-600 text-sm">Sign in to your Onic Portal</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-6">
                        {/* Email Input */}
                        <div className="space-y-2">
                            <label className="text-gray-700 text-sm font-medium block" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                                style={{
                                    '--tw-ring-color': '#9749FF'
                                }}
                                placeholder="Enter your email"
                                required
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="text-gray-700 text-sm font-medium block" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                                    style={{
                                        '--tw-ring-color': '#9749FF'
                                    }}
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    <Eye className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 text-white"
                            style={{
                                background: loading 
                                    ? 'linear-gradient(135deg, #6B46C1 0%, #3B82F6 100%)' 
                                    : 'linear-gradient(135deg, #9749FF 0%, #00FF9C 100%)',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>Signing In...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign In</span>
                                    <ArrowLeft className="h-5 w-5 transform rotate-180" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-gray-500 text-sm">
                            Powered by{' '}
                            <span 
                                className="font-semibold bg-clip-text text-transparent"
                                style={{
                                    background: 'linear-gradient(135deg, #9749FF 0%, #00FF9C 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent'
                                }}
                            >
                                Onic
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
