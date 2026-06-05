// --- Device Transfer (Transfer of Ownership) Component ---
import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { CloudFunctionsService } from '../utils/cloudFunctionsService';
import ActionLogger from '../utils/actionLogger';
import toast from 'react-hot-toast';
import CitySelector from './shared/CitySelector';
import PremiseRelationshipSelector from './shared/PremiseRelationshipSelector';

/**
 * Device Transfer Component - Transfer ownership of a device from one BDO to another
 * Updated to align with PROJECT_CONTEXT.md business rules:
 * - Captures new location details for target BDO
 * - Requires coordinates, city, and location images
 * - Implements atomic transfer process with full audit trail
 * - Follows Transfer of Ownership workflow as defined in business rules
 */
function DeviceTransferForm({ user, app, onSuccess, onCancel, editingRequest = null }) {
    const transferReasons = [
        'BDO relocation',
        'Shop closure',
        'Business transfer',
        'Performance issues',
        'BDO/Retailer Resigned',
        'Other'
    ];

    const [step, setStep] = useState(1); // 1: Select Source BDO, 2: Select Target BDO, 3: New Location Details, 4: Review & Submit
    const [sourceBDO, setSourceBDO] = useState(null);
    const [destinationBDO, setDestinationBDO] = useState(null);
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [bdoList, setBdoList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [transferReason, setTransferReason] = useState('');
    
    // Revision workflow state (consistent with RequestWizard)
    const isEditing = !!editingRequest;
    const isRevision = isEditing && editingRequest?.status === 'Needs Revision';
    
    // New location details state (as per PROJECT_CONTEXT.md requirements)
    const [newLocationDetails, setNewLocationDetails] = useState({
        shopName: '',
        streetAddress: '',
        city: '',
        premiseRelationship: '',
        coordinates: { lat: '', lng: '' },
        shopInsideImage: null,
        shopOutsideImage: null
    });
    const [locationLoading, setLocationLoading] = useState(false);
    
    // Coordinate validation states
    const [coordinateErrors, setCoordinateErrors] = useState({ lat: '', lng: '' });
    
    // Image states
    const [imageFiles, setImageFiles] = useState({
        inside: null,
        outside: null
    });
    const [uploadProgress, setUploadProgress] = useState({
        inside: 0,
        outside: 0
    });
    const [uploading, setUploading] = useState(false);
    
    const [db] = useState(() => getFirestore(app));
    const [storage] = useState(() => getStorage(app));
    
    // Refs for file inputs
    const insideImageRef = useRef(null);
    const outsideImageRef = useRef(null);

    // Load BDOs on component mount
    useEffect(() => {
        loadBDOs();
    }, []);

    // Initialize form data when editing a request
    useEffect(() => {
        if (isEditing && editingRequest) {
            console.log('🔄 Editing mode - initializing transfer form:', editingRequest);
            
            // Set transfer reason
            setTransferReason(editingRequest.transferDetails?.transferReason || '');
            
            // Initialize location details from editing request
            setNewLocationDetails({
                shopName: editingRequest.deviceDetails?.newShopName || editingRequest.shopName || '',
                streetAddress: editingRequest.deviceDetails?.newStreetAddress || editingRequest.streetAddress || '',
                city: editingRequest.deviceDetails?.newCity || editingRequest.city || '',
                premiseRelationship: editingRequest.deviceDetails?.premiseRelationship || editingRequest.premiseRelationship || '',
                coordinates: {
                    lat: editingRequest.deviceDetails?.newCoordinates?.latitude || editingRequest.latitude || '',
                    lng: editingRequest.deviceDetails?.newCoordinates?.longitude || editingRequest.longitude || ''
                },
                shopInsideImage: editingRequest.documents?.shopInsideImage || null,
                shopOutsideImage: editingRequest.documents?.shopOutsideImage || null
            });
            
            // If we have transfer details, try to set source and destination BDOs
            if (editingRequest.transferDetails) {
                // We'll need to find and set the BDOs after they're loaded
                console.log('📝 Transfer details found:', editingRequest.transferDetails);
            }
        }
    }, [isEditing, editingRequest]);

    // Auto-select BDOs when editing and BDO list is loaded
    useEffect(() => {
        if (isEditing && editingRequest && bdoList.length > 0 && !sourceBDO && !destinationBDO) {
            const sourceId = editingRequest.transferDetails?.sourceBdoId;
            const destId = editingRequest.transferDetails?.destinationBdoId || editingRequest.bdoId;
            
            if (sourceId && destId) {
                const sourceBdo = bdoList.find(bdo => bdo.bdoId === sourceId);
                const destBdo = bdoList.find(bdo => bdo.bdoId === destId);
                
                if (sourceBdo && destBdo) {
                    setSourceBDO(sourceBdo);
                    setDestinationBDO(destBdo);
                    
                    // Set device info from source BDO or editing request
                    if (sourceBdo.currentDevice) {
                        setDeviceInfo(sourceBdo.currentDevice);
                    } else {
                        // Reconstruct device info from editing request
                        setDeviceInfo({
                            imei: editingRequest.deviceDetails?.imei || editingRequest.imei,
                            shopName: editingRequest.deviceDetails?.currentShopName || 'Previous Shop',
                            city: editingRequest.deviceDetails?.currentCity || 'Previous City',
                            streetAddress: editingRequest.deviceDetails?.currentStreetAddress || 'Previous Address',
                            deviceId: editingRequest.transferDetails?.originalDeviceId || editingRequest.id // Using deviceId instead of requestId
                        });
                    }
                    
                    // Skip to review step for editing
                    setStep(4);
                    console.log('✅ Auto-populated BDOs for editing:', { sourceId, destId });
                }
            }
        }
    }, [isEditing, editingRequest, bdoList, sourceBDO, destinationBDO]);

    /**
     * Validate coordinate format and range
     */
    const validateCoordinate = (value, type) => {
        if (!value) return '';
        
        const numValue = parseFloat(value);
        
        // Check if it's a valid number
        if (isNaN(numValue)) {
            return 'Must be a valid number';
        }
        
        // Check decimal places (max 8)
        const decimalParts = value.split('.');
        if (decimalParts.length > 1 && decimalParts[1].length > 8) {
            return 'Maximum 8 decimal places allowed';
        }
        
        // Check coordinate ranges for Pakistan
        if (type === 'lat') {
            if (numValue < 23.5 || numValue > 37.5) {
                return 'Latitude should be between 23.5° and 37.5° for Pakistan';
            }
        } else if (type === 'lng') {
            if (numValue < 60.5 || numValue > 77.5) {
                return 'Longitude should be between 60.5° and 77.5° for Pakistan';
            }
        }
        
        return '';
    };

    /**
     * Get current location coordinates with 8 decimal precision
     */
    const getCurrentLocation = () => {
        setLocationLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords = {
                        lat: position.coords.latitude.toFixed(8),
                        lng: position.coords.longitude.toFixed(8)
                    };
                    setNewLocationDetails(prev => ({
                        ...prev,
                        coordinates: coords
                    }));
                    // Validate coordinates
                    const latError = validateCoordinate(coords.lat, 'lat');
                    const lngError = validateCoordinate(coords.lng, 'lng');
                    setCoordinateErrors({ lat: latError, lng: lngError });
                    setLocationLoading(false);
                    toast.success('Location captured successfully');
                },
                (error) => {
                    console.error('Error getting location:', error);
                    toast.error('Unable to get current location. Please ensure location services are enabled.');
                    setLocationLoading(false);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            toast.error('Geolocation is not supported by this browser');
            setLocationLoading(false);
        }
    };

    /**
     * Handle file selection
     */
    const handleFileSelect = (type, file) => {
        if (file && file.type.startsWith('image/')) {
            setImageFiles(prev => ({ ...prev, [type]: file }));
        }
    };

    /**
     * Upload image to Firebase Storage
     */
    const uploadImage = async (file, type) => {
        try {
            const timestamp = Date.now();
            const fileName = `transfer-shop-images/${user.franchiseCode}/${timestamp}_${type}.jpg`;
            const storageRef = ref(storage, fileName);
            
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            
            return downloadURL;
        } catch (error) {
            console.error(`Error uploading ${type} image:`, error);
            throw error;
        }
    };

    /**
     * Handle image uploads for transfer
     */
    const handleImageUploads = async () => {
        if (!imageFiles.inside && !imageFiles.outside) return newLocationDetails;

        setUploading(true);
        try {
            const uploadPromises = [];
            const updatedData = { ...newLocationDetails };

            if (imageFiles.inside) {
                uploadPromises.push(
                    uploadImage(imageFiles.inside, 'inside').then(url => {
                        updatedData.shopInsideImage = url;
                    })
                );
            }

            if (imageFiles.outside) {
                uploadPromises.push(
                    uploadImage(imageFiles.outside, 'outside').then(url => {
                        updatedData.shopOutsideImage = url;
                    })
                );
            }

            await Promise.all(uploadPromises);
            return updatedData;
        } finally {
            setUploading(false);
        }
    };

    /**
     * Load all active BDOs for the franchise
     */
    const loadBDOs = async () => {
        setLoading(true);
        try {
            console.log('🔍 Loading BDOs for franchise:', user.franchiseCode);
            
            const q = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', user.franchiseCode),
                where('status', 'in', ['Approved', 'Active', 'approved', 'active'])
            );
            
            const querySnapshot = await getDocs(q);
            console.log('📋 Found BDOs:', querySnapshot.size);
            
            querySnapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                console.log(`BDO ${index + 1}:`, {
                    id: doc.id,
                    name: data.name,
                    bdoId: data.bdoId,
                    status: data.status,
                    franchiseCode: data.franchiseCode
                });
            });
            
            const bdos = await Promise.all(querySnapshot.docs.map(async (doc) => {
                const bdoData = { id: doc.id, ...doc.data() };
                console.log(`🔎 Checking device mappings for BDO: ${bdoData.bdoId} (${bdoData.name})`);
                
                // Load current device mapping for this BDO from devices collection
                // This is the single source of truth for device mappings
                let currentDevice = null;
                
                try {
                    console.log(`🔍 Querying devices collection for BDO ID: ${bdoData.bdoId}`);
                    
                    // Query the devices collection for mapped devices assigned to this BDO
                    const deviceQuery = query(
                        collection(db, 'devices'),
                        where('bdoId', '==', bdoData.bdoId),
                        where('status', '==', 'Mapped')
                    );
                    
                    const deviceSnapshot = await getDocs(deviceQuery);
                    console.log(`📱 Mapped devices for ${bdoData.bdoId}:`, deviceSnapshot.size);
                    
                    if (!deviceSnapshot.empty) {
                        // Get the most recent mapped device (if multiple exist)
                        const allDevices = deviceSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        
                        // Sort by lastUpdatedAt, get most recent
                        const latestDevice = allDevices.sort((a, b) => {
                            const aTime = a.lastUpdatedAt?.toMillis?.() || 0;
                            const bTime = b.lastUpdatedAt?.toMillis?.() || 0;
                            return bTime - aTime;
                        })[0];
                        
                        console.log(`✅ Found latest device mapping:`, {
                            deviceId: latestDevice.id,
                            imei: latestDevice.imei,
                            shopName: latestDevice.shopName,
                            status: latestDevice.status,
                            bdoId: latestDevice.bdoId,
                            bdoName: latestDevice.bdoName
                        });
                        
                        currentDevice = {
                            imei: latestDevice.imei,
                            shopName: latestDevice.shopName,
                            streetAddress: latestDevice.streetAddress,
                            city: latestDevice.city,
                            deviceId: latestDevice.id,
                            status: latestDevice.status,
                            bdoCnic: latestDevice.bdoCnic,
                            otpMobileNumber: latestDevice.otpMobileNumber,
                            franchiseCode: latestDevice.franchiseCode,
                            franchiseName: latestDevice.franchiseName,
                            latitude: latestDevice.latitude,
                            longitude: latestDevice.longitude,
                            premiseRelationship: latestDevice.premiseRelationship,
                            shopInsideImageUrl: latestDevice.shopInsideImageUrl,
                            shopOutsideImageUrl: latestDevice.shopOutsideImageUrl,
                            lastUpdatedAt: latestDevice.lastUpdatedAt
                        };
                    } else {
                        console.log(`❌ No mapped devices found for ${bdoData.bdoId} in devices collection`);
                    }
                } catch (error) {
                    console.log('⚠️ Error checking devices collection:', error.message);
                    console.error('Full error:', error);
                }
                
                if (currentDevice) {
                    console.log(`✨ BDO ${bdoData.bdoId} has mapped device:`, currentDevice);
                } else {
                    console.log(`❌ BDO ${bdoData.bdoId} has no mapped device`);
                }
                
                return {
                    ...bdoData,
                    currentDevice
                };
            }));
            
            setBdoList(bdos);
            
            const mappedCount = bdos.filter(bdo => bdo.currentDevice).length;
            console.log(`📊 Summary: ${bdos.length} total BDOs, ${mappedCount} with mapped devices`);
            
            // Debug information for troubleshooting
            console.log('🔍 DEVICE TRANSFER DEBUG (from devices collection):');
            bdos.forEach(bdo => {
                console.log(`   BDO: ${bdo.name} (${bdo.bdoId})`);
                console.log(`   Has Device: ${!!bdo.currentDevice}`);
                if (bdo.currentDevice) {
                    console.log(`   Device IMEI: ${bdo.currentDevice.imei}`);
                    console.log(`   Shop Name: ${bdo.currentDevice.shopName}`);
                    console.log(`   Device Status: ${bdo.currentDevice.status}`);
                    console.log(`   City: ${bdo.currentDevice.city}`);
                    console.log(`   Franchise: ${bdo.currentDevice.franchiseName} (${bdo.currentDevice.franchiseCode})`);
                }
                console.log('   ---');
            });
            
            if (mappedCount === 0) {
                toast.error('No BDOs with device mappings found. Please create device mappings first before attempting transfers.');
            } else {
                toast.success(`Found ${mappedCount} BDO(s) with mapped devices ready for transfer.`);
            }
            
        } catch (error) {
            console.error('Error loading BDOs:', error);
            toast.error('Failed to load BDO list');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Select source BDO (current device owner)
     */
    const selectSourceBDO = (bdo) => {
        if (!bdo.currentDevice) {
            toast.error('This BDO does not have any device mapped');
            return;
        }
        
        setSourceBDO(bdo);
        setDeviceInfo(bdo.currentDevice);
        setStep(2);
        toast.success(`Selected ${bdo.name} as source BDO`);
    };

    /**
     * Select destination BDO (new device owner)
     */
    const selectDestinationBDO = (bdo) => {
        if (bdo.currentDevice) {
            toast.error('This BDO already has a device mapped. Transfer not allowed.');
            return;
        }
        
        if (bdo.bdoId === sourceBDO?.bdoId) {
            toast.error('Cannot transfer device to the same BDO');
            return;
        }
        
        setDestinationBDO(bdo);
        // Keep shop name blank so franchise can enter new shop name
        // Don't pre-populate from current device shop name
        setStep(3); // Move to location details step
        toast.success(`Selected ${bdo.name} as destination BDO`);
    };

    /**
     * Proceed to review step after capturing location details
     */
    const proceedToReview = async () => {
        // Validate location details
        if (!newLocationDetails.shopName.trim()) {
            toast.error('Shop name is required');
            return;
        }
        if (!newLocationDetails.streetAddress.trim()) {
            toast.error('Street address is required');
            return;
        }
        if (!newLocationDetails.city) {
            toast.error('City selection is required');
            return;
        }
        if (!newLocationDetails.premiseRelationship) {
            toast.error('Premise relationship is required');
            return;
        }
        
        // Validate coordinates if provided (optional but if provided must be valid)
        if (newLocationDetails.coordinates.lat || newLocationDetails.coordinates.lng) {
            const latError = validateCoordinate(newLocationDetails.coordinates.lat, 'lat');
            const lngError = validateCoordinate(newLocationDetails.coordinates.lng, 'lng');
            if (latError || lngError) {
                toast.error('Please provide valid coordinates or leave empty');
                return;
            }
        }
        
        try {
            // Upload images if any
            const finalLocationData = await handleImageUploads();
            setNewLocationDetails(finalLocationData);
            setStep(4); // Move to review step
        } catch (error) {
            console.error('Error uploading images:', error);
            toast.error('Failed to upload images. Please try again.');
        }
    };

    /**
     * Submit transfer request
     */
    const submitTransferRequest = async () => {
        if (!transferReason.trim()) {
            toast.error('Please provide a reason for transfer');
            return;
        }

        setSubmitting(true);
        try {
            console.log('🚀 Submitting transfer request...');
            
            // Generate request number using Cloud Functions
            const cloudFunctions = new CloudFunctionsService(app);
            let requestNumber;
            
            try {
                const result = await cloudFunctions.generateRequestNumber();
                requestNumber = result.requestNumber;
                console.log('✅ Generated request number:', requestNumber);
            } catch (error) {
                console.warn('⚠️ Cloud Function failed, generating fallback request number');
                requestNumber = `REQ-${Date.now()}`;
            }

            // Create structured request document following RequestWizard pattern
            const transferRequestDoc = {
                // Core identification (consistent with RequestWizard)
                type: 'TRANSFER_OWNERSHIP',
                status: 'SUBMITTED',
                requestType: 'TRANSFER_OWNERSHIP',
                requestNumber: requestNumber,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                
                // User and franchise information
                franchiseId: user.franchiseId || user.uid,
                franchiseName: user.franchiseName || user.name,
                franchiseCode: user.franchiseCode,
                submittedBy: user.uid,
                assignedTo: 'Sales Team',
                userRole: user.role || 'Franchise',
                
                // Structured BDO details (destination - new owner)
                bdoDetails: {
                    bdoId: destinationBDO.bdoId,
                    name: destinationBDO.name,
                    cnicNumber: destinationBDO.cnic,
                    otpMobileNumber: destinationBDO.otpMobileNumber,
                    handlerType: 'Retailer'
                },
                
                // Structured device details
                deviceDetails: {
                    imei: deviceInfo.imei,
                    currentShopName: deviceInfo.shopName,
                    currentCity: deviceInfo.city,
                    currentStreetAddress: deviceInfo.streetAddress,
                    newShopName: newLocationDetails.shopName,
                    newCity: newLocationDetails.city,
                    newStreetAddress: newLocationDetails.streetAddress,
                    newCoordinates: {
                        latitude: newLocationDetails.coordinates.lat || null,
                        longitude: newLocationDetails.coordinates.lng || null
                    },
                    premiseRelationship: newLocationDetails.premiseRelationship
                },
                
                // Transfer-specific details
                transferDetails: {
                    sourceBdoId: sourceBDO.bdoId,
                    sourceBdoName: sourceBDO.name,
                    destinationBdoId: destinationBDO.bdoId,
                    destinationBdoName: destinationBDO.name,
                    transferReason: transferReason,
                    originalDeviceId: deviceInfo.deviceId, // Using deviceId from devices collection instead of requestId
                    requiresNewLocation: true,
                    transferJustification: transferReason,
                    businessImpact: 'Device ownership change requires immediate processing'
                },
                
                // Documents and media
                documents: {
                    shopInsideImage: newLocationDetails.shopInsideImage,
                    shopOutsideImage: newLocationDetails.shopOutsideImage
                },
                
                // Revision workflow support (consistent with RequestWizard)
                isResubmission: isRevision,
                revisionCount: isRevision ? (editingRequest.revisionCount || 0) + 1 : 0,
                revisionHistory: isRevision ? [
                    ...(editingRequest.revisionHistory || []),
                    {
                        rejectedAt: editingRequest.updatedAt,
                        rejectionReason: editingRequest.rejectionReason,
                        resubmittedAt: new Date(),
                        revisionNumber: (editingRequest.revisionCount || 0) + 1
                    }
                ] : [],
                previousRejectionReason: isRevision ? editingRequest.rejectionReason : "",
                resubmittedAt: isRevision ? serverTimestamp() : null,
                rejectionReason: "",
                
                // Legacy field compatibility (for existing queries)
                imei: deviceInfo.imei,
                bdoId: destinationBDO.bdoId,
                bdoName: destinationBDO.name,
                shopName: newLocationDetails.shopName,
                city: newLocationDetails.city,
                streetAddress: newLocationDetails.streetAddress,
                latitude: newLocationDetails.coordinates.lat || null,
                longitude: newLocationDetails.coordinates.lng || null,
                cnicNumber: destinationBDO.cnic,
                otpMobileNumber: destinationBDO.otpMobileNumber,
                handlerType: 'Retailer',
                premiseRelationship: newLocationDetails.premiseRelationship,
                
                // Enhanced metadata (consistent with RequestWizard)
                metadata: {
                    version: '2.0',
                    source: 'web-app',
                    priority: 'HIGH',
                    userAgent: navigator.userAgent,
                    submissionTimestamp: new Date().toISOString(),
                    requestCategory: 'TRANSFER',
                    workflowType: 'TRANSFER_OWNERSHIP'
                }
            };

            console.log('📝 Transfer request document:', transferRequestDoc);

            // Enhanced validation for new document structure
            const validateDocumentData = (doc) => {
                const issues = [];
                
                // Core structure validation
                if (!doc.type) issues.push('type is missing');
                if (!doc.requestType) issues.push('requestType is missing');
                if (!doc.requestNumber) issues.push('requestNumber is missing');
                if (!doc.status) issues.push('status is missing');
                
                // BDO details validation
                if (!doc.bdoDetails?.bdoId) issues.push('bdoDetails.bdoId is missing');
                if (!doc.bdoDetails?.name) issues.push('bdoDetails.name is missing');
                
                // Device details validation
                if (!doc.deviceDetails?.imei) issues.push('deviceDetails.imei is missing');
                if (!doc.deviceDetails?.newShopName) issues.push('deviceDetails.newShopName is missing');
                if (!doc.deviceDetails?.newCity) issues.push('deviceDetails.newCity is missing');
                if (!doc.deviceDetails?.newStreetAddress) issues.push('deviceDetails.newStreetAddress is missing');
                
                // Transfer details validation
                if (!doc.transferDetails?.sourceBdoId) issues.push('transferDetails.sourceBdoId is missing');
                if (!doc.transferDetails?.destinationBdoId) issues.push('transferDetails.destinationBdoId is missing');
                if (!doc.transferDetails?.transferReason) issues.push('transferDetails.transferReason is missing');
                if (!doc.transferDetails?.originalDeviceId) issues.push('transferDetails.originalDeviceId is missing');
                
                // Coordinate validation (optional but if provided must be valid)
                const lat = doc.deviceDetails?.newCoordinates?.latitude;
                const lng = doc.deviceDetails?.newCoordinates?.longitude;
                if ((lat !== null && lat !== undefined) && (isNaN(lat) || lat < 23.5 || lat > 37.5)) {
                    issues.push('deviceDetails.newCoordinates.latitude is invalid for Pakistan');
                }
                if ((lng !== null && lng !== undefined) && (isNaN(lng) || lng < 60.5 || lng > 77.5)) {
                    issues.push('deviceDetails.newCoordinates.longitude is invalid for Pakistan');
                }
                
                // Legacy field validation (for backward compatibility)
                if (doc.latitude === undefined) issues.push('latitude is undefined');
                if (doc.longitude === undefined) issues.push('longitude is undefined');
                if (!doc.shopName) issues.push('shopName is missing');
                if (!doc.city) issues.push('city is missing');
                if (!doc.streetAddress) issues.push('streetAddress is missing');
                if (!doc.bdoId) issues.push('bdoId is missing');
                if (!doc.imei) issues.push('imei is missing');
                
                return issues;
            };

            const validationIssues = validateDocumentData(transferRequestDoc);
            if (validationIssues.length > 0) {
                console.error('❌ Document validation failed:', validationIssues);
                throw new Error(`Document validation failed: ${validationIssues.join(', ')}`);
            }

            console.log('✅ Document validation passed');

            // Submit or update the transfer request
            let docRef, firestoreDocId;
            
            if (isEditing) {
                // Update existing request
                console.log('📝 Updating existing transfer request with ID:', editingRequest.id);
                const { updateDoc, doc } = await import('firebase/firestore');
                const requestRef = doc(db, 'requestsV2', editingRequest.id);
                await updateDoc(requestRef, transferRequestDoc);
                firestoreDocId = editingRequest.id;
                console.log('✅ Transfer request updated successfully with ID:', firestoreDocId);
            } else {
                // Create new request
                console.log('📝 Creating new transfer request...');
                docRef = await addDoc(collection(db, 'requestsV2'), transferRequestDoc);
                firestoreDocId = docRef.id;
                console.log('✅ Transfer request created with ID:', firestoreDocId);
            }

            // Enhanced action logging (consistent with RequestWizard)
            const actionLogger = new ActionLogger(db, user);
            const actionType = isEditing ? (isRevision ? 'RESUBMIT' : 'UPDATE') : 'CREATE';
            const description = isRevision 
                ? `Transfer request ${requestNumber} resubmitted after revision (Revision #${transferRequestDoc.revisionCount}) - Device ${deviceInfo.imei} from ${sourceBDO.name} to ${destinationBDO.name}`
                : isEditing 
                ? `Transfer request ${requestNumber} updated - Device ${deviceInfo.imei} from ${sourceBDO.name} to ${destinationBDO.name}`
                : `Transfer request ${requestNumber} created - Device ${deviceInfo.imei} from ${sourceBDO.name} to ${destinationBDO.name}`;
                
            await actionLogger.logAction({
                type: actionType,
                description,
                category: 'REQUEST',
                target: {
                    entityType: 'request',
                    entityId: requestNumber,
                    entityIdentifier: requestNumber
                },
                context: {
                    requestId: requestNumber,
                    requestType: 'TRANSFER_OWNERSHIP',
                    bdoId: destinationBDO.bdoId,
                    sourceBdoId: sourceBDO.bdoId,
                    deviceImei: deviceInfo.imei,
                    firestoreDocId: firestoreDocId,
                    franchiseCode: user.franchiseCode,
                    transferReason: transferReason,
                    isEditing,
                    isRevision,
                    revisionCount: transferRequestDoc.revisionCount || 0,
                    previousRejectionReason: isRevision ? transferRequestDoc.previousRejectionReason : null
                },
                severity: 'INFO'
            });

            const successMessage = isRevision 
                ? `Transfer request resubmitted successfully! Request Number: ${requestNumber} (Revision #${transferRequestDoc.revisionCount})`
                : isEditing 
                ? `Transfer request updated successfully! Request Number: ${requestNumber}`
                : `Transfer request ${requestNumber} submitted successfully!`;
                
            toast.success(successMessage);
            onSuccess && onSuccess({
                requestNumber,
                firestoreDocId,
                formData: transferRequestDoc,
                isEditing,
                isRevision
            });

        } catch (error) {
            console.error('❌ Error submitting transfer request:', error);
            toast.error('Failed to submit transfer request: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Debug function to check device mappings
     */
    const debugDeviceMappings = async () => {
        try {
            console.log('🔍 MANUAL DEBUG - Checking all requests for TTTTT1-00011...');
            
            // First, check all requests for this BDO
            const allRequestsQuery = query(
                collection(db, 'requestsV2'),
                where('bdoDetails.bdoId', '==', 'TTTTT1-00011')
            );
            
            const allSnapshot = await getDocs(allRequestsQuery);
            console.log('📋 All requests for TTTTT1-00011:', allSnapshot.size);
            
            allSnapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                console.log(`Request ${index + 1}:`, {
                    id: doc.id,
                    requestType: data.requestType,
                    status: data.status,
                    imei: data.deviceDetails?.imei,
                    shopName: data.deviceDetails?.shopName,
                    createdAt: data.createdAt?.toDate?.()?.toLocaleString() || 'No date'
                });
            });
            
            // Now check NEW_MAPPING specifically
            const mappingQuery = query(
                collection(db, 'requestsV2'),
                where('bdoDetails.bdoId', '==', 'TTTTT1-00011'),
                where('requestType', '==', 'NEW_MAPPING')
            );
            
            const mappingSnapshot = await getDocs(mappingQuery);
            console.log('📱 NEW_MAPPING requests for TTTTT1-00011:', mappingSnapshot.size);
            
            mappingSnapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                console.log(`NEW_MAPPING ${index + 1}:`, {
                    id: doc.id,
                    status: data.status,
                    imei: data.deviceDetails?.imei,
                    shopName: data.deviceDetails?.shopName
                });
            });
            
            // Check approved NEW_MAPPING
            const approvedQuery = query(
                collection(db, 'requestsV2'),
                where('bdoDetails.bdoId', '==', 'TTTTT1-00011'),
                where('requestType', '==', 'NEW_MAPPING'),
                where('status', 'in', ['approved', 'completed', 'Approved', 'Completed'])
            );
            
            const approvedSnapshot = await getDocs(approvedQuery);
            console.log('✅ Approved NEW_MAPPING requests for TTTTT1-00011:', approvedSnapshot.size);
            
            toast.success(`Debug complete. Found ${allSnapshot.size} total requests, ${mappingSnapshot.size} NEW_MAPPING, ${approvedSnapshot.size} approved. Check console for details.`);
            
        } catch (error) {
            console.error('Debug error:', error);
            toast.error('Debug failed: ' + error.message);
        }
    };

    /**
     * Filter BDOs based on search term
     */
    const filteredBDOs = bdoList.filter(bdo => {
        const searchLower = searchTerm.toLowerCase();
        return (
            bdo.name?.toLowerCase().includes(searchLower) ||
            bdo.bdoId?.toLowerCase().includes(searchLower) ||
            bdo.cnic?.toLowerCase().includes(searchLower) ||
            bdo.otpMobileNumber?.toLowerCase().includes(searchLower)
        );
    });

    return (
        <div className="max-w-4xl mx-auto">
            {/* Revision Warning Banner (consistent with RequestWizard) */}
            {isRevision && editingRequest?.rejectionReason && (
                <div className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-orange-800">Transfer Request Revision Required</h3>
                            <div className="mt-2 text-sm text-orange-700">
                                <p><strong>Team feedback:</strong> {editingRequest.rejectionReason}</p>
                                {editingRequest.revisionCount && (
                                    <p className="mt-1 text-xs"><strong>Revision #{editingRequest.revisionCount + 1}</strong></p>
                                )}
                            </div>
                            
                            {/* Revision History */}
                            {editingRequest.revisionHistory?.length > 0 && (
                                <details className="mt-3">
                                    <summary className="text-sm text-orange-700 cursor-pointer hover:text-orange-800">
                                        View revision history ({editingRequest.revisionHistory.length} previous revisions)
                                    </summary>
                                    <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                                        {editingRequest.revisionHistory.map((revision, index) => (
                                            <div key={index} className="text-xs bg-white/60 p-2 rounded border-l-2 border-orange-200">
                                                <div className="font-medium">Revision #{revision.revisionNumber}</div>
                                                <div className="text-orange-600">{revision.rejectionReason}</div>
                                                <div className="text-gray-500 text-xs mt-1">
                                                    {revision.rejectedAt?.toDate?.()?.toLocaleDateString() || 'Previous revision'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                        {isEditing ? (
                            <>
                                <svg className="h-6 w-6 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                {isRevision ? 'Revise Transfer Request' : 'Edit Transfer Request'}
                                {editingRequest?.revisionCount && (
                                    <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                                        Revision #{(editingRequest.revisionCount || 0) + 1}
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                Device Transfer (Transfer of Ownership)
                            </>
                        )}
                    </h2>
                    <p className="text-gray-600 mt-1">
                        {isEditing 
                            ? (isRevision ? 'Address the feedback and resubmit your transfer request' : 'Update your transfer request details')
                            : 'Transfer device ownership from one BDO to another'
                        }
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={debugDeviceMappings}
                        className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors"
                    >
                        🔍 Debug Mappings
                    </button>
                    <button
                        onClick={onCancel}
                        className="text-gray-600 hover:text-gray-800"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Progress Indicator */}
            <div className="mb-8">
                <div className="flex items-center">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                        1
                    </div>
                    <div className={`flex-1 h-1 mx-4 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                        2
                    </div>
                    <div className={`flex-1 h-1 mx-4 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                        3
                    </div>
                    <div className={`flex-1 h-1 mx-4 ${step >= 4 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 4 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                        4
                    </div>
                </div>
                <div className="flex justify-between mt-2 text-sm text-gray-600">
                    <span>Select Source BDO</span>
                    <span>Select Destination BDO</span>
                    <span>New Location Details</span>
                    <span>Review & Submit</span>
                </div>
            </div>

            {/* Step 1: Select Source BDO */}
            {step === 1 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Step 1: Select Source BDO (Current Device Owner)</h3>
                    <p className="text-gray-600 mb-4">Select the BDO who currently owns the device you want to transfer.</p>
                    
                    {/* Search */}
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search BDOs by name, ID, CNIC, or OTP..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="text-gray-600 mt-2">Loading BDOs...</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {filteredBDOs.filter(bdo => bdo.currentDevice).map(bdo => (
                                <div 
                                    key={bdo.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => selectSourceBDO(bdo)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900">{bdo.name}</h4>
                                            <p className="text-sm text-blue-600 font-medium">{bdo.bdoId}</p>
                                            <p className="text-sm text-gray-600">CNIC: {bdo.cnic}</p>
                                            <p className="text-sm text-gray-600">OTP: {bdo.otpMobileNumber}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium mb-1">
                                                Device Mapped
                                            </div>
                                            <p className="text-sm font-mono text-gray-700">IMEI: {bdo.currentDevice.imei}</p>
                                            <p className="text-sm text-gray-600">Shop: {bdo.currentDevice.shopName}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {filteredBDOs.filter(bdo => bdo.currentDevice).length === 0 && (
                                <div className="text-center py-8">
                                    <p className="text-gray-500">No BDOs with mapped devices found</p>
                                    {searchTerm && (
                                        <p className="text-sm text-gray-400 mt-2">Try adjusting your search criteria</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Select Destination BDO */}
            {step === 2 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Step 2: Select Destination BDO (New Device Owner)</h3>
                    <p className="text-gray-600 mb-4">Select the BDO who will receive the device.</p>
                    
                    {/* Selected Source BDO Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <h4 className="font-medium text-blue-900 mb-2">Transferring from:</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="font-medium">BDO:</span> {sourceBDO?.name} ({sourceBDO?.bdoId})
                            </div>
                            <div>
                                <span className="font-medium">Device:</span> {deviceInfo?.imei}
                            </div>
                            <div>
                                <span className="font-medium">Shop:</span> {deviceInfo?.shopName}
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search available BDOs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {(() => {
                            const availableBDOs = filteredBDOs.filter(bdo => !bdo.currentDevice && bdo.bdoId !== sourceBDO?.bdoId);
                            console.log('🔍 Debug Step 2 - Total filtered BDOs:', filteredBDOs.length);
                            console.log('🔍 Debug Step 2 - Available BDOs (no device):', availableBDOs.length);
                            console.log('🔍 Debug Step 2 - Source BDO ID:', sourceBDO?.bdoId);
                            console.log('🔍 Debug Step 2 - All BDOs:', filteredBDOs.map(bdo => ({
                                id: bdo.bdoId,
                                name: bdo.name,
                                hasDevice: !!bdo.currentDevice,
                                isSource: bdo.bdoId === sourceBDO?.bdoId
                            })));
                            
                            return availableBDOs.map(bdo => (
                                <div 
                                    key={bdo.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => selectDestinationBDO(bdo)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900">{bdo.name}</h4>
                                            <p className="text-sm text-blue-600 font-medium">{bdo.bdoId}</p>
                                            <p className="text-sm text-gray-600">CNIC: {bdo.cnic}</p>
                                            <p className="text-sm text-gray-600">OTP: {bdo.otpMobileNumber}</p>
                                        </div>
                                        <div className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                                            Available
                                        </div>
                                    </div>
                                </div>
                            ));
                        })()}
                        
                        {filteredBDOs.filter(bdo => !bdo.currentDevice && bdo.bdoId !== sourceBDO?.bdoId).length === 0 && (
                            <div className="text-center py-8">
                                <p className="text-gray-500">No available BDOs found</p>
                                <p className="text-sm text-gray-400 mt-2">
                                    {filteredBDOs.length === 0 
                                        ? "No BDOs match your search criteria" 
                                        : `${filteredBDOs.filter(bdo => !!bdo.currentDevice).length} BDOs already have devices mapped`
                                    }
                                </p>
                                {searchTerm && (
                                    <p className="text-sm text-gray-400 mt-2">Try adjusting your search criteria</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-between">
                        <button
                            onClick={() => setStep(1)}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                            ← Back
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: New Location Details */}
            {step === 3 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Step 3: New Location Details</h3>
                    <p className="text-gray-600 mb-6">Provide the new location details where the device will be relocated to.</p>

                    <div className="space-y-6">
                        {/* Shop Information */}
                        <div className="space-y-4">
                            <h4 className="font-medium text-gray-900 border-b pb-2">Shop Information</h4>
                            
                            {/* Shop Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Shop Name *
                                </label>
                                <input
                                    type="text"
                                    value={newLocationDetails.shopName}
                                    onChange={(e) => setNewLocationDetails(prev => ({
                                        ...prev,
                                        shopName: e.target.value
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter shop name"
                                />
                            </div>

                            {/* Street Address */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Street Address *
                                </label>
                                <input
                                    type="text"
                                    value={newLocationDetails.streetAddress}
                                    onChange={(e) => setNewLocationDetails(prev => ({
                                        ...prev,
                                        streetAddress: e.target.value
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter complete street address"
                                />
                            </div>

                            {/* City Selection */}
                            <CitySelector
                                value={newLocationDetails.city}
                                onChange={(city) => setNewLocationDetails(prev => ({ ...prev, city }))}
                                required={true}
                                placeholder="Select a city..."
                            />

                            {/* Premise Relationship */}
                            <PremiseRelationshipSelector
                                value={newLocationDetails.premiseRelationship}
                                onChange={(relationship) => setNewLocationDetails(prev => ({ ...prev, premiseRelationship: relationship }))}
                                required={true}
                            />
                        </div>

                        {/* Location (Optional) */}
                        <div className="space-y-4">
                            <h4 className="font-medium text-gray-900 border-b pb-2">Location (Optional)</h4>
                            
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Location Guidelines:</strong>
                                    <br />• Latitude range for Pakistan: 23.5° to 37.5°
                                    <br />• Longitude range for Pakistan: 60.5° to 77.5°
                                    <br />• Use up to 8 decimal places for high precision
                                    <br />• Click "Get Current Location" for automatic detection
                                </p>
                            </div>
                            
                            <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Latitude <span className="text-xs text-gray-500">(up to 8 decimal places)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newLocationDetails.coordinates?.lat || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setNewLocationDetails(prev => ({
                                                ...prev,
                                                coordinates: { 
                                                    lat: value,
                                                    lng: prev.coordinates?.lng || ''
                                                }
                                            }));
                                            // Real-time validation
                                            const latError = validateCoordinate(value, 'lat');
                                            setCoordinateErrors(prev => ({ ...prev, lat: latError }));
                                        }}
                                        placeholder="e.g., 24.86062500"
                                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                            coordinateErrors.lat ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    />
                                    {coordinateErrors.lat && (
                                        <p className="text-sm text-red-600 mt-1">{coordinateErrors.lat}</p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Longitude <span className="text-xs text-gray-500">(up to 8 decimal places)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newLocationDetails.coordinates?.lng || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setNewLocationDetails(prev => ({
                                                ...prev,
                                                coordinates: { 
                                                    lat: prev.coordinates?.lat || '',
                                                    lng: value
                                                }
                                            }));
                                            // Real-time validation
                                            const lngError = validateCoordinate(value, 'lng');
                                            setCoordinateErrors(prev => ({ ...prev, lng: lngError }));
                                        }}
                                        placeholder="e.g., 67.01093750"
                                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                            coordinateErrors.lng ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    />
                                    {coordinateErrors.lng && (
                                        <p className="text-sm text-red-600 mt-1">{coordinateErrors.lng}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={getCurrentLocation}
                                    disabled={locationLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {locationLoading ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    ) : (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                    Get Current Location
                                </button>
                            </div>
                        </div>

                        {/* Shop Images */}
                        <div className="space-y-4">
                            <h4 className="font-medium text-gray-900 border-b pb-2">Shop Images</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Inside Image */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Shop Inside Image
                                    </label>
                                    <div 
                                        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors relative"
                                        onClick={() => insideImageRef.current?.click()}
                                    >
                                        {imageFiles.inside ? (
                                            <div>
                                                <img 
                                                    src={URL.createObjectURL(imageFiles.inside)} 
                                                    alt="Shop Inside Preview" 
                                                    className="mx-auto h-32 w-auto object-cover rounded"
                                                />
                                                <p className="text-sm text-gray-600 mt-2">{imageFiles.inside.name}</p>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setImageFiles(prev => ({ ...prev, inside: null }));
                                                    }}
                                                    className="text-red-600 text-sm hover:text-red-700 mt-1"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                                                </svg>
                                                <p className="text-sm text-gray-600 mt-2">Click to upload shop inside image</p>
                                                <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF up to 10MB</p>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        ref={insideImageRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleFileSelect('inside', e.target.files[0])}
                                        className="hidden"
                                    />
                                </div>

                                {/* Outside Image */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Shop Outside Image
                                    </label>
                                    <div 
                                        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors relative"
                                        onClick={() => outsideImageRef.current?.click()}
                                    >
                                        {imageFiles.outside ? (
                                            <div>
                                                <img 
                                                    src={URL.createObjectURL(imageFiles.outside)} 
                                                    alt="Shop Outside Preview" 
                                                    className="mx-auto h-32 w-auto object-cover rounded"
                                                />
                                                <p className="text-sm text-gray-600 mt-2">{imageFiles.outside.name}</p>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setImageFiles(prev => ({ ...prev, outside: null }));
                                                    }}
                                                    className="text-red-600 text-sm hover:text-red-700 mt-1"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                                                </svg>
                                                <p className="text-sm text-gray-600 mt-2">Click to upload shop outside image</p>
                                                <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF up to 10MB</p>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        ref={outsideImageRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleFileSelect('outside', e.target.files[0])}
                                        className="hidden"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between mt-8">
                        <button
                            onClick={() => setStep(2)}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                            ← Back
                        </button>
                        <button
                            onClick={proceedToReview}
                            disabled={uploading}
                            className={`px-6 py-2 rounded-md font-medium transition-colors ${
                                uploading
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {uploading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Uploading Images...
                                </>
                            ) : (
                                'Continue to Review →'
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 4: Review & Submit */}
            {step === 4 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Step 4: Review & Submit Transfer Request</h3>
                    <p className="text-gray-600 mb-6">Please review the transfer details and provide a reason for the transfer.</p>
                    
                    {/* Transfer Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* From */}
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <h4 className="font-medium text-red-900 mb-3">Transferring FROM:</h4>
                            <div className="space-y-2 text-sm">
                                <div><span className="font-medium">BDO Name:</span> {sourceBDO?.name}</div>
                                <div><span className="font-medium">BDO ID:</span> {sourceBDO?.bdoId}</div>
                                <div><span className="font-medium">CNIC:</span> {sourceBDO?.cnic}</div>
                                <div><span className="font-medium">OTP:</span> {sourceBDO?.otpMobileNumber}</div>
                            </div>
                        </div>

                        {/* To */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="font-medium text-green-900 mb-3">Transferring TO:</h4>
                            <div className="space-y-2 text-sm">
                                <div><span className="font-medium">BDO Name:</span> {destinationBDO?.name}</div>
                                <div><span className="font-medium">BDO ID:</span> {destinationBDO?.bdoId}</div>
                                <div><span className="font-medium">CNIC:</span> {destinationBDO?.cnic}</div>
                                <div><span className="font-medium">OTP:</span> {destinationBDO?.otpMobileNumber}</div>
                            </div>
                        </div>
                    </div>

                    {/* Device Information - Prominent Display */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 mb-6 shadow-lg">
                        <div className="flex items-center mb-4">
                            <svg className="h-8 w-8 mr-3 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <h4 className="text-xl font-bold">Device Being Transferred</h4>
                        </div>
                        <div className="bg-white bg-opacity-20 rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="text-center md:text-left">
                                    <p className="text-blue-100 text-sm font-medium mb-1">DEVICE IMEI</p>
                                    <p className="text-2xl font-bold font-mono tracking-wider bg-white bg-opacity-20 px-4 py-2 rounded">
                                        {deviceInfo?.imei}
                                    </p>
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-blue-100 text-sm font-medium mb-1">CURRENT LOCATION</p>
                                    <p className="text-lg font-semibold">
                                        {deviceInfo?.shopName}
                                    </p>
                                    <p className="text-blue-100 text-sm mt-1">
                                        {deviceInfo?.city}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* New Location Details */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <h4 className="font-medium text-green-900 mb-3">New Location Details:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                            <div><span className="font-medium">Shop Name:</span> {newLocationDetails.shopName}</div>
                            <div><span className="font-medium">Street Address:</span> {newLocationDetails.streetAddress}</div>
                            <div><span className="font-medium">City:</span> {newLocationDetails.city}</div>
                            {newLocationDetails.coordinates?.lat && newLocationDetails.coordinates?.lng && (
                                <div><span className="font-medium">Coordinates:</span> {newLocationDetails.coordinates.lat}, {newLocationDetails.coordinates.lng}</div>
                            )}
                        </div>
                        {(imageFiles.inside || imageFiles.outside || newLocationDetails.shopInsideImage || newLocationDetails.shopOutsideImage) && (
                            <div>
                                <p className="font-medium text-green-900 mb-2">Shop Images:</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {(imageFiles.inside || newLocationDetails.shopInsideImage) && (
                                        <div className="text-center">
                                            <img
                                                src={imageFiles.inside ? URL.createObjectURL(imageFiles.inside) : newLocationDetails.shopInsideImage}
                                                alt="Shop Inside"
                                                className="w-full h-16 object-cover rounded border"
                                            />
                                            <p className="text-xs text-gray-600 mt-1">Inside</p>
                                        </div>
                                    )}
                                    {(imageFiles.outside || newLocationDetails.shopOutsideImage) && (
                                        <div className="text-center">
                                            <img
                                                src={imageFiles.outside ? URL.createObjectURL(imageFiles.outside) : newLocationDetails.shopOutsideImage}
                                                alt="Shop Outside"
                                                className="w-full h-16 object-cover rounded border"
                                            />
                                            <p className="text-xs text-gray-600 mt-1">Outside</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Transfer Reason - Clear but Less Prominent */}
                    <div className="bg-gray-50 border-l-4 border-orange-500 rounded-lg p-4 mb-6">
                        <div className="flex items-center mb-3">
                            <svg className="h-5 w-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h4 className="text-lg font-semibold text-gray-900">Reason for Transfer</h4>
                            <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium">Required</span>
                        </div>
                        <select
                            value={transferReason}
                            onChange={(e) => setTransferReason(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                        >
                            <option value="">Select a reason...</option>
                            {transferReasons.map(reason => (
                                <option key={reason} value={reason}>{reason}</option>
                            ))}
                        </select>
                        {transferReason && (
                            <div className="mt-2 text-sm text-gray-600">
                                <span className="font-medium">Selected:</span> {transferReason}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between">
                        <button
                            onClick={() => setStep(3)}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                            ← Back
                        </button>
                        <button
                            onClick={submitTransferRequest}
                            disabled={!transferReason.trim() || submitting}
                            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <span className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Submitting...
                                </span>
                            ) : (
                                'Submit Transfer Request'
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DeviceTransferForm;
