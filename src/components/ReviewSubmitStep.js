// --- Review and Submit Step ---
import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, increment, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useCloudFunctions } from '../utils/cloudFunctionsService';
import { useActionLogger } from '../utils/actionLogger';
import { RequestWorkflowManager } from '../utils/requestWorkflowManager';
import { NotificationSystem } from '../utils/notificationSystem';
import OTPChangeDataService from '../services/otpChangeDataService';
import toast from 'react-hot-toast';

/**
 * Step 4: Review and Submit
 * Final step for reviewing all information and submitting the request
 * Enhanced with revision workflow support
 */
function ReviewSubmitStep({ 
    formData, 
    user, 
    app, 
    db, 
    onSubmit, 
    onPrev, 
    isFirstStep, 
    isLastStep, 
    loading,
    editingRequest = null  // Add support for editing
}) {
    const [submitting, setSubmitting] = useState(false);
    const [requestNumber, setRequestNumber] = useState(null);
    const [estimatedProcessingTime] = useState('1-2 Hours');
    const [validatedData, setValidatedData] = useState(null);
    const [loadingValidation, setLoadingValidation] = useState(false);
    
    // Revision workflow state
    const isEditing = !!editingRequest;
    const isRevision = isEditing && editingRequest?.status === 'Needs Revision';
    
    // Use hooks for services
    const cloudFunctions = useCloudFunctions(app);
    const actionLogger = useActionLogger(db, user);

    // Initialize OTP Change Data Service with validation for OTP Change requests
    useEffect(() => {
        const validateOTPChangeData = async () => {
            if (formData.requestType !== 'OTP_CHANGE') return;
            
            console.log('🔄 Validating OTP Change data using devices collection...');
            console.log('🔄 Current formData:', formData);
            
            setLoadingValidation(true);
            try {
                // Extract basic data from form - be more flexible with field access
                // Check both proper location and additionalInfo as fallback
                const bdoData = formData.bdoDetails || formData.additionalInfo;
                const deviceData = formData.deviceDetails || {};
                
                const bdoId = bdoData?.bdoId || bdoData?.id;
                const imei = deviceData?.imei || deviceData?.imeiNumber;
                const newOTP = bdoData?.newOtpMobileNumber;
                
                console.log('📋 Extracted data:', { bdoId, imei, newOTP });
                console.log('📋 Data sources:', { 
                    bdoFromBdoDetails: !!formData.bdoDetails,
                    bdoFromAdditionalInfo: !!formData.additionalInfo,
                    deviceFromDeviceDetails: !!formData.deviceDetails
                });
                
                if (!bdoId) {
                    console.warn('⚠️ No BDO ID found - formData.bdoDetails:', formData.bdoDetails);
                    console.warn('⚠️ No BDO ID found - formData.additionalInfo:', formData.additionalInfo);
                    setValidatedData(null);
                    return;
                }
                
                if (!imei) {
                    console.warn('⚠️ No IMEI found - formData.deviceDetails:', formData.deviceDetails);
                }
                
                if (!newOTP) {
                    console.warn('⚠️ No new OTP found - may be entered in step 3');
                }
                
                // Use OTP Change Data Service to get current data from devices collection
                const otpService = new OTPChangeDataService(db);
                const currentData = await otpService.getCurrentBDODeviceData(bdoId, imei);
                
                if (!currentData) {
                    console.warn('⚠️ No current device mapping found in devices collection');
                    setValidatedData(null);
                    return;
                }
                
                // Merge with new OTP
                const validatedInfo = {
                    ...currentData,
                    newOtpMobileNumber: newOTP
                };
                
                console.log('✅ OTP Change data validated:', validatedInfo);
                setValidatedData(validatedInfo);
                
            } catch (error) {
                console.error('❌ Error validating OTP Change data:', error);
                setValidatedData(null);
            } finally {
                setLoadingValidation(false);
            }
        };
        
        validateOTPChangeData();
    }, [formData, db]);

    // Generate request number preview
    useEffect(() => {
        const generatePreviewNumber = async () => {
            try {
                // If editing, use existing request number
                if (isEditing && editingRequest?.requestNumber) {
                    console.log('🔄 Using existing request number for editing:', editingRequest.requestNumber);
                    setRequestNumber(editingRequest.requestNumber);
                    return;
                }
                
                console.log('🔄 Generating preview request number...');
                console.log('User:', user);
                console.log('CloudFunctions available:', !!cloudFunctions);
                
                if (!user?.franchiseCode) {
                    console.error('❌ Missing franchiseCode for user:', user);
                    const fallbackNumber = `REQ-TEMP-${Date.now()}`;
                    console.log('🎯 Using fallback number:', fallbackNumber);
                    setRequestNumber(fallbackNumber);
                    return;
                }
                
                if (!cloudFunctions) {
                    console.warn('⚠️ Cloud functions not available, using fallback request number');
                    const fallbackNumber = `REQ-${user.franchiseCode}-${Date.now()}`;
                    console.log('🎯 Using fallback number:', fallbackNumber);
                    setRequestNumber(fallbackNumber);
                    return;
                }
                
                console.log('🚀 Calling cloud function generateRequestNumber...');
                const result = await cloudFunctions.generateRequestNumber({ franchiseCode: user.franchiseCode });
                console.log('✅ Cloud function result:', result);
                
                if (result?.data?.requestNumber) {
                    console.log('🎯 Setting request number:', result.data.requestNumber);
                    setRequestNumber(result.data.requestNumber);
                } else {
                    console.error('❌ Invalid response from cloud function:', result);
                    const fallbackNumber = `REQ-${user.franchiseCode}-${Date.now()}`;
                    console.log('🎯 Using fallback number:', fallbackNumber);
                    setRequestNumber(fallbackNumber);
                }
            } catch (error) {
                console.error('❌ Error generating request number preview:', error);
                const fallbackNumber = `REQ-${user.franchiseCode || 'TEMP'}-${Date.now()}`;
                console.log('🎯 Using error fallback number:', fallbackNumber);
                setRequestNumber(fallbackNumber);
            }
        };

        if (user?.franchiseCode && !requestNumber) {
            if (isEditing && editingRequest?.requestNumber) {
                // Use existing request number immediately for editing
                setRequestNumber(editingRequest.requestNumber);
            } else {
                // Set immediate fallback first to unblock UI for new requests
                const immediateFallback = `REQ-${user.franchiseCode}-${Date.now()}`;
                console.log('🚀 Setting immediate fallback to unblock UI:', immediateFallback);
                setRequestNumber(immediateFallback);
                
                // Then try to get proper number from cloud function
                generatePreviewNumber();
            }
        }
    }, [user?.franchiseCode, requestNumber, cloudFunctions, isEditing, editingRequest]);

    /**
     * Clean object by removing undefined values to avoid Firebase errors
     */
    const cleanObjectForFirestore = (obj) => {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(cleanObjectForFirestore);
        
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = cleanObjectForFirestore(value);
            }
        }
        return cleaned;
    };

    /**
     * Pakistan business day is used because this portal is operated locally.
     * The daily IMEI limit uses this value for stable per-day document IDs.
     */
    const getBusinessDateKey = () => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Karachi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date());

            const values = parts.reduce((acc, part) => {
                if (part.type !== 'literal') acc[part.type] = part.value;
                return acc;
            }, {});

            return `${values.year}-${values.month}-${values.day}`;
        } catch (error) {
            return new Date().toISOString().slice(0, 10);
        }
    };

    const getLocationChangePayload = () => {
        const details = formData.locationChangeDetails || {};
        const selectedDevice = details.selectedDevice || formData.additionalInfo?.selectedDevice || {};
        const currentMapping = details.currentMapping || formData.additionalInfo?.currentMapping || {};
        const newLocation = details.newLocation || {};
        const hasCoordinates = newLocation.hasCoordinates === true;
        const latitude = hasCoordinates && Number.isFinite(Number(newLocation.latitude)) ? Number(newLocation.latitude) : null;
        const longitude = hasCoordinates && Number.isFinite(Number(newLocation.longitude)) ? Number(newLocation.longitude) : null;
        const imei = currentMapping.deviceInfo?.imei || selectedDevice.imei || details.deviceInfo?.imei;

        return {
            details,
            selectedDevice,
            currentMapping,
            newLocation: {
                latitude,
                longitude,
                hasCoordinates,
                resetToNull: !hasCoordinates
            },
            imei
        };
    };

    /**
     * Handle final submission
     */
    const handleFinalSubmit = async () => {
        if (submitting) return;

        setSubmitting(true);

        try {
            console.log('Starting final request submission...');
            console.log('User data:', user);
            console.log('Form data:', formData);
            console.log('Current request number:', requestNumber);

            if (!user?.franchiseCode) {
                throw new Error('Franchise code is missing. Please refresh and try again.');
            }

            if (!requestNumber) {
                throw new Error('Request number is not available. Please refresh and try again.');
            }

            // Use the existing request number from state
            const finalRequestNumber = requestNumber;
            console.log('Using request number for submission:', finalRequestNumber);

            // Validate required data before submission
            if (!formData.requestType) {
                throw new Error('Request type is missing');
            }

            // For OTP_CHANGE, be more flexible with validation and use validated data
            if (formData.requestType === 'OTP_CHANGE') {
                console.log('🔧 Validating OTP_CHANGE request:', formData);
                console.log('🔧 bdoDetails:', formData.bdoDetails);
                console.log('🔧 additionalInfo:', formData.additionalInfo);
                console.log('🔧 validatedData:', validatedData);
                
                // Use validated data if available, fallback to form data (check both locations)
                const bdoDataForValidation = validatedData?.bdoInfo || formData.bdoDetails || formData.additionalInfo;
                const deviceDataForValidation = validatedData?.deviceInfo || formData.deviceDetails;
                
                // Also check for new OTP in additionalInfo
                const newOTPFromForm = formData.bdoDetails?.newOtpMobileNumber || formData.additionalInfo?.newOtpMobileNumber;
                
                console.log('🔧 bdoDataForValidation:', bdoDataForValidation);
                console.log('🔧 deviceDataForValidation:', deviceDataForValidation);
                console.log('🔧 newOTPFromForm:', newOTPFromForm);
                
                if (!bdoDataForValidation) {
                    throw new Error('BDO details are missing for OTP change - please go back and verify BDO information');
                }
                if (!bdoDataForValidation.bdoId) {
                    throw new Error('BDO ID is required for OTP change');
                }
                if (!bdoDataForValidation.currentOtpMobileNumber && !bdoDataForValidation.otpMobileNumber) {
                    throw new Error('Current OTP number is required');
                }
                if (!newOTPFromForm) {
                    throw new Error('New OTP number is required');
                }
                if (!deviceDataForValidation?.imei && !deviceDataForValidation?.imeiNumber) {
                    throw new Error('Device IMEI is required for OTP change');
                }
                
                // Additional validation for validated data
                if (validatedData && !validatedData.isValid) {
                    throw new Error('Current BDO/device data validation failed. Please verify the assignment.');
                }
            } else if (formData.requestType === 'DE_MAPPING') {
                console.log('🔧 Validating DE_MAPPING request:', formData);
                console.log('🔧 demappingDetails:', formData.demappingDetails);
                if (!formData.demappingDetails) {
                    throw new Error('De-mapping details are missing');
                }
                if (!formData.demappingDetails.demappingReason) {
                    throw new Error('De-mapping reason is required');
                }
                if (formData.demappingDetails.demappingReason.trim().length < 10) {
                    throw new Error('De-mapping reason must be at least 10 characters');
                }
                if (!formData.demappingDetails.acknowledged) {
                    throw new Error('Please acknowledge the implications of de-mapping');
                }
            } else if (formData.requestType === 'LOCATION_UPDATE') {
                console.log('🔧 Validating LOCATION_UPDATE request:', formData);
                const locationPayload = getLocationChangePayload();
                if (!locationPayload.imei) {
                    throw new Error('Device IMEI is required for location change');
                }
                if (!locationPayload.currentMapping?.deviceInfo && !locationPayload.selectedDevice?.imei) {
                    throw new Error('Selected device details are missing for location change');
                }
                if (!formData.locationChangeDetails?.acknowledged) {
                    throw new Error('Please confirm the location change request');
                }
                if (locationPayload.newLocation.hasCoordinates) {
                    const lat = Number(locationPayload.newLocation.latitude);
                    const lng = Number(locationPayload.newLocation.longitude);
                    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
                        throw new Error('Invalid latitude or longitude values');
                    }
                }
            } else {
                // Original validation for other request types
                if (!formData.bdoDetails || !formData.bdoDetails.id) {
                    throw new Error('BDO details are missing');
                }
                if (!formData.deviceDetails) {
                    throw new Error('Device details are missing');
                }
            }

            // Prepare request document with safe field access and proper timestamps
            const currentTimestamp = Timestamp.now(); // Use actual timestamp instead of serverTimestamp()
            const requestDoc = {
                requestNumber: finalRequestNumber,
                requestType: formData.requestType || 'unknown',
                bdoDetails: formData.bdoDetails || {},
                franchiseCode: user.franchiseCode,
                franchiseName: user.name || user.franchiseName || user.displayName || 'Unknown Franchise',
                createdBy: user.email || 'unknown@example.com',
                createdAt: isEditing ? editingRequest.createdAt : currentTimestamp,
                updatedAt: currentTimestamp,
                status: isEditing ? 'Submitted' : 'pending', // Use proper status for revisions
                assignedTo: 'Sales Team',
                additionalInfo: formData.additionalInfo || {},
                metadata: {
                    version: '2.0',
                    source: 'web-app',
                    userAgent: navigator.userAgent,
                    submissionTimestamp: new Date().toISOString(),
                    updatedAt: currentTimestamp // Add timestamp to metadata as well for consistency
                }
            };

            // Handle revision workflow
            if (isRevision) {
                // Track revision information
                requestDoc.isResubmission = true;
                requestDoc.revisionCount = (editingRequest.revisionCount || 0) + 1;
                requestDoc.previousRejectionReason = editingRequest.rejectionReason;
                requestDoc.resubmittedAt = currentTimestamp; // Use consistent timestamp
                
                // Build revision history
                requestDoc.revisionHistory = [
                    ...(editingRequest.revisionHistory || []),
                    {
                        rejectedAt: editingRequest.updatedAt,
                        rejectionReason: editingRequest.rejectionReason,
                        resubmittedAt: currentTimestamp, // Use Timestamp instead of Date for consistency
                        revisionNumber: (editingRequest.revisionCount || 0) + 1
                    }
                ];
                
                // Clear current rejection reason after storing in history
                requestDoc.rejectionReason = "";
                
                console.log('📝 Revision metadata added:', {
                    revisionCount: requestDoc.revisionCount,
                    previousRejectionReason: requestDoc.previousRejectionReason,
                    historyLength: requestDoc.revisionHistory.length
                });
            } else if (isEditing && !isRevision) {
                // Regular edit (not a revision)
                requestDoc.isResubmission = false;
                requestDoc.rejectionReason = "";
            } else {
                // New request
                requestDoc.isResubmission = false;
                requestDoc.revisionCount = 0;
                requestDoc.revisionHistory = [];
            }

            // Add type-specific data
            if (formData.requestType === 'OTP_CHANGE') {
                // Use validated data if available, fallback to form data (check both locations)
                const bdoDataForSubmission = validatedData?.bdoInfo || formData.bdoDetails || formData.additionalInfo;
                const deviceDataForSubmission = validatedData?.deviceInfo || formData.deviceDetails;
                
                // Get new OTP from either location
                const newOTPFromForm = formData.bdoDetails?.newOtpMobileNumber || formData.additionalInfo?.newOtpMobileNumber;
                
                requestDoc.bdoDetails = {
                    ...bdoDataForSubmission,
                    bdoDocumentId: (formData.bdoDetails?.bdoDocumentId || formData.additionalInfo?.bdoDocumentId || bdoDataForSubmission?.bdoDocumentId),
                    newOtpMobileNumber: newOTPFromForm // Always from form for the new value
                };
                requestDoc.deviceDetails = deviceDataForSubmission;
                requestDoc.currentOTP = bdoDataForSubmission?.currentOtpMobileNumber || bdoDataForSubmission?.otpMobileNumber;
                requestDoc.newOTP = newOTPFromForm;
                
                // Build deviceInfo object with only defined values to avoid Firebase undefined field errors
                const deviceInfo = {};
                const imei = deviceDataForSubmission?.imei || deviceDataForSubmission?.imeiNumber;
                const status = deviceDataForSubmission?.currentStatus || deviceDataForSubmission?.status;
                const model = deviceDataForSubmission?.model;
                
                if (imei !== undefined) deviceInfo.imei = imei;
                if (status !== undefined) deviceInfo.status = status;
                if (model !== undefined) deviceInfo.model = model;
                
                // Ensure we have at least the essential fields
                if (!deviceInfo.imei && imei === undefined) {
                    console.warn('⚠️ No IMEI found for device info, using fallback');
                    deviceInfo.imei = 'IMEI_NOT_AVAILABLE';
                }
                if (!deviceInfo.status) {
                    deviceInfo.status = 'Unknown';
                }
                
                requestDoc.deviceInfo = deviceInfo;
                requestDoc.priority = 'high'; // OTP changes have high priority
                
                // Add validation metadata
                requestDoc.validationMetadata = {
                    usedDevicesCollection: !!validatedData,
                    validationTimestamp: new Date(),
                    currentMappingStatus: validatedData?.status
                };
                
                console.log('📱 OTP Change request prepared with:', {
                    usedValidatedData: !!validatedData,
                    currentOTP: requestDoc.currentOTP,
                    newOTP: requestDoc.newOTP,
                    deviceImei: requestDoc.deviceInfo.imei,
                    deviceInfoKeys: Object.keys(requestDoc.deviceInfo),
                    hasUndefinedFields: JSON.stringify(requestDoc.deviceInfo).includes('undefined')
                });
            } else if (formData.requestType === 'DE_MAPPING') {
                // Extract device and BDO information from form data for DE_MAPPING
                const demappingDetails = formData.demappingDetails || {};
                const selectedDevice = formData.additionalInfo?.selectedDevice || {};
                const currentMapping = formData.additionalInfo?.currentMapping || {};
                
                requestDoc.demappingReason = demappingDetails.demappingReason || formData.additionalInfo?.demappingReason;
                requestDoc.acknowledged = demappingDetails.acknowledged || formData.additionalInfo?.acknowledged;
                requestDoc.deviceInfo = demappingDetails.deviceInfo || currentMapping.deviceInfo || null;
                requestDoc.currentMapping = currentMapping;
                
                // Add structured device data for workflow execution
                requestDoc.device = {
                    imei: currentMapping.deviceInfo?.imei || selectedDevice.imei,
                    currentBdoId: currentMapping.bdoDetails?.bdoId || selectedDevice.bdoId
                };
                
                requestDoc.demapReason = demappingDetails.demappingReason || formData.additionalInfo?.demappingReason;
                requestDoc.priority = 'high'; // De-mapping requests have high priority
            } else if (formData.requestType === 'LOCATION_UPDATE') {
                const locationPayload = getLocationChangePayload();
                const { details, selectedDevice, currentMapping, newLocation, imei } = locationPayload;
                const dateKey = getBusinessDateKey();
                const dailyUsageId = `${imei}_${dateKey}`;

                requestDoc.bdoDetails = currentMapping.bdoDetails || {
                    bdoId: selectedDevice.bdoId,
                    name: selectedDevice.bdoName,
                    cnic: selectedDevice.bdoCnic,
                    phoneNumber: selectedDevice.otpMobileNumber
                };
                requestDoc.deviceDetails = {
                    imei,
                    model: currentMapping.deviceInfo?.model || selectedDevice.model || null,
                    status: currentMapping.deviceInfo?.status || selectedDevice.status || null,
                    shopName: currentMapping.locationDetails?.shopName || selectedDevice.shopName || null,
                    city: currentMapping.locationDetails?.city || selectedDevice.city || null,
                    streetAddress: currentMapping.locationDetails?.streetAddress || selectedDevice.streetAddress || null,
                    latitude: currentMapping.locationDetails?.latitude ?? selectedDevice.latitude ?? null,
                    longitude: currentMapping.locationDetails?.longitude ?? selectedDevice.longitude ?? null
                };
                requestDoc.deviceInfo = currentMapping.deviceInfo || { imei };
                requestDoc.currentMapping = currentMapping;
                requestDoc.locationChangeDetails = {
                    ...details,
                    selectedDevice,
                    currentMapping,
                    newLocation,
                    dailyUsageId,
                    dailyUsageDate: dateKey
                };
                requestDoc.newLocation = newLocation;
                requestDoc.previousLocation = currentMapping.locationDetails || {
                    streetAddress: selectedDevice.streetAddress || null,
                    city: selectedDevice.city || null,
                    shopName: selectedDevice.shopName || null,
                    latitude: selectedDevice.latitude ?? null,
                    longitude: selectedDevice.longitude ?? null
                };
                requestDoc.locationChangeReason = details.locationChangeReason || null;
                requestDoc.locationChangeDailyUsageId = dailyUsageId;
                requestDoc.locationChangeDailyUsageDate = dateKey;
                requestDoc.device = {
                    imei,
                    currentBdoId: currentMapping.bdoDetails?.bdoId || selectedDevice.bdoId || null
                };
                requestDoc.priority = 'normal';
            } else {
                requestDoc.deviceDetails = formData.deviceDetails || {};
                requestDoc.priority = formData.deviceDetails?.priority || 'normal';
            }

            console.log('Request document prepared:', requestDoc);

            // Clean the request document to remove any undefined values that would cause Firebase errors
            const cleanedRequestDoc = cleanObjectForFirestore(requestDoc);
            console.log('Request document cleaned for Firestore:', cleanedRequestDoc);

            let docRef;
            let firestoreDocId;

            if (isEditing) {
                // Update existing request
                console.log('Updating existing request with ID:', editingRequest.id);
                const { updateDoc, doc } = await import('firebase/firestore');
                const requestRef = doc(db, 'requestsV2', editingRequest.id);
                await updateDoc(requestRef, cleanedRequestDoc);
                firestoreDocId = editingRequest.id;
                console.log('Request updated successfully with ID:', firestoreDocId);
            } else if (formData.requestType === 'LOCATION_UPDATE') {
                // Create location change request and increment its per-IMEI daily submission counter atomically.
                console.log('Creating new location change request with daily limit check...');
                const locationPayload = getLocationChangePayload();
                const dateKey = cleanedRequestDoc.locationChangeDailyUsageDate || getBusinessDateKey();
                const usageDocId = cleanedRequestDoc.locationChangeDailyUsageId || `${locationPayload.imei}_${dateKey}`;
                const requestRef = doc(collection(db, 'requestsV2'));
                const usageRef = doc(db, 'deviceLocationChangeDailyUsage', usageDocId);

                await runTransaction(db, async (transaction) => {
                    const usageSnap = await transaction.get(usageRef);
                    const submittedCount = usageSnap.exists() ? Number(usageSnap.data().submittedCount || 0) : 0;

                    if (submittedCount >= 2) {
                        throw new Error(`Location change limit reached for IMEI ${locationPayload.imei}. A device can have maximum 2 location change requests per day.`);
                    }

                    const requestWithCounter = {
                        ...cleanedRequestDoc,
                        locationChangeDailyUsageId: usageDocId,
                        locationChangeDailyUsageDate: dateKey
                    };

                    transaction.set(requestRef, requestWithCounter);
                    transaction.set(usageRef, {
                        imei: locationPayload.imei,
                        dateKey,
                        franchiseCode: user.franchiseCode,
                        submittedCount: increment(1),
                        updatedAt: currentTimestamp,
                        lastRequestId: requestRef.id,
                        lastRequestNumber: finalRequestNumber,
                        ...(usageSnap.exists() ? {} : { createdAt: currentTimestamp })
                    }, { merge: true });
                });

                firestoreDocId = requestRef.id;
                console.log('Location change request created successfully with ID:', firestoreDocId);
            } else {
                // Create new request
                console.log('Creating new request...');
                docRef = await addDoc(collection(db, 'requestsV2'), cleanedRequestDoc);
                firestoreDocId = docRef.id;
                console.log('Request created successfully with ID:', firestoreDocId);
            }

            // Log action
            if (actionLogger) {
                const actionType = isEditing ? (isRevision ? 'RESUBMIT' : 'UPDATE') : 'CREATE';
                const description = isRevision 
                    ? `Request ${finalRequestNumber} resubmitted after revision (Revision #${requestDoc.revisionCount})`
                    : isEditing 
                    ? `Request ${finalRequestNumber} updated`
                    : `Request ${finalRequestNumber} created`;

                await actionLogger.logAction({
                    type: actionType,
                    description,
                    category: 'REQUEST',
                    target: {
                        entityType: 'request',
                        entityId: finalRequestNumber,
                        entityIdentifier: finalRequestNumber
                    },
                    context: {
                        requestId: finalRequestNumber,
                        requestType: formData.requestType,
                        bdoId: formData.bdoDetails?.bdoId,
                        deviceCount: formData.deviceDetails?.deviceCount || 1,
                        firestoreDocId: firestoreDocId,
                        franchiseCode: user.franchiseCode,
                        isEditing,
                        isRevision,
                        revisionCount: requestDoc.revisionCount || 0,
                        previousRejectionReason: isRevision ? requestDoc.previousRejectionReason : null
                    },
                    severity: 'INFO'
                });
            }

            // Log creation success
            console.log(`✅ Request ${finalRequestNumber} created successfully with ID: ${firestoreDocId}`);
            
            // DE_MAPPING requests follow the same approval workflow as other requests
            // They will be executed when approved by Operations team

            const successMessage = isRevision 
                ? `Request resubmitted successfully! Request Number: ${finalRequestNumber} (Revision #${requestDoc.revisionCount})`
                : isEditing 
                ? `Request updated successfully! Request Number: ${finalRequestNumber}`
                : `Request submitted successfully! Request Number: ${finalRequestNumber}`;

            toast.success(successMessage);

            // Call parent success handler
            if (onSubmit) {
                onSubmit({
                    requestNumber: finalRequestNumber,
                    firestoreDocId: firestoreDocId,
                    formData: cleanedRequestDoc,
                    isRevision,
                    revisionCount: cleanedRequestDoc.revisionCount || 0
                });
            }

        } catch (error) {
            console.error('Error submitting request:', error);
            toast.error(`Failed to submit request: ${error.message}`);

            // Log error
            if (actionLogger) {
                await actionLogger.logAction({
                    type: 'ERROR',
                    description: `Request submission failed: ${error.message}`,
                    category: 'REQUEST',
                    target: {
                        entityType: 'request',
                        entityId: 'submission_failed',
                        entityIdentifier: `failed_${Date.now()}`
                    },
                    context: {
                        error: error.message,
                        formData: formData,
                        franchiseCode: user.franchiseCode
                    },
                    severity: 'ERROR'
                });
            }

        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Render review section for each step
     */
    const renderReviewSection = (title, data, icon) => (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm">
            <div className="flex items-center mb-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    {icon}
                </div>
                <h3 className="ml-3 text-lg font-medium text-gray-900">{title}</h3>
            </div>
            <div className="ml-11 space-y-2">
                {data}
            </div>
        </div>
    );

    /**
     * Format request type display
     */
    const formatRequestType = () => {
        const typeMap = {
            'NEW_MAPPING': 'New Device Mapping',
            'TRANSFER': 'Device Transfer (Transfer of Ownership)',
            'OTP_CHANGE': 'OTP Number Change',
            'DE_MAPPING': 'Device De-mapping',
            'LOCATION_UPDATE': 'Location Change',
            'new_installation': 'New Device Installation',
            'replacement': 'Device Replacement',
            'maintenance': 'Device Maintenance',
            'relocation': 'Device Relocation',
            'upgrade': 'Device Upgrade'
        };
        return typeMap[formData.requestType] || formData.requestType;
    };

    /**
     * Format BDO details display
     */
    const formatBDODetails = () => {
        const bdoData = formData.bdoDetails
            || formData.locationChangeDetails?.currentMapping?.bdoDetails
            || formData.demappingDetails?.currentMapping?.bdoDetails
            || formData.additionalInfo?.currentMapping?.bdoDetails
            || null;

        if (!bdoData) return <p className="text-gray-500 text-sm">No BDO selected</p>;

        const displayName = bdoData.name || bdoData.bdoName || 'Not provided';
        const displayBdoId = bdoData.bdoId || bdoData.id || 'Not provided';
        const displayType = bdoData.handlerType || bdoData.type || 'BDO/Retailer';
        const displayCnic = bdoData.cnic || bdoData.cnicNumber || bdoData.bdoCnic || 'Not provided';
        const displayMobile = bdoData.otpMobileNumber || bdoData.phoneNumber || bdoData.mobileNumber || 'Not provided';

        return (
            <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Name:</span>
                        <p className="text-gray-900">{displayName}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">BDO ID:</span>
                        <p className="text-gray-900 font-mono text-sm break-all">{displayBdoId}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Type:</span>
                        <p className="text-gray-900">{displayType}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">CNIC:</span>
                        <p className="text-gray-900 font-mono text-sm">{displayCnic}</p>
                    </div>
                </div>
                <div>
                    <span className="font-medium text-gray-700 text-sm">Mobile Number:</span>
                    <p className="text-gray-900 font-mono text-sm">{displayMobile}</p>
                </div>
                
                {/* CNIC Images */}
                {(bdoData.cnicFrontImageUrl || bdoData.cnicBackImageUrl) && (
                    <div>
                        <span className="font-medium text-gray-700 text-sm block mb-2">CNIC Images:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {bdoData.cnicFrontImageUrl && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Front</p>
                                    <img
                                        src={bdoData.cnicFrontImageUrl}
                                        alt="CNIC Front"
                                        className="w-full h-24 object-cover rounded border border-gray-200"
                                    />
                                </div>
                            )}
                            {bdoData.cnicBackImageUrl && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Back</p>
                                    <img
                                        src={bdoData.cnicBackImageUrl}
                                        alt="CNIC Back"
                                        className="w-full h-24 object-cover rounded border border-gray-200"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /**
     * Format OTP change details for display
     */
    const formatOTPChangeDetails = () => {
        console.log('🔧 formatOTPChangeDetails called');
        console.log('🔧 FormData:', formData.bdoDetails, formData.deviceDetails);
        console.log('🔧 AdditionalInfo:', formData.additionalInfo);
        console.log('🔧 ValidatedData:', validatedData);
        console.log('🔧 LoadingValidation:', loadingValidation);
        
        // Show loading state while validating data
        if (loadingValidation) {
            return (
                <div className="text-center py-4">
                    <div className="inline-flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm text-gray-600">Loading current BDO/device information...</span>
                    </div>
                </div>
            );
        }
        
        // Use validated data if available, fallback to form data (check both locations)
        const bdoData = validatedData?.bdoInfo || formData.bdoDetails || formData.additionalInfo;
        const deviceData = validatedData?.deviceInfo || formData.deviceDetails;
        const displayData = validatedData || bdoData;
        const newOTP = formData.bdoDetails?.newOtpMobileNumber || formData.additionalInfo?.newOtpMobileNumber;
        
        console.log('🔧 Resolved data:', { bdoData, deviceData, displayData, newOTP });
        
        if (!displayData || !newOTP) {
            return (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                    <p className="text-yellow-800 text-sm">
                        ⚠️ Unable to load current BDO/device information. Please go back and verify the data.
                    </p>
                    <div className="text-xs text-gray-600 mt-2">
                        <p>Debug: bdoDetails={!!formData.bdoDetails}, additionalInfo={!!formData.additionalInfo}, newOTP={!!newOTP}</p>
                    </div>
                </div>
            );
        }
        
        return (
            <div className="space-y-4">
                {/* Data Source Indicator */}
                <div className={`text-xs p-2 rounded border-l-4 ${
                    validatedData 
                        ? 'bg-green-50 border-green-400 text-green-700' 
                        : 'bg-yellow-50 border-yellow-400 text-yellow-700'
                }`}>
                    {validatedData 
                        ? '✓ Current information loaded from devices collection' 
                        : '⚠️ Using form data - devices collection validation unavailable'
                    }
                </div>
                
                {/* Current Information */}
                <div className="bg-gray-50 p-3 rounded-md">
                    <h4 className="font-medium text-gray-800 mb-2">Current Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <span className="font-medium text-gray-700 text-sm">BDO Name:</span>
                            <p className="text-gray-900 text-sm">{bdoData?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">BDO ID:</span>
                            <p className="text-gray-900 font-mono text-sm">{bdoData?.bdoId || 'N/A'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Current OTP Number:</span>
                            <p className="text-gray-900 font-mono text-sm">{bdoData?.currentOtpMobileNumber || bdoData?.otpMobileNumber || 'N/A'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Assigned Device IMEI:</span>
                            <p className="text-gray-900 font-mono text-sm">{deviceData?.imei || 'N/A'}</p>
                        </div>
                        {bdoData?.shopDetails?.name && (
                            <div className="sm:col-span-2">
                                <span className="font-medium text-gray-700 text-sm">Shop Name:</span>
                                <p className="text-gray-900">{bdoData.shopDetails.name}</p>
                            </div>
                        )}
                        {bdoData?.city && (
                            <div>
                                <span className="font-medium text-gray-700 text-sm">City:</span>
                                <p className="text-gray-900 text-sm">{bdoData.city}</p>
                            </div>
                        )}
                        {bdoData?.cnic && (
                            <div>
                                <span className="font-medium text-gray-700 text-sm">CNIC:</span>
                                <p className="text-gray-900 font-mono text-sm">{bdoData.cnic}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Change Details */}
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-md">
                    <h4 className="font-medium text-orange-800 mb-2">OTP Change Request</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <span className="font-medium text-orange-700 text-sm">New OTP Number:</span>
                            <p className="text-orange-900 font-mono text-sm">{newOTP}</p>
                        </div>
                        {bdoData?.otpChangeCount > 0 && (
                            <div>
                                <span className="font-medium text-orange-700 text-sm">Previous Changes:</span>
                                <p className="text-orange-900 text-sm">{bdoData.otpChangeCount}</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-3 p-2 bg-orange-100 rounded border-l-4 border-orange-400">
                        <p className="text-orange-800 text-sm">
                            <strong>Change Summary:</strong> {bdoData?.currentOtpMobileNumber || bdoData?.otpMobileNumber || 'Current'} → {newOTP}
                        </p>
                        <p className="text-orange-700 text-xs mt-1">
                            This change will affect device login authentication for this BDO/Retailer.
                        </p>
                    </div>
                </div>

                {/* Device Details */}
                {validatedData && (
                    <div className="bg-blue-50 p-3 rounded-md">
                        <h4 className="font-medium text-blue-800 mb-2">Device Information</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <span className="font-medium text-blue-700 text-sm">Device Status:</span>
                                <p className="text-blue-900 text-sm capitalize">{validatedData.status || 'Active'}</p>
                            </div>
                            <div>
                                <span className="font-medium text-blue-700 text-sm">Mapping Date:</span>
                                <p className="text-blue-900 text-sm">
                                    {validatedData.mappingDate ? new Date(validatedData.mappingDate.seconds * 1000).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                            {validatedData.deviceInfo?.model && (
                                <div>
                                    <span className="font-medium text-blue-700 text-sm">Device Model:</span>
                                    <p className="text-blue-900 text-sm">{validatedData.deviceInfo.model}</p>
                                </div>
                            )}
                            {validatedData.location && (
                                <div className="sm:col-span-2">
                                    <span className="font-medium text-blue-700 text-sm">Location:</span>
                                    <p className="text-blue-900 text-sm">
                                        {validatedData.location.city}, {validatedData.location.area}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /**
     * Format de-mapping details for display
     */
    const formatDemappingDetails = () => {
        console.log('🔧 formatDemappingDetails called with:', formData.demappingDetails);
        if (!formData.demappingDetails) return <p className="text-gray-500 text-sm">No de-mapping details</p>;

        const demappingData = formData.demappingDetails;
        
        return (
            <div className="space-y-4">
                {/* Current Mapping Information */}
                <div className="bg-red-50 p-3 rounded-md border border-red-200">
                    <h4 className="font-medium text-red-800 mb-2 flex items-center">
                        <span className="w-4 h-4 bg-red-600 rounded-full mr-2"></span>
                        Current Mapping to be Removed
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {demappingData.currentMapping?.bdoDetails && (
                            <>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Current BDO Name:</span>
                                    <p className="text-gray-900 font-medium">{demappingData.currentMapping.bdoDetails.name}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Current BDO ID:</span>
                                    <p className="text-gray-900 font-mono text-sm">{demappingData.currentMapping.bdoDetails.bdoId}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">BDO Phone:</span>
                                    <p className="text-gray-900 font-mono text-sm">{demappingData.currentMapping.bdoDetails.phoneNumber}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Current Status:</span>
                                    <p className="text-gray-900 capitalize">{demappingData.currentMapping.status}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Current IMEI:</span>
                                    <p className="text-gray-900 font-medium">{demappingData.currentMapping.deviceInfo.imei}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Shop Name:</span>
                                    <p className="text-gray-900 capitalize">{demappingData.currentMapping.locationDetails.shopName}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Street Address:</span>
                                    <p className="text-gray-900 capitalize">{demappingData.currentMapping.locationDetails.streetAddress}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Latitude:</span>
                                    <p className="text-gray-900 capitalize">{demappingData.currentMapping.locationDetails.latitude}</p>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Longitude:</span>
                                    <p className="text-gray-900 capitalize">{demappingData.currentMapping.locationDetails.longitude}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* De-mapping Reason */}
                <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
                    <h4 className="font-medium text-yellow-800 mb-2">Reason for De-mapping</h4>
                    <p className="text-gray-900 p-3 bg-white rounded border text-sm whitespace-pre-wrap">
                        {demappingData.demappingReason}
                    </p>
                </div>

                {/* Impact Warning */}
                <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
                    <h4 className="font-medium text-orange-800 mb-2 flex items-center">
                        <span className="text-orange-600 mr-2">⚠️</span>
                        Impact of De-mapping
                    </h4>
                    <div className="text-sm text-gray-700 space-y-2">
                        <p>• Device will become unassigned and available for new mapping</p>
                        <p>• BDO will lose access to this device</p>
                        <p>• Action is reversible through new mapping request</p>
                    </div>
                </div>

                {/* Confirmation */}
                {demappingData.acknowledged && (
                    <div className="bg-green-50 p-3 rounded-md border border-green-200">
                        <h4 className="font-medium text-green-800 mb-2 flex items-center">
                            <span className="text-green-600 mr-2">✓</span>
                            Confirmation
                        </h4>
                        <p className="text-green-700 text-sm">
                            User has acknowledged understanding of the de-mapping implications
                        </p>
                    </div>
                )}
            </div>
        );
    };

    /**
     * Format location change details for display
     */
    const formatLocationChangeDetails = () => {
        const payload = getLocationChangePayload();
        const { details, selectedDevice, currentMapping, newLocation, imei } = payload;
        const bdo = currentMapping.bdoDetails || details.bdoDetails || selectedDevice || {};
        const location = currentMapping.locationDetails || details.currentLocation || selectedDevice || {};
        const device = currentMapping.deviceInfo || details.deviceInfo || selectedDevice || {};

        const formatValue = (value) => (value === null || value === undefined || value === '' ? 'Not set' : String(value));

        return (
            <div className="space-y-4">
                <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
                    <h4 className="font-medium text-yellow-900 mb-2 flex items-center">
                        <span className="mr-2">📍</span>
                        Location Change Request
                    </h4>
                    <p className="text-sm text-yellow-800">
                        This request will go to Sales first and then Operations. After Operations completes the AKSA portal action, the devices collection will be updated.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <span className="font-medium text-gray-700 text-sm">IMEI:</span>
                        <p className="text-gray-900 font-mono break-all">{formatValue(imei || device.imei)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Device Status:</span>
                        <p className="text-gray-900">{formatValue(device.status || selectedDevice.status)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Current BDO:</span>
                        <p className="text-gray-900">{formatValue(bdo.name || bdo.bdoName)} ({formatValue(bdo.bdoId)})</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">OTP Mobile:</span>
                        <p className="text-gray-900">{formatValue(bdo.phoneNumber || bdo.otpMobileNumber)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Shop:</span>
                        <p className="text-gray-900">{formatValue(location.shopName || selectedDevice.shopName)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">City:</span>
                        <p className="text-gray-900">{formatValue(location.city || selectedDevice.city)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Current Latitude:</span>
                        <p className="text-gray-900">{formatValue(location.latitude ?? selectedDevice.latitude)}</p>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Current Longitude:</span>
                        <p className="text-gray-900">{formatValue(location.longitude ?? selectedDevice.longitude)}</p>
                    </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">Requested coordinate action</h4>
                    {newLocation.hasCoordinates ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div>
                                <span className="font-medium text-blue-700">New Latitude:</span>
                                <p className="text-blue-900 font-mono">{formatValue(newLocation.latitude)}</p>
                            </div>
                            <div>
                                <span className="font-medium text-blue-700">New Longitude:</span>
                                <p className="text-blue-900 font-mono">{formatValue(newLocation.longitude)}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-blue-800">No new coordinates were provided. Latitude and longitude will be set to null after Operations completion.</p>
                    )}
                </div>

                {details.locationChangeReason && (
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                        <h4 className="font-medium text-gray-800 mb-2">Remarks</h4>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{details.locationChangeReason}</p>
                    </div>
                )}

                {details.acknowledged && (
                    <div className="bg-green-50 p-3 rounded-md border border-green-200">
                        <p className="text-green-700 text-sm">✓ User confirmed the location change request.</p>
                    </div>
                )}
            </div>
        );
    };

    /**
     * Format device details display
     */
    const formatDeviceDetails = () => {
        if (!formData.deviceDetails) return <p className="text-gray-500 text-sm">No device details</p>;

        const details = formData.deviceDetails;
        return (
            <div className="space-y-4">
                {/* Shop Information */}
                <div>
                    <h4 className="font-medium text-gray-800 mb-2">Shop Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Shop Name:</span>
                            <p className="text-gray-900">{details.shopName || 'Not provided'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Contact Number:</span>
                            <p className="text-gray-900 font-mono text-sm">{details.contactNumber || 'Not provided'}</p>
                        </div>
                        <div className="sm:col-span-2">
                            <span className="font-medium text-gray-700 text-sm">Address:</span>
                            <p className="text-gray-900">{details.streetAddress || details.address || 'Not provided'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">City:</span>
                            <p className="text-gray-900">{details.city || 'Not provided'}</p>
                        </div>
                    </div>
                </div>

                {/* Location Details */}
                <div>
                    <h4 className="font-medium text-gray-800 mb-2">Location Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Latitude:</span>
                            <p className="text-gray-900 font-mono text-sm">
                                {details.coordinates?.lat || details.latitude || 'Not provided'}
                            </p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 text-sm">Longitude:</span>
                            <p className="text-gray-900 font-mono text-sm">
                                {details.coordinates?.lng || details.longitude || 'Not provided'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Device Information */}
                {(details.deviceCount || details.priority || details.imei) && (
                    <div>
                        <h4 className="font-medium text-gray-800 mb-2">Device Information</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {details.imei && (
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">IMEI:</span>
                                    <p className="text-gray-900 font-mono text-sm">{details.imei}</p>
                                </div>
                            )}
                            {details.deviceCount && (
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Device Count:</span>
                                    <p className="text-gray-900">{details.deviceCount}</p>
                                </div>
                            )}
                            {details.priority && (
                                <div>
                                    <span className="font-medium text-gray-700 text-sm">Priority:</span>
                                    <p className="text-gray-900 capitalize">{details.priority}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Special Instructions */}
                {details.specialInstructions && (
                    <div>
                        <span className="font-medium text-gray-700 text-sm">Special Instructions:</span>
                        <p className="text-gray-900 mt-1 p-3 bg-gray-50 rounded text-sm">{details.specialInstructions}</p>
                    </div>
                )}

                {/* Shop Images */}
                {(details.shopInsideImage || details.shopOutsideImage || (details.shopImages && details.shopImages.length > 0)) && (
                    <div>
                        <span className="font-medium text-gray-700 text-sm block mb-2">Shop Images:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {details.shopInsideImage && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Inside Shop</p>
                                    <img
                                        src={details.shopInsideImage}
                                        alt="Shop Inside"
                                        className="w-full h-24 object-cover rounded border border-gray-200"
                                    />
                                </div>
                            )}
                            {details.shopOutsideImage && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Outside Shop</p>
                                    <img
                                        src={details.shopOutsideImage}
                                        alt="Shop Outside"
                                        className="w-full h-24 object-cover rounded border border-gray-200"
                                    />
                                </div>
                            )}
                            {/* Legacy shop images array support */}
                            {details.shopImages && details.shopImages.map((image, index) => (
                                <div key={index}>
                                    <img
                                        src={image.url}
                                        alt={`Shop ${index + 1}`}
                                        className="w-full h-24 object-cover rounded border border-gray-200"
                                    />
                                    {image.name && (
                                        <p className="text-xs text-gray-500 mt-1 truncate">{image.name}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Review Your Request</h2>
                <p className="text-gray-600 text-sm">
                    Please review all the information below before submitting your request.
                </p>
                {requestNumber && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">
                            <span className="font-medium">Request Number:</span> {requestNumber}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                            Estimated Processing Time: {estimatedProcessingTime}
                        </p>
                    </div>
                )}
            </div>

            {/* Request Type Review */}
            {renderReviewSection(
                'Request Type',
                <div className="bg-blue-50 p-3 rounded-md">
                    <p className="text-gray-900 font-medium">{formatRequestType()}</p>
                </div>,
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            )}

            {/* BDO Details Review */}
            {renderReviewSection(
                'BDO/Retailer Information',
                formatBDODetails(),
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )}

            {/* Device Details Review / OTP Change Details / De-mapping Details */}
            {formData.requestType === 'OTP_CHANGE' ? (
                renderReviewSection(
                    'OTP Change Details',
                    formatOTPChangeDetails(),
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                )
            ) : formData.requestType === 'DE_MAPPING' ? (
                renderReviewSection(
                    'De-mapping Details',
                    formatDemappingDetails(),
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                    </svg>
                )
            ) : formData.requestType === 'LOCATION_UPDATE' ? (
                renderReviewSection(
                    'Location Change Details',
                    formatLocationChangeDetails(),
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                )
            ) : (
                renderReviewSection(
                    'Device & Shop Details',
                    formatDeviceDetails(),
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                )
            )}

            {/* Terms and Conditions */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Terms and Conditions</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                    <li>• All information provided must be accurate and complete</li>
                    <li>• Requests will be processed in order of submission</li>
                    <li>• Additional documentation may be requested during processing</li>
                </ul>
            </div>

            {/* Navigation Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-gray-200 space-y-3 sm:space-y-0">
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={submitting}
                    className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                    ← Previous
                </button>
                
                <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={submitting || !requestNumber}
                    className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                        submitting || !requestNumber 
                            ? 'bg-gray-400 hover:bg-gray-400' 
                            : 'bg-green-600 hover:bg-green-700'
                    }`}
                    title={!requestNumber ? 'Generating request number...' : ''}
                >
                    {submitting ? (
                        <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Submitting Request...
                        </span>
                    ) : !requestNumber ? (
                        'Generating Request Number...'
                    ) : (
                        'Submit Request'
                    )}
                </button>
            </div>
        </div>
    );
}

export default ReviewSubmitStep;
