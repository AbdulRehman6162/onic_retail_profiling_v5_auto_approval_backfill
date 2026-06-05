// --- BDO Verification Step Component ---
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import BDOVerificationService from '../services/bdoVerificationService';

/**
 * Step component for BDO verification in OTP change request
 */
function BDOVerificationStep({ 
    formData, 
    updateStepData, 
    user, 
    app, 
    db, 
    onNext, 
    onPrev, 
    isFirstStep, 
    loading 
}) {
    const [bdoId, setBdoId] = useState(formData.bdoDetails?.bdoId || '');
    const [cnicNumber, setCnicNumber] = useState(formData.bdoDetails?.cnicNumber || '');
    const [currentOtp, setCurrentOtp] = useState(formData.bdoDetails?.currentOtpMobileNumber || '');
    const [verifying, setVerifying] = useState(false);
    const [verified, setVerified] = useState(formData.bdoDetails?.verificationStatus?.cnicVerified || false);
    const [bdoDetails, setBdoDetails] = useState(formData.bdoDetails || null);
    const [deviceDetails, setDeviceDetails] = useState(formData.deviceDetails || null);

    const verificationService = new BDOVerificationService(db, null); // actionLogger will be null for now

    /**
     * Handle BDO verification
     */
    const handleVerification = async () => {
        if (!bdoId.trim()) {
            toast.error('Please enter BDO ID');
            return;
        }

        if (!cnicNumber.trim()) {
            toast.error('Please enter CNIC number');
            return;
        }

        if (!currentOtp.trim()) {
            toast.error('Please enter current OTP number');
            return;
        }

        // Validate CNIC format (Pakistani CNIC: 12345-6789012-3)
        const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
        if (!cnicRegex.test(cnicNumber)) {
            toast.error('Invalid CNIC format. Please use format: 12345-6789012-3');
            return;
        }

        // Validate OTP number format
        const otpValidation = verificationService.validateOTPNumberFormat(currentOtp);
        if (!otpValidation.valid) {
            toast.error(otpValidation.error);
            return;
        }

        setVerifying(true);
        
        try {
            // Verify BDO credentials
            const verificationResult = await verificationService.verifyBDO(bdoId, cnicNumber, currentOtp);
            
            if (!verificationResult.success) {
                toast.error(verificationResult.error);
                setVerified(false);
                return;
            }

            // Find assigned device
            const deviceResult = await verificationService.findBDOAssignedDevice(bdoId);
            
            if (!deviceResult.success) {
                toast.error(deviceResult.error);
                return;
            }

            // Verification successful
            const verifiedBdoDetails = {
                bdoId,
                bdoDocumentId: verificationResult.bdoData.documentId, // Include the actual Firestore document ID
                name: verificationResult.bdoData.name,
                cnic: cnicNumber, // Map to 'cnic' field expected by ReviewSubmitStep
                cnicNumber: cnicNumber, // Keep both for backward compatibility
                currentOtpMobileNumber: currentOtp,
                otpMobileNumber: currentOtp, // Map to field expected by ReviewSubmitStep
                handlerType: 'BDO/Retailer', // Add handler type expected by ReviewSubmitStep
                franchiseId: verificationResult.bdoData.franchiseId,
                franchiseName: verificationResult.bdoData.franchiseName,
                shopDetails: verificationResult.bdoData.shopDetails,
                otpChangeCount: verificationResult.bdoData.otpChangeCount,
                verificationStatus: {
                    cnicVerified: true,
                    currentOtpVerified: true,
                    verifiedAt: new Date().toISOString()
                }
            };

            const verifiedDeviceDetails = {
                imei: deviceResult.device.imei,
                currentStatus: deviceResult.device.status,
                assignedAt: deviceResult.device.assignedAt,
                coordinates: deviceResult.device.coordinates,
                bdoName: deviceResult.device.bdoName,
                shopName: deviceResult.device.shopName,
                city: deviceResult.device.city
            };

            setBdoDetails(verifiedBdoDetails);
            setDeviceDetails(verifiedDeviceDetails);
            setVerified(true);

            // Update form data
            updateStepData('bdoDetails', verifiedBdoDetails);
            updateStepData('deviceDetails', verifiedDeviceDetails);

            console.log('📝 Updated form data with verified details:');
            console.log('📋 BDO Details:', verifiedBdoDetails);
            console.log('📱 Device Details:', verifiedDeviceDetails);

            toast.success(`BDO verified successfully! Device ${deviceResult.device.imei} found.`);

        } catch (error) {
            console.error('Verification error:', error);
            toast.error('Verification failed due to system error');
        } finally {
            setVerifying(false);
        }
    };

    /**
     * Handle step navigation
     */
    const handleNext = () => {
        if (!verified) {
            toast.error('Please complete BDO verification first');
            return;
        }
        onNext();
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            <strong>OTP Change Request Verification</strong>
                            <br />
                            Please provide BDO ID, CNIC number, and current OTP number for verification.
                            This will affect the OTP number for the BDO/Retailer across all their activities.
                        </p>
                    </div>
                </div>
            </div>

            {/* BDO Verification Form */}
            <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">BDO/Retailer Verification</h3>
                
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            BDO ID *
                        </label>
                        <input
                            type="text"
                            value={bdoId}
                            onChange={(e) => setBdoId(e.target.value.toUpperCase())}
                            placeholder="Enter BDO ID (e.g., BDO123)"
                            disabled={verified}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            CNIC Number *
                        </label>
                        <input
                            type="text"
                            value={cnicNumber}
                            onChange={(e) => setCnicNumber(e.target.value)}
                            placeholder="12345-6789012-3"
                            disabled={verified}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                    </div>
                </div>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700">
                        Current OTP Mobile Number *
                    </label>
                    <input
                        type="tel"
                        value={currentOtp}
                        onChange={(e) => setCurrentOtp(e.target.value)}
                        placeholder="03001234567"
                        disabled={verified}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                </div>

                {!verified && (
                    <div className="mt-6">
                        <button
                            onClick={handleVerification}
                            disabled={verifying || !bdoId || !cnicNumber || !currentOtp}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {verifying ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Verifying...
                                </>
                            ) : (
                                'Verify BDO Details'
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Verification Success Display */}
            {verified && bdoDetails && deviceDetails && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-green-800">
                                BDO/Retailer Verified Successfully
                            </h3>
                            <div className="mt-2 text-sm text-green-700">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p><strong>BDO Name:</strong> {bdoDetails.name}</p>
                                        <p><strong>BDO ID:</strong> {bdoDetails.bdoId}</p>
                                        <p><strong>Current OTP:</strong> {bdoDetails.currentOtpMobileNumber}</p>
                                        {bdoDetails.otpChangeCount > 0 && (
                                            <p><strong>Previous Changes:</strong> {bdoDetails.otpChangeCount}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p><strong>Assigned IMEI:</strong> {deviceDetails.imei}</p>
                                        <p><strong>Device Status:</strong> {deviceDetails.currentStatus}</p>
                                        {bdoDetails.shopDetails?.name && (
                                            <p><strong>Shop:</strong> {bdoDetails.shopDetails.name}</p>
                                        )}
                                        {bdoDetails.shopDetails?.city && (
                                            <p><strong>City:</strong> {bdoDetails.shopDetails.city}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onPrev}
                    disabled={isFirstStep}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                
                <button
                    onClick={handleNext}
                    disabled={loading || !verified}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    Continue to New OTP
                </button>
            </div>
        </div>
    );
}

export default BDOVerificationStep;
