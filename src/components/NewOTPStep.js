// --- New OTP Step Component ---
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import BDOVerificationService from '../services/bdoVerificationService';
import OTPChangeDataService from '../services/otpChangeDataService';

/**
 * Step component for entering new OTP number in OTP change request
 */
function NewOTPStep({ 
    formData, 
    updateStepData, 
    user, 
    app, 
    db, 
    onNext, 
    onPrev, 
    loading 
}) {
    const [newOtpNumber, setNewOtpNumber] = useState(formData.bdoDetails?.newOtpMobileNumber || '');
    const [confirmOtpNumber, setConfirmOtpNumber] = useState('');
    const [validationError, setValidationError] = useState('');
    const [currentData, setCurrentData] = useState(null);
    const [loadingData, setLoadingData] = useState(false);
    const [dataRefreshed, setDataRefreshed] = useState(false);
    const [checkingDuplicate, setCheckingDuplicate] = useState(false);

    const verificationService = new BDOVerificationService(db, null);
    const otpChangeService = new OTPChangeDataService(db, null);

    // Load current BDO and device data from devices collection on component mount
    useEffect(() => {
        const loadCurrentData = async () => {
            // Check both proper location and additionalInfo as fallback
            const bdoData = formData.bdoDetails || formData.additionalInfo;
            const bdoId = bdoData?.bdoId;
            
            if (!bdoId) {
                console.warn('⚠️ No BDO ID found in form data:', formData.bdoDetails);
                console.warn('⚠️ Also checked additionalInfo:', formData.additionalInfo);
                return;
            }
            
            if (dataRefreshed) {
                console.log('📋 Data already refreshed, skipping...');
                return;
            }
            
            setLoadingData(true);
            try {
                console.log('🔄 Loading current BDO/device data from devices collection for BDO:', bdoId);
                
                const result = await otpChangeService.getBDOWithDeviceData(bdoId);
                
                if (result.success) {
                    console.log('✅ Data loaded successfully:', result.data);
                    setCurrentData(result.data);
                    setDataRefreshed(true);
                    
                    // Update form data with current data from devices collection
                    const updatedBdoDetails = {
                        ...formData.bdoDetails,
                        ...result.data.bdoDetails,
                        newOtpMobileNumber: formData.bdoDetails?.newOtpMobileNumber || newOtpNumber // Preserve user input
                    };
                    
                    const updatedDeviceDetails = {
                        ...formData.deviceDetails,
                        ...result.data.deviceDetails
                    };
                    
                    console.log('📝 Updating form with consolidated data:', {
                        bdoDetails: updatedBdoDetails,
                        deviceDetails: updatedDeviceDetails
                    });
                    
                    updateStepData('bdoDetails', updatedBdoDetails);
                    updateStepData('deviceDetails', updatedDeviceDetails);
                    
                    console.log('✅ Current data loaded from devices collection');
                } else {
                    console.warn('⚠️ Failed to load current data:', result.error);
                }
            } catch (error) {
                console.error('❌ Error loading current data:', error);
            } finally {
                setLoadingData(false);
            }
        };
        
        loadCurrentData();
    }, [formData.bdoDetails?.bdoId, formData.additionalInfo?.bdoId, dataRefreshed, otpChangeService, updateStepData]);

    // Use current data if available, fallback to form data
    const displayData = currentData || {
        bdoDetails: formData.bdoDetails,
        deviceDetails: formData.deviceDetails
    };
    
    const currentOtp = displayData.bdoDetails?.currentOtpMobileNumber || displayData.bdoDetails?.otpMobileNumber;

    /**
     * Validate new OTP number
     */
    const validateNewOTP = () => {
        setValidationError('');

        if (!newOtpNumber.trim()) {
            setValidationError('Please enter new OTP number');
            return false;
        }

        if (!confirmOtpNumber.trim()) {
            setValidationError('Please confirm the new OTP number');
            return false;
        }

        if (newOtpNumber !== confirmOtpNumber) {
            setValidationError('OTP numbers do not match');
            return false;
        }

        // Validate format
        const formatValidation = verificationService.validateOTPNumberFormat(newOtpNumber);
        if (!formatValidation.valid) {
            setValidationError(formatValidation.error);
            return false;
        }

        // Validate that new number is different from current
        const changeValidation = verificationService.validateOTPNumberChange(currentOtp, newOtpNumber);
        if (!changeValidation.valid) {
            setValidationError(changeValidation.error);
            return false;
        }

        return true;
    };

    /**
     * Check if the new OTP number is already assigned to another BDO/retailer
     * Searches the last 10 digits of OTP in bdoAccounts collection
     */
    const checkOTPDuplication = async (otpNumber) => {
        try {
            // Extract last 10 digits for comparison (removing country code if present)
            const last10Digits = otpNumber.length > 10 ? otpNumber.slice(-10) : otpNumber;
            
            console.log('🔍 Checking OTP duplication for:', otpNumber, 'Last 10 digits:', last10Digits);
            
            // Get current BDO ID to exclude from search
            const currentBdoId = displayData.bdoDetails?.bdoId || formData.bdoDetails?.bdoId || formData.additionalInfo?.bdoId;
            
            // Query bdoAccounts collection for existing OTP numbers
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('status', 'in', ['Approved', 'Active', 'approved', 'active'])
            );
            
            const querySnapshot = await getDocs(bdoQuery);
            
            // Check each BDO's OTP number for duplication
            for (const doc of querySnapshot.docs) {
                const bdoData = doc.data();
                const existingOtp = bdoData.otpMobileNumber || bdoData.phoneNumber;
                
                if (!existingOtp || bdoData.bdoId === currentBdoId) {
                    continue; // Skip if no OTP or same BDO
                }
                
                // Extract last 10 digits of existing OTP
                const existingLast10 = existingOtp.length > 10 ? existingOtp.slice(-10) : existingOtp;
                
                // Check if last 10 digits match
                if (existingLast10 === last10Digits) {
                    console.log('⚠️ Duplicate OTP found:', {
                        newOtp: otpNumber,
                        existingOtp: existingOtp,
                        conflictingBdo: bdoData.name,
                        conflictingBdoId: bdoData.bdoId
                    });
                    
                    return {
                        isDuplicate: true,
                        conflictingBdo: bdoData.name,
                        conflictingBdoId: bdoData.bdoId,
                        existingOtp: existingOtp
                    };
                }
            }
            
            console.log('✅ No OTP duplication found');
            return { isDuplicate: false };
            
        } catch (error) {
            console.error('❌ Error checking OTP duplication:', error);
            throw new Error('Failed to check OTP duplication. Please try again.');
        }
    };

    /**
     * Handle OTP number change
     */
    const handleOtpChange = (value, isConfirm = false) => {
        const formattedValue = value.replace(/[^\d]/g, ''); // Remove non-digits
        
        if (isConfirm) {
            setConfirmOtpNumber(formattedValue);
        } else {
            setNewOtpNumber(formattedValue);
        }
        
        // Clear validation error when user types
        if (validationError) {
            setValidationError('');
        }
    };

    /**
     * Handle step navigation
     */
    const handleNext = async () => {
        // Basic validation first
        if (!validateNewOTP()) {
            return;
        }

        // Check for OTP duplication in bdoAccounts collection
        setCheckingDuplicate(true);
        try {
            const duplicationResult = await checkOTPDuplication(newOtpNumber);
            
            if (duplicationResult.isDuplicate) {
                setValidationError(
                    `This OTP number is already assigned to BDO "Can't show name due to compliance". Please choose a different number.`
                );
                setCheckingDuplicate(false);
                return;
            }
        } catch (error) {
            setValidationError(error.message);
            setCheckingDuplicate(false);
            return;
        } finally {
            setCheckingDuplicate(false);
        }

        // Use current data if available, otherwise fallback to form data
        const bdoDetailsToUpdate = currentData ? currentData.bdoDetails : formData.bdoDetails;
        const deviceDetailsToUpdate = currentData ? currentData.deviceDetails : formData.deviceDetails;

        // Update form data with new OTP number and current device collection data
        const updatedBdoDetails = {
            ...bdoDetailsToUpdate,
            newOtpMobileNumber: newOtpNumber,
            dataSource: currentData ? 'devices_collection' : 'form_data'
        };

        const updatedDeviceDetails = {
            ...deviceDetailsToUpdate,
            dataSource: currentData ? 'devices_collection' : 'form_data'
        };

        updateStepData('bdoDetails', updatedBdoDetails);
        updateStepData('deviceDetails', updatedDeviceDetails);
        
        toast.success('New OTP number validated and set successfully');
        console.log('✅ OTP change data prepared with devices collection data');
        onNext();
    };

    return (
        <div className="space-y-6">
            <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-orange-700">
                            <strong>Important:</strong> The new OTP number will replace the current OTP number for this BDO/Retailer.
                            This change will affect device login authentication going forward.
                        </p>
                    </div>
                </div>
            </div>

            {/* Current BDO Information */}
            <div className="bg-gray-50 border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-900">Current BDO Information</h3>
                    {loadingData && (
                        <div className="flex items-center text-blue-600 text-sm">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading current data...
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <p><strong>BDO Name:</strong> {displayData.bdoDetails?.name || 'Not available'}</p>
                        <p><strong>BDO ID:</strong> {displayData.bdoDetails?.bdoId || 'Not available'}</p>
                        <p><strong>Current OTP Number:</strong> {currentOtp || 'Not available'}</p>
                    </div>
                    <div>
                        <p><strong>Assigned IMEI:</strong> {displayData.deviceDetails?.imei || 'Not available'}</p>
                        {(displayData.bdoDetails?.shopDetails?.name || displayData.deviceDetails?.shopName) && (
                            <p><strong>Shop Name:</strong> {displayData.bdoDetails.shopDetails?.name || displayData.deviceDetails?.shopName}</p>
                        )}
                        {(displayData.bdoDetails?.shopDetails?.city || displayData.deviceDetails?.city) && (
                            <p><strong>City:</strong> {displayData.bdoDetails.shopDetails?.city || displayData.deviceDetails?.city}</p>
                        )}
                        {displayData.bdoDetails?.otpChangeCount > 0 && (
                            <p><strong>Previous OTP Changes:</strong> {displayData.bdoDetails.otpChangeCount}</p>
                        )}
                    </div>
                </div>
                
                {/* Data source indicator */}
                {displayData.bdoDetails?.dataSource === 'devices_collection' && (
                    <div className="mt-3 flex items-center text-xs text-green-600">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Data synchronized from devices collection
                    </div>
                )}
                
                {/* Data loading failure indicator */}
                {!loadingData && !currentData && formData.bdoDetails?.bdoId && (
                    <div className="mt-3 flex items-center text-xs text-amber-600">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        Using form data (devices collection not available)
                    </div>
                )}
            </div>

            {/* New OTP Number Form */}
            <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Enter New OTP Number</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            New OTP Mobile Number *
                        </label>
                        <input
                            type="tel"
                            value={newOtpNumber}
                            onChange={(e) => handleOtpChange(e.target.value)}
                            placeholder="03001234567"
                            maxLength="11"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Enter Pakistani mobile number format (03xxxxxxxxx)
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Confirm New OTP Mobile Number *
                        </label>
                        <input
                            type="tel"
                            value={confirmOtpNumber}
                            onChange={(e) => handleOtpChange(e.target.value, true)}
                            placeholder="03001234567"
                            maxLength="11"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Validation Error */}
                {validationError && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">
                                    {validationError}
                                </h3>
                            </div>
                        </div>
                    </div>
                )}

                {/* Success Preview */}
                {newOtpNumber && confirmOtpNumber && newOtpNumber === confirmOtpNumber && !validationError && (
                    <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-green-800">
                                    OTP Change: {currentOtp} → {newOtpNumber}
                                </h3>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Format Guidelines */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Mobile Number Format Guidelines:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Must be a valid Pakistani mobile number</li>
                    <li>• Should start with 03 (e.g., 03001234567)</li>
                    <li>• Must be 11 digits long</li>
                    <li>• Must be different from current OTP number</li>
                    <li>• Must not be assigned to any other BDO/retailer</li>
                </ul>
                <p className="text-xs text-blue-600 mt-2">
                    <strong>Note:</strong> The system will automatically verify that the new OTP number is not already in use by another BDO/retailer.
                </p>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onPrev}
                    disabled={loading}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                
                <button
                    onClick={handleNext}
                    disabled={loading || checkingDuplicate || !newOtpNumber || !confirmOtpNumber || newOtpNumber !== confirmOtpNumber}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                    {checkingDuplicate && (
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    {checkingDuplicate ? 'Validating OTP...' : 'Continue to Review'}
                </button>
            </div>
        </div>
    );
}

export default NewOTPStep;
