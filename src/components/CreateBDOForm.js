import React, { useState, useRef, useEffect } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { BDOIdService } from '../utils/bdoIdService';
import toast from 'react-hot-toast';

/**
 * Create BDO/Retailer Form Component
 * Implements the separate BDO creation flow with atomic ID generation
 */
function CreateBDOForm({ user, appServices, app, db, onSuccess, onCancel }) {
    const [formData, setFormData] = useState({
        name: '',
        handlerType: 'BDO',
        cnic: '',
        otpMobileNumber: '923', // Pre-filled with 923
        cnicFrontImage: null,
        cnicBackImage: null
    });

    const [validation, setValidation] = useState({});
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ front: 0, back: 0 });
    const [previewUrls, setPreviewUrls] = useState({ front: null, back: null });
    const [generatedBDOId, setGeneratedBDOId] = useState(null);
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [duplicateState, setDuplicateState] = useState({
        cnicExists: false,
        cnicChecked: false,
        cnicChecking: false,
        otpExists: false,
        otpChecked: false,
        otpChecking: false
    });

    const frontImageRef = useRef(null);
    const backImageRef = useRef(null);
    const otpInputRef = useRef(null); // Add ref for OTP input
    const bdoIdService = useRef(new BDOIdService(app));

    // Validation patterns
    const CNIC_PATTERN = /^\d{5}-\d{7}-\d{1}$/;
    const MOBILE_PATTERN = /^923\d{9}$/; // Must start with 923 followed by 9 digits

    // Debug user object on mount
    useEffect(() => {
        console.log('🔍 CreateBDOForm mounted with user:', user);
        console.log('🔍 User franchiseCode:', user?.franchiseCode);
        console.log('🔍 User object keys:', user ? Object.keys(user) : 'No user');
        
        // Show detailed debugging for missing franchiseCode
        if (user && !user.franchiseCode) {
            console.error('❌ User object is missing franchiseCode:', {
                user,
                userType: typeof user,
                userKeys: Object.keys(user),
                hasUid: !!user.uid,
                hasEmail: !!user.email,
                hasFranchiseCode: !!user.franchiseCode,
                franchiseCodeValue: user.franchiseCode,
                franchiseCodeType: typeof user.franchiseCode
            });
        }
    }, [user]);

    /**
     * Check if CNIC already exists
     */
    const checkCNICExists = async (cnic) => {
        if (!cnic || !CNIC_PATTERN.test(cnic)) return false;
        
        try {
            setDuplicateState(prev => ({ ...prev, cnicChecking: true }));
            
            const q = query(
                collection(db, 'bdoAccounts'),
                where('cnic', '==', cnic)
            );
            const querySnapshot = await getDocs(q);
            const exists = !querySnapshot.empty;
            
            setDuplicateState(prev => ({
                ...prev,
                cnicExists: exists,
                cnicChecked: true,
                cnicChecking: false
            }));
            
            return exists;
        } catch (error) {
            console.error('Error checking CNIC:', error);
            setDuplicateState(prev => ({ ...prev, cnicChecking: false }));
            return false;
        }
    };

    /**
     * Check if OTP number already exists
     */
    const checkOTPExists = async (otpNumber) => {
        if (!otpNumber || !MOBILE_PATTERN.test(otpNumber)) return false;
        
        try {
            setDuplicateState(prev => ({ ...prev, otpChecking: true }));
            
            const q = query(
                collection(db, 'bdoAccounts'),
                where('otpMobileNumber', '==', otpNumber)
            );
            const querySnapshot = await getDocs(q);
            const exists = !querySnapshot.empty;
            
            setDuplicateState(prev => ({
                ...prev,
                otpExists: exists,
                otpChecked: true,
                otpChecking: false
            }));
            
            return exists;
        } catch (error) {
            console.error('Error checking OTP number:', error);
            setDuplicateState(prev => ({ ...prev, otpChecking: false }));
            return false;
        }
    };

    // Auto-generate BDO ID on component mount
    useEffect(() => {
        const generateInitialBDOId = async () => {
            const effectiveFranchiseCode = user?.franchiseCode || (user?.email?.includes('testing') ? 'TEST001' : null);
            
            if (effectiveFranchiseCode && !generatedBDOId) {
                try {
                    const preview = await bdoIdService.current.getNextNumbersPreview(effectiveFranchiseCode);
                    setGeneratedBDOId(preview.nextBDOId);
                } catch (error) {
                    console.error('Error generating initial BDO ID preview:', error);
                }
            }
        };

        generateInitialBDOId();
    }, [user?.franchiseCode, user?.email, generatedBDOId]);

    /**
     * Validate individual fields with duplicate checks
     */
    const validateField = async (name, value) => {
        const errors = {};

        switch (name) {
            case 'name':
                if (!value || value.trim().length < 2) {
                    errors.name = 'Name must be at least 2 characters long';
                } else if (value.length > 50) {
                    errors.name = 'Name must be less than 50 characters';
                }
                break;

            case 'handlerType':
                if (!['BDO', 'Retailer'].includes(value)) {
                    errors.handlerType = 'Handler type must be either BDO or Retailer';
                }
                break;

            case 'cnic':
                if (!value) {
                    errors.cnic = 'CNIC is required';
                } else if (!CNIC_PATTERN.test(value)) {
                    errors.cnic = 'CNIC must be in format: 12345-1234567-1';
                } else {
                    // Check for duplicates
                    const exists = await checkCNICExists(value);
                    if (exists) {
                        errors.cnic = 'This CNIC is already registered';
                    }
                }
                break;

            case 'otpMobileNumber':
                if (!value) {
                    errors.otpMobileNumber = 'OTP Mobile Number is required';
                } else if (!MOBILE_PATTERN.test(value)) {
                    errors.otpMobileNumber = 'Mobile number must start with 923 and be 12 digits total (923xxxxxxxxx)';
                } else {
                    // Check for duplicates
                    const exists = await checkOTPExists(value);
                    if (exists) {
                        errors.otpMobileNumber = 'This mobile number is already registered';
                    }
                }
                break;
        }

        return errors;
    };

    /**
     * Clear duplicate error when user starts typing
     */
    const clearDuplicateError = (field) => {
        setValidation(prev => {
            const newValidation = { ...prev };
            delete newValidation[field];
            return newValidation;
        });
    };
    const handleInputChange = async (e) => {
        const { name, value } = e.target;
        let processedValue = value;

        // Clear any existing duplicate errors immediately when user starts typing
        if (name === 'cnic' || name === 'otpMobileNumber') {
            clearDuplicateError(name);
        }

        // Format CNIC with dashes
        if (name === 'cnic') {
            processedValue = value.replace(/\D/g, '').replace(/(\d{5})(\d{7})(\d{1})/, '$1-$2-$3');
            if (processedValue.length > 15) {
                processedValue = processedValue.substring(0, 15);
            }
        }

        // Format mobile number with pre-filled 923 prefix
        if (name === 'otpMobileNumber') {
            // Remove all non-digits first
            let rawNumber = value.replace(/\D/g, '');
            
            // Always ensure it starts with 923
            if (!rawNumber.startsWith('923')) {
                // If user somehow cleared the prefix, restore it
                if (rawNumber.length === 0) {
                    processedValue = '923';
                } else {
                    // Extract user digits after 923 prefix
                    let userDigits = rawNumber.startsWith('92') ? rawNumber.substring(2) : rawNumber;
                    if (userDigits.startsWith('3')) {
                        userDigits = userDigits.substring(1);
                    }
                    processedValue = '923' + userDigits;
                }
            } else {
                processedValue = rawNumber;
            }
            
            // Limit to 12 digits total (923 + 9 user digits)
            if (processedValue.length > 12) {
                processedValue = processedValue.substring(0, 12);
            }
            
            // Always maintain at least the 923 prefix
            if (processedValue.length < 3) {
                processedValue = '923';
            }
        }

        setFormData(prev => ({
            ...prev,
            [name]: processedValue
        }));

        // Validate field if it has a value
        if (processedValue && (name === 'cnic' || name === 'otpMobileNumber')) {
            // For CNIC, only validate when complete
            if (name === 'cnic' && processedValue.length === 15) {
                const fieldErrors = await validateField(name, processedValue);
                setValidation(prev => ({
                    ...prev,
                    ...fieldErrors
                }));
            }
            // For mobile, validate when complete
            else if (name === 'otpMobileNumber' && processedValue.length === 12) {
                const fieldErrors = await validateField(name, processedValue);
                setValidation(prev => ({
                    ...prev,
                    ...fieldErrors
                }));
            }
        } else if (processedValue) {
            // For other fields (like name), validate immediately
            const fieldErrors = await validateField(name, processedValue);
            setValidation(prev => {
                const newValidation = { ...prev };
                // Clear any existing error for this field first
                delete newValidation[name];
                // Only add error if there is one
                if (Object.keys(fieldErrors).length > 0) {
                    return { ...newValidation, ...fieldErrors };
                }
                return newValidation;
            });
        } else {
            // Clear validation for empty fields
            setValidation(prev => {
                const newValidation = { ...prev };
                delete newValidation[name];
                return newValidation;
            });
        }

        // Trigger duplicate check when typing
        if (name === 'cnic' && CNIC_PATTERN.test(processedValue)) {
            checkCNICExists(processedValue);
        } else if (name === 'otpMobileNumber' && MOBILE_PATTERN.test(processedValue)) {
            checkOTPExists(processedValue);
        }
    };

    /**
     * Handle image file selection
     */
    const handleImageChange = (e, side) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image size must be less than 5MB');
            return;
        }

        // Create preview URL
        const previewUrl = URL.createObjectURL(file);
        setPreviewUrls(prev => ({
            ...prev,
            [side]: previewUrl
        }));

        // Update form data
        setFormData(prev => ({
            ...prev,
            [side === 'front' ? 'cnicFrontImage' : 'cnicBackImage']: file
        }));
    };

    /**
     * Upload image to Firebase Storage
     */
    const uploadImage = async (file, path) => {
        const storage = getStorage(app);
        const imageRef = ref(storage, path);
        const snapshot = await uploadBytes(imageRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    /**
     * Validate entire form
     */
    const validateForm = async () => {
        const errors = {};

        // Validate all fields
        for (const [field, value] of Object.entries(formData)) {
            if (field !== 'cnicFrontImage' && field !== 'cnicBackImage') {
                const fieldErrors = await validateField(field, value);
                Object.assign(errors, fieldErrors);
            }
        }

        // Validate images
        if (!formData.cnicFrontImage) {
            errors.cnicFrontImage = 'CNIC front image is required';
        }
        if (!formData.cnicBackImage) {
            errors.cnicBackImage = 'CNIC back image is required';
        }

        setValidation(errors);
        return Object.keys(errors).length === 0;
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (loading) return;

        // Validate form
        const isValid = await validateForm();
        if (!isValid) {
            toast.error('Please fix the validation errors');
            return;
        }

        // Check for duplicates one more time
        if (duplicateState.cnicExists || duplicateState.otpExists) {
            toast.error('Cannot create BDO with duplicate CNIC or mobile number');
            return;
        }

        setLoading(true);

        try {
            console.log('Starting BDO creation process...');
            console.log('User object in CreateBDOForm:', user);
            console.log('User franchiseCode:', user?.franchiseCode);

            // Validate franchiseCode before proceeding
            let franchiseCode = user?.franchiseCode;
            
            // Fallback for testing users if franchiseCode is missing
            if (!franchiseCode && user?.email?.includes('testing')) {
                console.log('🔧 Applying fallback franchiseCode for testing user');
                franchiseCode = 'TEST001';
            }
            
            if (!franchiseCode) {
                console.error('❌ Missing franchiseCode in user object:', {
                    user,
                    franchiseCode: user?.franchiseCode,
                    userKeys: user ? Object.keys(user) : 'No user object',
                    email: user?.email,
                    fallbackApplied: false
                });
                throw new Error('Valid franchiseCode is required. Please ensure your user profile is properly set up.');
            }
            
            console.log('✅ Using franchiseCode:', franchiseCode);
            console.log('🔧 About to call generateUniqueBDOId with franchiseCode:', franchiseCode);

            // Generate final BDO ID - Fixed: Pass franchiseCode as object property
            const bdoIdResult = await bdoIdService.current.generateUniqueBDOId(franchiseCode);
            const finalBDOId = bdoIdResult.bdoId;

            console.log('Generated BDO ID:', finalBDOId);

            // Upload images
            const timestamp = Date.now();
            const frontImagePath = `cnic-images/${franchiseCode}/${finalBDOId}_front_${timestamp}.jpg`;
            const backImagePath = `cnic-images/${franchiseCode}/${finalBDOId}_back_${timestamp}.jpg`;

            console.log('Uploading images...');
            const [frontImageUrl, backImageUrl] = await Promise.all([
                uploadImage(formData.cnicFrontImage, frontImagePath),
                uploadImage(formData.cnicBackImage, backImagePath)
            ]);

            console.log('Images uploaded successfully');

            // Debug user object properties for franchiseName
            console.log('🔍 User object properties for franchiseName:', {
                franchiseName: user.franchiseName,
                displayName: user.displayName,
                name: user.name,
                email: user.email,
                allUserKeys: user ? Object.keys(user) : 'No user'
            });

            // Prepare BDO document
            const bdoDoc = {
                bdoId: finalBDOId,
                name: formData.name.trim(),
                handlerType: formData.handlerType,
                cnic: formData.cnic,
                otpMobileNumber: formData.otpMobileNumber,
                cnicFrontImageUrl: frontImageUrl,
                cnicBackImageUrl: backImageUrl,
                franchiseCode: franchiseCode,
                franchiseName: user.franchiseName || user.displayName || user.name || `Franchise ${franchiseCode}`,
                createdAt: serverTimestamp(),
                createdBy: user.email,
                status: 'Pending Approval',
                assignedTo: 'Sales Team',
                approvalMode: 'MANUAL_PENDING',
                metadata: {
                    version: '2.0',
                    source: 'web-app',
                    userAgent: navigator.userAgent
                }
            };

            console.log('📋 Final BDO document to save:', bdoDoc);
            console.log('Saving BDO to Firestore...');

            // Save to Firestore
            const docRef = await addDoc(collection(db, 'bdoAccounts'), bdoDoc);

            console.log('BDO saved successfully with ID:', docRef.id);

            // Success feedback
            toast.success(`BDO created successfully! BDO ID: ${finalBDOId}`);

            // Reset form
            setFormData({
                name: '',
                handlerType: 'BDO',
                cnic: '',
                otpMobileNumber: '923', // Keep 923 prefix on reset
                cnicFrontImage: null,
                cnicBackImage: null
            });
            setValidation({});
            setPreviewUrls({ front: null, back: null });
            setGeneratedBDOId(null);
            setDuplicateState({
                cnicExists: false,
                cnicChecked: false,
                cnicChecking: false,
                otpExists: false,
                otpChecked: false,
                otpChecking: false
            });

            // Trigger success callback
            if (onSuccess) {
                onSuccess({
                    bdoId: finalBDOId,
                    name: formData.name,
                    docId: docRef.id,
                    data: {
                        handlerType: formData.handlerType,
                        bdoId: finalBDOId,
                        name: formData.name,
                        cnic: formData.cnic,
                        otpMobileNumber: formData.otpMobileNumber,
                        franchiseCode: franchiseCode
                    }
                });
            }

        } catch (error) {
            console.error('Error creating BDO:', error);
            toast.error(`Failed to create BDO: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm">
            {/* Display warning if user is missing franchiseCode */}
            {user && !user.franchiseCode && !user.email?.includes('testing') && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">
                                User Profile Incomplete
                            </h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>
                                    Your user profile is missing the required franchise code. 
                                    Please contact your administrator to complete your profile setup.
                                </p>
                                <p className="mt-2">
                                    <strong>Debug Info:</strong> User ID: {user.uid}, Email: {user.email}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {user && !user.franchiseCode && user.email?.includes('testing') && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800">
                                Using Fallback Configuration
                            </h3>
                            <div className="mt-2 text-sm text-yellow-700">
                                <p>
                                    Testing user detected. Using fallback franchise code 'TEST001'.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Create New BDO/Retailer</h2>
                <p className="text-gray-600 mt-2">
                    Fill in the information below to create a new BDO or Retailer account.
                </p>
                {generatedBDOId && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-800">
                            <span className="font-medium">Preview BDO ID:</span> {generatedBDOId}
                        </p>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                validation.name ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Enter full name"
                        />
                        {validation.name && (
                            <p className="text-red-500 text-sm mt-1">{validation.name}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Handler Type *
                        </label>
                        <select
                            name="handlerType"
                            value={formData.handlerType}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                validation.handlerType ? 'border-red-500' : 'border-gray-300'
                            }`}
                        >
                            <option value="BDO">BDO</option>
                            <option value="Retailer">Retailer</option>
                        </select>
                        {validation.handlerType && (
                            <p className="text-red-500 text-sm mt-1">{validation.handlerType}</p>
                        )}
                    </div>
                </div>

                {/* CNIC and Mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            CNIC Number *
                        </label>
                        <input
                            type="text"
                            name="cnic"
                            value={formData.cnic}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                validation.cnic || duplicateState.cnicExists ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="12345-1234567-1"
                            maxLength="15"
                        />
                        {duplicateState.cnicChecking && (
                            <p className="text-blue-500 text-sm mt-1">Checking CNIC...</p>
                        )}
                        {duplicateState.cnicExists && (
                            <p className="text-red-500 text-sm mt-1">This CNIC is already registered</p>
                        )}
                        {validation.cnic && (
                            <p className="text-red-500 text-sm mt-1">{validation.cnic}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            OTP Mobile Number *
                        </label>
                        <input
                            ref={otpInputRef}
                            type="text"
                            name="otpMobileNumber"
                            value={formData.otpMobileNumber}
                            onChange={handleInputChange}
                            onClick={(e) => {
                                // Position cursor after 923 when user clicks
                                if (e.target.value.startsWith('923') && e.target.selectionStart < 3) {
                                    setTimeout(() => {
                                        e.target.setSelectionRange(3, 3);
                                    }, 0);
                                }
                            }}
                            onKeyDown={(e) => {
                                // Prevent backspace/delete from removing the 923 prefix
                                if ((e.key === 'Backspace' || e.key === 'Delete') && 
                                    e.target.selectionStart <= 3 && e.target.selectionEnd <= 3) {
                                    e.preventDefault();
                                }
                            }}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                validation.otpMobileNumber || duplicateState.otpExists ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="923081889927"
                            maxLength="12"
                        />
                        <div className="mt-1 space-y-1">
                            <p className="text-xs text-gray-500">
                                💡 Enter 9 digits after 923. Examples: for 03081889927 → enter 081889927
                            </p>
                            <p className="text-xs text-gray-500">
                                📱 For 03391889927 → enter 391889927
                            </p>
                            <p className="text-xs text-blue-600">
                                ℹ️ Ufone or Onic Number Please
                            </p>
                        </div>
                        {duplicateState.otpChecking && (
                            <p className="text-blue-500 text-sm mt-1">Checking mobile number...</p>
                        )}
                        {duplicateState.otpExists && (
                            <p className="text-red-500 text-sm mt-1">This mobile number is already registered</p>
                        )}
                        {validation.otpMobileNumber && (
                            <p className="text-red-500 text-sm mt-1">{validation.otpMobileNumber}</p>
                        )}
                    </div>
                </div>

                {/* CNIC Images */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            CNIC Front Image *
                        </label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {previewUrls.front ? (
                                    <img
                                        src={previewUrls.front}
                                        alt="CNIC Front"
                                        className="mx-auto h-32 w-48 object-cover rounded"
                                    />
                                ) : (
                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                                <div className="flex text-sm text-gray-600">
                                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                        <span>Upload front image</span>
                                        <input
                                            ref={frontImageRef}
                                            type="file"
                                            className="sr-only"
                                            accept="image/*"
                                            onChange={(e) => handleImageChange(e, 'front')}
                                        />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                            </div>
                        </div>
                        {validation.cnicFrontImage && (
                            <p className="text-red-500 text-sm mt-1">{validation.cnicFrontImage}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            CNIC Back Image *
                        </label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {previewUrls.back ? (
                                    <img
                                        src={previewUrls.back}
                                        alt="CNIC Back"
                                        className="mx-auto h-32 w-48 object-cover rounded"
                                    />
                                ) : (
                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                                <div className="flex text-sm text-gray-600">
                                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                        <span>Upload back image</span>
                                        <input
                                            ref={backImageRef}
                                            type="file"
                                            className="sr-only"
                                            accept="image/*"
                                            onChange={(e) => handleImageChange(e, 'back')}
                                        />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                            </div>
                        </div>
                        {validation.cnicBackImage && (
                            <p className="text-red-500 text-sm mt-1">{validation.cnicBackImage}</p>
                        )}
                    </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end space-x-4 pt-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading || duplicateState.cnicExists || duplicateState.otpExists || (!user?.franchiseCode && !user?.email?.includes('testing'))}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Creating BDO...
                            </span>
                        ) : (!user?.franchiseCode && !user?.email?.includes('testing')) ? (
                            'Profile Incomplete'
                        ) : (
                            'Create BDO'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default CreateBDOForm;
