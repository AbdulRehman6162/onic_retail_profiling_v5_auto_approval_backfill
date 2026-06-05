// --- Device and Shop Details Step ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getStorage } from 'firebase/storage';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Major Pakistani cities with population > 100,000
const PAKISTAN_CITIES = [
    'Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Peshawar', 
    'Multan', 'Hyderabad', 'Islamabad', 'Quetta', 'Bahawalpur', 'Sargodha',
    'Sialkot', 'Sukkur', 'Larkana', 'Sheikhupura', 'Jhang', 'Rahim Yar Khan',
    'Gujrat', 'Kasur', 'Mardan', 'Mingora', 'Dera Ghazi Khan', 'Sahiwal',
    'Nawabshah', 'Okara', 'Mirpur Khas', 'Chiniot', 'Kamoke', 'Mandi Bahauddin',
    'Jhelum', 'Sadiqabad', 'Jacobabad', 'Shikarpur', 'Khanewal', 'Hafizabad',
    'Kohat', 'Muzaffargarh', 'Khanpur', 'Gojra', 'Bahawalnagar', 'Muridke',
    'Pak Pattan', 'Abottabad', 'Tando Adam', 'Jaranwala', 'Khairpur', 'Chishtian'
].sort();

/**
 * Step 3: Device and Shop Details / OTP Change Details
 * Captures device IMEI, shop information, and uploads images for NEW_MAPPING/TRANSFER
 * OR captures OTP change details for OTP_CHANGE requests
 */
function DeviceDetailsStep({ 
    formData, 
    updateStepData, 
    user, 
    app,
    onNext, 
    onPrev,
    isFirstStep, 
    isLastStep 
}) {
    // Get request type from formData
    const requestType = formData.requestType;
    
    const [deviceData, setDeviceData] = useState(() => {
        const data = formData.deviceDetails || {};
        return {
            imei: data.imei || '',
            shopName: data.shopName || '',
            streetAddress: data.streetAddress || '',
            city: data.city || '',
            premiseRelationship: data.premiseRelationship || '',
            coordinates: data.coordinates || { lat: '', lng: '' },
            shopInsideImage: data.shopInsideImage || null,
            shopOutsideImage: data.shopOutsideImage || null
        };
    });

    // OTP Change specific state
    const [otpChangeData, setOtpChangeData] = useState(() => {
        const data = formData.otpChangeDetails || formData.otp_change_details || {};
        return {
            currentOTP: data.currentOTP || '',
            newOTP: data.newOTP || '',
            changeReason: data.changeReason || '',
            deviceInfo: data.deviceInfo || null
        };
    });
    const [otpValidation, setOtpValidation] = useState({
        isChecking: false,
        isValid: false,
        message: ''
    });

    // De-mapping specific state
    const [demappingData, setDemappingData] = useState(() => {
        const data = formData.demappingDetails || formData.de_mapping_details || {};
        return {
            demappingReason: data.demappingReason || '',
            confirmationText: data.confirmationText || '',
            deviceInfo: data.deviceInfo || null,
            currentMapping: data.currentMapping || null
        };
    });
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [imageFiles, setImageFiles] = useState({
        inside: null,
        outside: null
    });
    const [uploadProgress, setUploadProgress] = useState({
        inside: 0,
        outside: 0
    });
    const [uploading, setUploading] = useState(false);
    const [isValid, setIsValid] = useState(false);
    const [storage] = useState(() => getStorage(app));
    const [db] = useState(() => getFirestore(app));
    
    // IMEI validation states
    const [imeiValidation, setImeiValidation] = useState({
        isChecking: false,
        isAvailable: true,
        existingRequest: null
    });
    
    // City dropdown states
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
    const [citySearchTerm, setCitySearchTerm] = useState('');
    const [filteredCities, setFilteredCities] = useState(PAKISTAN_CITIES);
    const [showManualCityInput, setShowManualCityInput] = useState(false);
    
    // Coordinate validation states
    const [coordinateErrors, setCoordinateErrors] = useState({ lat: '', lng: '' });
    
    // File input refs
    const insideImageRef = useRef(null);
    const outsideImageRef = useRef(null);

    useEffect(() => {
        if (requestType === 'OTP_CHANGE') {
            loadCurrentBDOInfo();
            validateOTPForm();
        } else if (requestType === 'DE_MAPPING') {
            loadCurrentBDOMapping();
            validateDemappingForm();
        } else {
            validateForm();
        }
    }, [deviceData, imeiValidation, otpChangeData, demappingData, requestType]);

    useEffect(() => {
        // Filter cities based on search term
        if (citySearchTerm) {
            const filtered = PAKISTAN_CITIES.filter(city => 
                city.toLowerCase().includes(citySearchTerm.toLowerCase())
            );
            setFilteredCities(filtered);
        } else {
            setFilteredCities(PAKISTAN_CITIES);
        }
    }, [citySearchTerm]);

    // Load current BDO device info for OTP change
    useEffect(() => {
        if (requestType === 'OTP_CHANGE' && formData.bdoDetails) {
            loadCurrentBDOInfo();
        }
    }, [requestType, formData.bdoDetails]);

    // Load current BDO mapping info for de-mapping
    useEffect(() => {
        if (requestType === 'DE_MAPPING' && formData.bdoDetails) {
            loadCurrentBDOMapping();
        }
    }, [requestType, formData.bdoDetails]);

    // Debounced OTP validation
    useEffect(() => {
        const timer = setTimeout(() => {
            if (otpChangeData.newOTP && requestType === 'OTP_CHANGE') {
                checkOTPAvailability(otpChangeData.newOTP);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [otpChangeData.newOTP, requestType]);

    useEffect(() => {
        // Close city dropdown when clicking outside
        const handleClickOutside = (event) => {
            if (!event.target.closest('.city-dropdown-container')) {
                setCityDropdownOpen(false);
            }
        };

        if (cityDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [cityDropdownOpen]);

    /**
     * Check if IMEI is already mapped to another BDO using devices collection
     */
    const checkIMEIAvailability = useCallback(async (imei) => {
        if (!imei || imei.length !== 15) {
            setImeiValidation({ checking: false, isAvailable: null, message: '' });
            return;
        }

        // Validate that IMEI contains only digits
        if (!/^\d{15}$/.test(imei)) {
            setImeiValidation({
                checking: false,
                isAvailable: false,
                message: 'IMEI must contain only numbers (no letters or special characters)'
            });
            return;
        }

        setImeiValidation({ checking: true, isAvailable: null, message: 'Checking IMEI availability...' });

        try {
            // Check the devices collection directly (single source of truth)
            const deviceQuery = query(
                collection(db, 'devices'),
                where('imei', '==', imei)
            );
            
            const deviceSnapshot = await getDocs(deviceQuery);
            
            if (!deviceSnapshot.empty) {
                const existingDevice = deviceSnapshot.docs[0].data();
                
                // Check if the device is currently mapped
                if (existingDevice.status === 'Mapped' && existingDevice.bdoId) {
                    setImeiValidation({
                        checking: false,
                        isAvailable: false,
                        message: `IMEI already mapped to BDO: ${existingDevice.bdoId} (${existingDevice.bdoName || 'Unknown'})`
                    });
                } else if (existingDevice.status === 'Unmapped') {
                    // Device exists but is unmapped - can be reused
                    setImeiValidation({
                        checking: false,
                        isAvailable: true,
                        message: 'IMEI available (previously used but now unmapped)'
                    });
                } else {
                    // Other statuses might indicate pending transfers, etc.
                    setImeiValidation({
                        checking: false,
                        isAvailable: false,
                        message: `IMEI is in ${existingDevice.status} status and cannot be used`
                    });
                }
            } else {
                // IMEI not found in devices collection - available for new mapping
                setImeiValidation({
                    checking: false,
                    isAvailable: true,
                    message: 'IMEI available for mapping'
                });
            }
        } catch (error) {
            console.error('Error checking IMEI availability:', error);
            setImeiValidation({
                checking: false,
                isAvailable: null,
                message: 'Error checking IMEI availability. Please try again.'
            });
        }
    }, [db]);

    /**
     * Load current BDO device information for OTP change
     */
    const loadCurrentBDOInfo = useCallback(async () => {
        if (!formData.bdoDetails || requestType !== 'OTP_CHANGE') return;

        try {
            const bdoId = formData.bdoDetails.bdoId;
            console.log('🔍 Loading device info for BDO:', bdoId);

            // Find current device mapping for this BDO
            const deviceQuery = query(
                collection(db, 'requestsV2'),
                where('bdoId', '==', bdoId),
                where('type', '==', 'NEW_MAPPING'),
                where('status', 'in', ['OPS_APPROVED', 'COMPLETED'])
            );

            const deviceSnapshot = await getDocs(deviceQuery);
            
            if (!deviceSnapshot.empty) {
                // Get the most recent approved mapping
                const allRequests = deviceSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                const latestRequest = allRequests.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                })[0];

                const deviceInfo = {
                    imei: latestRequest.deviceDetails?.imei,
                    shopName: latestRequest.deviceDetails?.shopName,
                    city: latestRequest.deviceDetails?.city,
                    requestId: latestRequest.id
                };

                setOtpChangeData(prev => ({
                    ...prev,
                    currentOTP: formData.bdoDetails.otpMobileNumber,
                    deviceInfo
                }));

                console.log('✅ Found device mapping:', deviceInfo);
            } else {
                console.log('❌ No device mapping found for BDO');
                setOtpChangeData(prev => ({
                    ...prev,
                    currentOTP: formData.bdoDetails.otpMobileNumber,
                    deviceInfo: null
                }));
            }
        } catch (error) {
            console.error('Error loading BDO device info:', error);
        }
    }, [formData.bdoDetails, requestType, db]);

    /**
     * Check if new OTP number is globally unique
     */
    const checkOTPAvailability = useCallback(async (otpNumber) => {
        if (!otpNumber || otpNumber.length < 12) {
            setOtpValidation({ isChecking: false, isValid: false, message: '' });
            return;
        }

        setOtpValidation({ isChecking: true, isValid: false, message: 'Checking OTP availability...' });

        try {
            // Check in bdoAccounts collection
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('otpMobileNumber', '==', otpNumber)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);
            
            if (!bdoSnapshot.empty) {
                const existingBDO = bdoSnapshot.docs[0].data();
                setOtpValidation({
                    isChecking: false,
                    isValid: false,
                    message: `OTP number already used by: ${existingBDO.name} (${existingBDO.bdoId})`
                });
                return;
            }

            // Check in requests collection for pending OTP changes
            const requestQuery = query(
                collection(db, 'requestsV2'),
                where('requestType', '==', 'OTP_CHANGE'),
                where('newOTP', '==', otpNumber),
                where('status', 'in', ['pending', 'approved'])
            );

            const requestSnapshot = await getDocs(requestQuery);
            
            if (!requestSnapshot.empty) {
                setOtpValidation({
                    isChecking: false,
                    isValid: false,
                    message: 'OTP number already requested for change by another BDO'
                });
                return;
            }

            setOtpValidation({
                isChecking: false,
                isValid: true,
                message: 'OTP number available'
            });

        } catch (error) {
            console.error('Error checking OTP availability:', error);
            setOtpValidation({
                isChecking: false,
                isValid: false,
                message: 'Error checking OTP availability'
            });
        }
    }, [db]);

    // Debounced IMEI validation
    useEffect(() => {
        const timer = setTimeout(() => {
            if (deviceData.imei && deviceData.imei.length === 15 && requestType !== 'OTP_CHANGE') {
                checkIMEIAvailability(deviceData.imei);
            }
        }, 300); // Reduced timeout for faster validation

        return () => clearTimeout(timer);
    }, [deviceData.imei, checkIMEIAvailability, requestType]);

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
     * Validate form data
     */
    const validateForm = () => {
        const isValidIMEI = deviceData.imei && 
                           deviceData.imei.length === 15 && 
                           /^\d{15}$/.test(deviceData.imei) &&
                           imeiValidation.isAvailable === true;
        const isValidShop = deviceData.shopName && deviceData.streetAddress && deviceData.city && deviceData.premiseRelationship;
        
        setIsValid(isValidIMEI && isValidShop);
    };

    /**
     * Validate OTP change form
     */
    const validateOTPForm = () => {
        const isValidNewOTP = otpChangeData.newOTP && 
                             otpChangeData.newOTP.length === 12 && 
                             otpChangeData.newOTP.startsWith('923') &&
                             otpValidation.isValid === true;
        const isValidReason = otpChangeData.changeReason && otpChangeData.changeReason.trim().length >= 10;
        const isDifferentOTP = otpChangeData.newOTP !== otpChangeData.currentOTP;
        
        setIsValid(isValidNewOTP && isValidReason && isDifferentOTP);
    };

    /**
     * Validate de-mapping form
     */
    const validateDemappingForm = () => {
        const isValidReason = demappingData.demappingReason && demappingData.demappingReason.trim().length >= 10;
        const isConfirmed = demappingData.confirmationText === 'CONFIRM DE-MAPPING';
        const hasDeviceInfo = demappingData.deviceInfo && demappingData.deviceInfo.imei;
        
        setIsValid(isValidReason && isConfirmed && hasDeviceInfo);
    };

    /**
     * Load current BDO mapping information for de-mapping
     */
    const loadCurrentBDOMapping = useCallback(async () => {
        if (!formData.bdoDetails || requestType !== 'DE_MAPPING') return;

        try {
            const bdoId = formData.bdoDetails.bdoId;
            console.log('🔍 Loading current mapping for BDO:', bdoId);

            // Find current active device mapping for this BDO
            const mappingQuery = query(
                collection(db, 'requestsV2'),
                where('bdoDetails.bdoId', '==', bdoId),
                where('requestType', 'in', ['NEW_MAPPING', 'TRANSFER']),
                where('status', 'in', ['approved', 'completed'])
            );

            const mappingSnapshot = await getDocs(mappingQuery);
            
            if (!mappingSnapshot.empty) {
                // Get the most recent active mapping
                const allMappings = mappingSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                const activeMappings = allMappings.filter(mapping => {
                    // Check if this mapping hasn't been de-mapped yet
                    return mapping.status === 'completed' || mapping.status === 'approved';
                });

                if (activeMappings.length > 0) {
                    const latestMapping = activeMappings.sort((a, b) => {
                        const aTime = a.createdAt?.toMillis?.() || 0;
                        const bTime = b.createdAt?.toMillis?.() || 0;
                        return bTime - aTime;
                    })[0];

                    const deviceInfo = {
                        imei: latestMapping.deviceDetails?.imei,
                        shopName: latestMapping.deviceDetails?.shopName,
                        city: latestMapping.deviceDetails?.city,
                        streetAddress: latestMapping.deviceDetails?.streetAddress,
                        coordinates: latestMapping.deviceDetails?.coordinates,
                        requestId: latestMapping.id,
                        mappedDate: latestMapping.createdAt?.toDate?.().toLocaleDateString() || 'Unknown'
                    };

                    setDemappingData(prev => ({
                        ...prev,
                        deviceInfo,
                        currentMapping: latestMapping
                    }));

                    console.log('✅ Found active device mapping:', deviceInfo);
                } else {
                    console.log('❌ No active device mapping found for BDO');
                    setDemappingData(prev => ({
                        ...prev,
                        deviceInfo: null,
                        currentMapping: null
                    }));
                }
            } else {
                console.log('❌ No device mapping found for BDO');
                setDemappingData(prev => ({
                    ...prev,
                    deviceInfo: null,
                    currentMapping: null
                }));
            }
        } catch (error) {
            console.error('Error loading BDO mapping info:', error);
        }
    }, [formData.bdoDetails, requestType, db]);

    /**
     * Handle de-mapping input changes
     */
    const handleDemappingInputChange = (field, value) => {
        const updatedData = { ...demappingData, [field]: value };
        setDemappingData(updatedData);
        
        // Update step data immediately
        console.log('🔧 Updating de-mapping data:', updatedData);
        updateStepData('demapping_details', updatedData);
    };

    /**
     * Handle OTP change input
     */
    const handleOTPInputChange = (field, value) => {
        const updatedData = { ...otpChangeData, [field]: value };
        setOtpChangeData(updatedData);
        
        // Update step data immediately
        console.log('🔧 Updating OTP change data:', updatedData);
        updateStepData('otp_change_details', updatedData);
    };

    /**
     * Handle input changes with coordinate validation
     */
    const handleInputChange = (field, value) => {
        let updatedData = { ...deviceData };
        
        if (field === 'coordinates') {
            // Ensure coordinates object always has lat and lng properties
            const currentCoords = deviceData.coordinates || { lat: '', lng: '' };
            updatedData = { 
                ...deviceData, 
                coordinates: { 
                    lat: value.lat !== undefined ? value.lat : currentCoords.lat,
                    lng: value.lng !== undefined ? value.lng : currentCoords.lng
                }
            };
            
            // Validate coordinates in real-time
            const latError = validateCoordinate(updatedData.coordinates.lat, 'lat');
            const lngError = validateCoordinate(updatedData.coordinates.lng, 'lng');
            setCoordinateErrors({ lat: latError, lng: lngError });
        } else {
            updatedData[field] = value;
        }
        
        setDeviceData(updatedData);
        updateStepData('device_details', updatedData);
    };

    /**
     * Handle city selection
     */
    const handleCitySelect = (city) => {
        handleInputChange('city', city);
        setCityDropdownOpen(false);
        setCitySearchTerm('');
        setShowManualCityInput(false);
    };

    /**
     * Handle manual city input
     */
    const handleManualCityToggle = () => {
        setShowManualCityInput(true);
        setCityDropdownOpen(false);
        handleInputChange('city', '');
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
            const fileName = `shop-images/${user.franchiseCode}/${timestamp}_${type}.jpg`;
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
     * Handle image uploads
     */
    const handleImageUploads = async () => {
        if (!imageFiles.inside && !imageFiles.outside) return deviceData;

        setUploading(true);
        try {
            const uploadPromises = [];
            const updatedData = { ...deviceData };

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
     * Get current location with 8 decimal precision
     */
    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords = {
                        lat: position.coords.latitude.toFixed(8),
                        lng: position.coords.longitude.toFixed(8)
                    };
                    handleInputChange('coordinates', coords);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    alert('Unable to get current location. Please ensure location services are enabled.');
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    };

    /**
     * Handle next step with image uploads
     */
    const handleNext = async () => {
        if (!isValid) return;
        
        if (requestType === 'OTP_CHANGE') {
            // For OTP change, save the OTP change data
            console.log('🔧 Saving OTP change data:', otpChangeData);
            updateStepData('otp_change_details', otpChangeData);
            onNext();
        } else if (requestType === 'DE_MAPPING') {
            // For de-mapping, save the de-mapping data
            console.log('🔧 Saving de-mapping data:', demappingData);
            updateStepData('demapping_details', demappingData);
            onNext();
        } else {
            // Additional validation for IMEI availability for device operations
            if (imeiValidation.isAvailable !== true) {
                alert('Please ensure IMEI is valid and available before proceeding.');
                return;
            }

            try {
                const finalData = await handleImageUploads();
                updateStepData('device_details', finalData);
                onNext();
            } catch (error) {
                console.error('Error processing device details:', error);
            }
        }
    };

    return (
        <div className="space-y-6">
            {requestType === 'OTP_CHANGE' ? (
                // OTP Change UI
                <>
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            OTP Number Change Details
                        </h3>
                        <p className="text-sm text-gray-600">
                            Update the OTP verification phone number for {formData.bdoDetails?.name}
                        </p>
                    </div>

                    {/* Current BDO and Device Information */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-3">Current Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">BDO/Retailer</label>
                                <p className="text-sm text-gray-900">{formData.bdoDetails?.name}</p>
                                <p className="text-xs text-gray-500">{formData.bdoDetails?.bdoId}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Current OTP Number</label>
                                <p className="text-sm text-gray-900">{otpChangeData.currentOTP}</p>
                            </div>
                            {otpChangeData.deviceInfo && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Device IMEI</label>
                                        <p className="text-sm text-gray-900">{otpChangeData.deviceInfo.imei}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Shop Name</label>
                                        <p className="text-sm text-gray-900">{otpChangeData.deviceInfo.shopName}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* New OTP Number */}
                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900 border-b pb-2">New OTP Details</h4>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                New OTP Number *
                            </label>
                            <input
                                type="tel"
                                value={otpChangeData.newOTP}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, ''); // Only digits
                                    if (value.length <= 12) {
                                        handleOTPInputChange('newOTP', value);
                                    }
                                }}
                                placeholder="923001234567"
                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    otpValidation.isChecking ? 'border-yellow-300' :
                                    otpValidation.isValid === true ? 'border-green-300' :
                                    otpValidation.isValid === false && otpChangeData.newOTP ? 'border-red-300' :
                                    'border-gray-300'
                                }`}
                            />
                            {otpValidation.message && (
                                <p className={`text-xs mt-1 ${
                                    otpValidation.isChecking ? 'text-yellow-600' :
                                    otpValidation.isValid ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {otpValidation.isChecking && (
                                        <svg className="animate-spin inline w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {otpValidation.message}
                                </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Must start with 923 and be exactly 12 digits long
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Reason for Change *
                            </label>
                            <textarea
                                value={otpChangeData.changeReason}
                                onChange={(e) => handleOTPInputChange('changeReason', e.target.value)}
                                placeholder="Please provide a detailed reason for changing the OTP number (minimum 10 characters)..."
                                rows="4"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {otpChangeData.changeReason.length}/500 characters (minimum 10 required)
                            </p>
                        </div>

                        {/* Warning if same OTP */}
                        {otpChangeData.newOTP === otpChangeData.currentOTP && otpChangeData.newOTP && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                                <div className="flex">
                                    <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-sm text-yellow-700">
                                        New OTP number must be different from current OTP number
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : requestType === 'DE_MAPPING' ? (
                // De-mapping UI
                <>
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            Device De-mapping Details
                        </h3>
                        <p className="text-sm text-gray-600">
                            Release device mapping and deactivate assignment for {formData.bdoDetails?.name}
                        </p>
                    </div>

                    {/* Current BDO and Device Information */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-3">Current Active Mapping</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">BDO/Retailer</label>
                                <p className="text-sm text-gray-900">{formData.bdoDetails?.name}</p>
                                <p className="text-xs text-gray-500">{formData.bdoDetails?.bdoId}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Handler Type</label>
                                <p className="text-sm text-gray-900">{formData.bdoDetails?.handlerType}</p>
                            </div>
                            {demappingData.deviceInfo ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Device IMEI</label>
                                        <p className="text-sm text-gray-900 font-mono">{demappingData.deviceInfo.imei}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Shop Name</label>
                                        <p className="text-sm text-gray-900">{demappingData.deviceInfo.shopName}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Location</label>
                                        <p className="text-sm text-gray-900">{demappingData.deviceInfo.city}</p>
                                        <p className="text-xs text-gray-500">{demappingData.deviceInfo.streetAddress}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Mapped Date</label>
                                        <p className="text-sm text-gray-900">{demappingData.deviceInfo.mappedDate}</p>
                                    </div>
                                </>
                            ) : (
                                <div className="col-span-2">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                                        <div className="flex">
                                            <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                            <p className="text-sm text-yellow-700">
                                                No active device mapping found for this BDO/Retailer. Please ensure the selected BDO has an active device assignment.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* De-mapping Reason */}
                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900 border-b pb-2">De-mapping Details</h4>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Reason for De-mapping *
                            </label>
                            <textarea
                                value={demappingData.demappingReason}
                                onChange={(e) => handleDemappingInputChange('demappingReason', e.target.value)}
                                placeholder="Please provide a detailed reason for de-mapping this device (minimum 10 characters)..."
                                rows="4"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {demappingData.demappingReason.length}/500 characters (minimum 10 required)
                            </p>
                        </div>

                        {/* Impact Warning */}
                        {demappingData.deviceInfo && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-4">
                                <div className="flex">
                                    <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <div>
                                        <h4 className="text-sm font-medium text-red-800">⚠️ Impact Warning</h4>
                                        <div className="text-sm text-red-700 mt-1">
                                            <p>Device <strong>{demappingData.deviceInfo.imei}</strong> will be released and become available for reassignment.</p>
                                            <p>BDO/Retailer <strong>{formData.bdoDetails?.name}</strong> will become available for new device assignment.</p>
                                            <p className="font-medium mt-2">This action cannot be undone.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Confirmation Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Confirmation *
                            </label>
                            <p className="text-sm text-gray-600 mb-2">
                                Please type <strong>"CONFIRM DE-MAPPING"</strong> to confirm this action:
                            </p>
                            <input
                                type="text"
                                value={demappingData.confirmationText}
                                onChange={(e) => handleDemappingInputChange('confirmationText', e.target.value)}
                                placeholder="Type: CONFIRM DE-MAPPING"
                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    demappingData.confirmationText === 'CONFIRM DE-MAPPING' ? 'border-green-300' :
                                    demappingData.confirmationText.length > 0 ? 'border-red-300' :
                                    'border-gray-300'
                                }`}
                            />
                            {demappingData.confirmationText && demappingData.confirmationText !== 'CONFIRM DE-MAPPING' && (
                                <p className="text-xs text-red-600 mt-1">
                                    Please type exactly: "CONFIRM DE-MAPPING"
                                </p>
                            )}
                            {demappingData.confirmationText === 'CONFIRM DE-MAPPING' && (
                                <p className="text-xs text-green-600 mt-1">
                                    ✓ Confirmation verified
                                </p>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                // Regular Device Details UI (NEW_MAPPING, TRANSFER, etc.)
                <>
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            Device & Shop Details
                        </h3>
                        <p className="text-sm text-gray-600">
                            Enter device information and shop details
                        </p>
                    </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Device Information */}
                <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 border-b pb-2">Device Information</h4>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Device IMEI *
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={deviceData.imei}
                                onChange={(e) => {
                                    // Only allow digits and limit to 15 characters
                                    const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                                    handleInputChange('imei', value);
                                }}
                                placeholder="Enter 15-digit IMEI number (numbers only)"
                                maxLength={15}
                                pattern="[0-9]{15}"
                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                                    imeiValidation.isAvailable === false 
                                        ? 'border-red-500 focus:ring-red-500' 
                                        : imeiValidation.isAvailable === true
                                        ? 'border-green-500 focus:ring-green-500'
                                        : 'border-gray-300 focus:ring-blue-500'
                                }`}
                            />
                            {imeiValidation.checking && (
                                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                </div>
                            )}
                        </div>
                        
                        {/* IMEI validation messages */}
                        <div className="mt-1 space-y-1">
                            {deviceData.imei && deviceData.imei.length < 15 && !imeiValidation.checking && (
                                <p className="text-sm text-red-600">
                                    IMEI must be exactly 15 digits ({deviceData.imei.length}/15)
                                </p>
                            )}
                            {deviceData.imei && !/^\d+$/.test(deviceData.imei) && (
                                <p className="text-sm text-red-600">
                                    IMEI must contain only numbers (no letters or special characters)
                                </p>
                            )}
                            {imeiValidation.message && deviceData.imei.length === 15 && (
                                <p className={`text-sm ${
                                    imeiValidation.isAvailable === false 
                                        ? 'text-red-600' 
                                        : imeiValidation.isAvailable === true
                                        ? 'text-green-600'
                                        : 'text-blue-600'
                                }`}>
                                    {imeiValidation.isAvailable === false && (
                                        <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    )}
                                    {imeiValidation.isAvailable === true && (
                                        <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {imeiValidation.message}
                                </p>
                            )}
                        </div>
                        
                        {/* Helper text */}
                        <p className="text-xs text-gray-500 mt-1">
                            • Must be exactly 15 digits
                            • Numbers only (no letters or symbols)
                            • Will be checked for existing mappings
                        </p>
                        
                        {/* Additional warning for mapped IMEI */}
                        {imeiValidation.isAvailable === false && deviceData.imei.length === 15 && (
                            <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-3">
                                <div className="flex">
                                    <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <div>
                                        <h4 className="text-sm font-medium text-red-800">IMEI Already Mapped</h4>
                                        <p className="text-sm text-red-700 mt-1">
                                            This IMEI is already assigned to another BDO/Retailer. If you need to transfer this device, please use the "Transfer Device" request type instead.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Shop Information */}
                <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 border-b pb-2">Shop Information</h4>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Shop Name *
                        </label>
                        <input
                            type="text"
                            value={deviceData.shopName}
                            onChange={(e) => handleInputChange('shopName', e.target.value)}
                            placeholder="Enter shop name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Street Address *
                        </label>
                        <textarea
                            value={deviceData.streetAddress}
                            onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                            placeholder="Enter complete street address"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            City *
                        </label>
                        {!showManualCityInput ? (
                            <div className="relative city-dropdown-container">
                                <input
                                    type="text"
                                    value={deviceData.city}
                                    onChange={(e) => {
                                        setCitySearchTerm(e.target.value);
                                        handleInputChange('city', e.target.value);
                                        setCityDropdownOpen(true);
                                    }}
                                    onFocus={() => setCityDropdownOpen(true)}
                                    placeholder="Search for a city..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                
                                {cityDropdownOpen && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                        {filteredCities.length > 0 ? (
                                            <>
                                                {filteredCities.map((city) => (
                                                    <button
                                                        key={city}
                                                        type="button"
                                                        onClick={() => handleCitySelect(city)}
                                                        className="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                                                    >
                                                        {city}
                                                    </button>
                                                ))}
                                                <div className="border-t border-gray-200">
                                                    <button
                                                        type="button"
                                                        onClick={handleManualCityToggle}
                                                        className="w-full text-left px-3 py-2 text-blue-600 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none text-sm"
                                                    >
                                                        + Enter city manually
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="px-3 py-2">
                                                <p className="text-gray-500 text-sm">No cities found</p>
                                                <button
                                                    type="button"
                                                    onClick={handleManualCityToggle}
                                                    className="text-blue-600 hover:text-blue-700 text-sm mt-1"
                                                >
                                                    Enter city manually
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={deviceData.city}
                                    onChange={(e) => handleInputChange('city', e.target.value)}
                                    placeholder="Enter city name manually"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowManualCityInput(false);
                                        handleInputChange('city', '');
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-700"
                                >
                                    ← Back to city list
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Premise Relationship *
                        </label>
                        <select
                            value={deviceData.premiseRelationship}
                            onChange={(e) => handleInputChange('premiseRelationship', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Select relationship</option>
                            <option value="Owner">Owner</option>
                            <option value="Tenant">Tenant</option>
                            <option value="Partner">Partner</option>
                            <option value="Family Member">Family Member</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Location */}
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
                            value={deviceData.coordinates?.lat || ''}
                            onChange={(e) => handleInputChange('coordinates', { 
                                lat: e.target.value,
                                lng: deviceData.coordinates?.lng || ''
                            })}
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
                            value={deviceData.coordinates?.lng || ''}
                            onChange={(e) => handleInputChange('coordinates', { 
                                lat: deviceData.coordinates?.lat || '',
                                lng: e.target.value 
                            })}
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
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
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
                </>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onPrev}
                    className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                    Previous
                </button>
                <button
                    onClick={handleNext}
                    disabled={!isValid || uploading}
                    className={`px-6 py-2 rounded-md font-medium transition-colors ${
                        isValid && !uploading
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
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
                        'Continue'
                    )}
                </button>
            </div>
        </div>
    );
}

export default DeviceDetailsStep;
