// --- Multi-Step Request Wizard Component ---
import React, { useState, useEffect } from 'react';
import { getFirestore } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Import step components
import RequestTypeStep from './RequestTypeStep';
import BDOSelectionStep from './BDOSelectionStep';
import DeviceDetailsStep from './DeviceDetailsStep';
import ReviewSubmitStep from './ReviewSubmitStep';
import DeviceSelectionStep from './DeviceSelectionStep';
import DeMappingConfirmationStep from './DeMappingConfirmationStep';
import LocationChangeDetailsStep from './LocationChangeDetailsStep';

// Import OTP Change specific components
import BDOVerificationStep from './BDOVerificationStep';
import NewOTPStep from './NewOTPStep';

/**
 * Multi-Step Request Wizard
 * Implements progressive form saving and step validation
 * Enhanced with revision workflow support
 */
function RequestWizard({ user, app, onSuccess, onCancel, editingRequest = null }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState({
        requestType: '',
        bdoDetails: null,
        deviceDetails: {},
        additionalInfo: {}
    });
    const [loading, setLoading] = useState(false);
    const [draftId, setDraftId] = useState(null);
    const [db] = useState(() => getFirestore(app));
    
    // Revision workflow state
    const isEditing = !!editingRequest;
    const isRevision = isEditing && editingRequest?.status === 'Needs Revision';

    // Define wizard steps - dynamic based on request type
    const getStepsForRequestType = (requestType) => {
        switch (requestType) {
            case 'OTP_CHANGE':
                return [
                    { 
                        id: 'request_type', 
                        title: 'Request Type',
                        component: RequestTypeStep,
                        description: 'Select the type of device request'
                    },
                    { 
                        id: 'bdo_verification', 
                        title: 'BDO Verification',
                        component: BDOVerificationStep,
                        description: 'Verify BDO/Retailer details'
                    },
                    { 
                        id: 'new_otp', 
                        title: 'New OTP Number',
                        component: NewOTPStep,
                        description: 'Enter new OTP mobile number'
                    },
                    { 
                        id: 'review_submit', 
                        title: 'Review & Submit',
                        component: ReviewSubmitStep,
                        description: 'Review and submit your request'
                    }
                ];
            
            case 'DE_MAPPING':
                return [
                    { 
                        id: 'request_type', 
                        title: 'Request Type',
                        component: RequestTypeStep,
                        description: 'Select the type of device request'
                    },
                    { 
                        id: 'device_selection', 
                        title: 'Select Device',
                        component: DeviceSelectionStep,
                        description: 'Select device to de-map'
                    },
                    { 
                        id: 'demapping_confirmation', 
                        title: 'Confirm De-mapping',
                        component: DeMappingConfirmationStep,
                        description: 'Review device details and confirm de-mapping'
                    },
                    { 
                        id: 'review_submit', 
                        title: 'Review & Submit',
                        component: ReviewSubmitStep,
                        description: 'Review and submit your request'
                    }
                ];

            case 'LOCATION_UPDATE':
                return [
                    {
                        id: 'request_type',
                        title: 'Request Type',
                        component: RequestTypeStep,
                        description: 'Select the type of device request'
                    },
                    {
                        id: 'device_selection',
                        title: 'Select Device',
                        component: DeviceSelectionStep,
                        description: 'Select IMEI for location change'
                    },
                    {
                        id: 'location_change_details',
                        title: 'Location Details',
                        component: LocationChangeDetailsStep,
                        description: 'Optional new lat/long or reset to null'
                    },
                    {
                        id: 'review_submit',
                        title: 'Review & Submit',
                        component: ReviewSubmitStep,
                        description: 'Review and submit your request'
                    }
                ];
            
            default:
                // Default flow for NEW_MAPPING, TRANSFER_OWNERSHIP, etc.
                return [
                    { 
                        id: 'request_type', 
                        title: 'Request Type',
                        component: RequestTypeStep,
                        description: 'Select the type of device request'
                    },
                    { 
                        id: 'bdo_selection', 
                        title: 'BDO/Retailer',
                        component: BDOSelectionStep,
                        description: 'Select or create BDO/Retailer'
                    },
                    { 
                        id: 'device_details', 
                        title: 'Device & Shop Details',
                        component: DeviceDetailsStep,
                        description: 'Enter device and shop information'
                    },
                    { 
                        id: 'review_submit', 
                        title: 'Review & Submit',
                        component: ReviewSubmitStep,
                        description: 'Review and submit your request'
                    }
                ];
        }
    };

    // Get current steps based on request type
    const steps = getStepsForRequestType(formData.requestType);

    // Initialize draft on component mount
    useEffect(() => {
        if (isEditing && editingRequest) {
            // Populate form data from existing request for editing
            setFormData({
                requestType: editingRequest.requestType || editingRequest.type || '',
                bdoDetails: editingRequest.bdoDetails || {
                    bdoId: editingRequest.bdoId,
                    name: editingRequest.bdoName,
                    cnicNumber: editingRequest.cnicNumber,
                    otpMobileNumber: editingRequest.otpMobileNumber
                },
                deviceDetails: editingRequest.deviceDetails || {
                    imei: editingRequest.imei,
                    shopName: editingRequest.shopName,
                    city: editingRequest.city,
                    streetAddress: editingRequest.streetAddress,
                    coordinates: editingRequest.shopLocation || editingRequest.coordinates
                },
                additionalInfo: editingRequest.additionalInfo || {}
            });
            console.log('🔄 Editing mode - populated form data:', editingRequest);
        } else {
            initializeDraft();
        }
    }, [isEditing, editingRequest]);

    /**
     * Initialize local draft storage. Drafts are no longer written to Firestore on every step,
     * which removes high-frequency requestDrafts writes without changing the submitted request flow.
     */
    const initializeDraft = () => {
        try {
            const draftDocId = `requestDraft:${user.uid}:${Date.now()}`;
            const initialDraft = {
                userId: user.uid,
                franchiseCode: user.franchiseCode,
                steps: {},
                currentStep: 0,
                createdAt: new Date().toISOString(),
                lastSaved: new Date().toISOString()
            };

            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(draftDocId, JSON.stringify(initialDraft));
            }

            setDraftId(draftDocId);
        } catch (error) {
            console.warn('Local draft initialization skipped:', error);
        }
    };

    /**
     * Save progress locally only. The final request submission still writes the real request document.
     */
    const saveProgress = (stepData) => {
        if (!draftId || typeof window === 'undefined' || !window.localStorage) return;

        try {
            const existing = JSON.parse(window.localStorage.getItem(draftId) || '{}');
            const currentStepId = steps[currentStep]?.id || 'unknown_step';
            const nextDraft = {
                ...existing,
                userId: existing.userId || user.uid,
                franchiseCode: existing.franchiseCode || user.franchiseCode,
                steps: {
                    ...(existing.steps || {}),
                    [currentStepId]: stepData
                },
                currentStep,
                lastSaved: new Date().toISOString()
            };

            window.localStorage.setItem(draftId, JSON.stringify(nextDraft));
        } catch (error) {
            console.warn('Local draft save skipped:', error);
        }
    };

    /**
     * Handle step data update
     */
    const updateStepData = (stepId, data) => {
        const dataKey = getDataKeyForStepId(stepId);
        
        console.log(`📝 Updating step data: ${stepId} -> ${dataKey}`, data);
        
        setFormData(prev => {
            const updated = {
                ...prev,
                [dataKey]: data
            };
            console.log(`✅ Form data updated:`, updated);
            return updated;
        });

        // If request type is changed, reset to first step and clear other data EXCEPT for OTP_CHANGE
        if (stepId === 'request_type' && data !== formData.requestType) {
            console.log(`🔄 Request type changed to: ${data}`);
            
            // For OTP_CHANGE, don't clear data immediately - let verification step handle it
            if (data === 'OTP_CHANGE') {
                console.log(`🔄 OTP_CHANGE selected - preserving current data structure`);
                setCurrentStep(0);
                setFormData(prev => ({
                    requestType: data,
                    bdoDetails: prev.bdoDetails || null,
                    deviceDetails: prev.deviceDetails || {},
                    additionalInfo: prev.additionalInfo || {},
                    locationChangeDetails: prev.locationChangeDetails || null
                }));
            } else {
                // For other request types, clear data as usual
                setCurrentStep(0);
                setFormData({
                    requestType: data,
                    bdoDetails: null,
                    deviceDetails: {},
                    additionalInfo: {},
                    locationChangeDetails: null
                });
            }
        }

        // Auto-save progress
        saveProgress(data);
    };

    /**
     * Map step ID to form data key
     */
    const getDataKeyForStepId = (stepId) => {
        switch (stepId) {
            case 'request_type':
                return 'requestType';
            case 'bdo_selection':
            case 'bdo_verification':
            case 'bdoDetails':  // Direct bdoDetails updates
                return 'bdoDetails';
            case 'device_details':
            case 'deviceDetails':  // Direct deviceDetails updates
                return 'deviceDetails';
            case 'new_otp':
                return 'bdoDetails'; // OTP change updates bdoDetails
            case 'otp_change_details':
                return 'otpChangeDetails';
            case 'demapping_details':
                return 'demappingDetails';
            case 'location_change_details':
                return 'locationChangeDetails';
            default:
                return 'additionalInfo';
        }
    };

    /**
     * Navigate to next step
     */
    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    /**
     * Navigate to previous step
     */
    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (submissionResult) => {
        setLoading(true);
        try {
            // The submission has already been completed in ReviewSubmitStep
            // submissionResult contains: { requestNumber, firestoreDocId, formData }
            console.log('Request submission completed:', submissionResult);
            
            // Clean up local draft after successful submission
            if (draftId && typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(draftId);
            }

            // Don't show another success toast since ReviewSubmitStep already showed one
            console.log(`Request ${submissionResult.requestNumber} submitted successfully!`);
            onSuccess && onSuccess(submissionResult);
        } catch (error) {
            console.error('Error in post-submission handling:', error);
            toast.error('Request submitted but post-processing failed');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Cancel wizard and clean up
     */
    const handleCancel = async () => {
        if (draftId && typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.removeItem(draftId);
            } catch (error) {
                console.warn('Local draft cleanup skipped:', error);
            }
        }
        onCancel && onCancel();
    };

    // Get current step component
    const CurrentStepComponent = steps[currentStep].component;

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Header with progress indicator */}
            <div className="px-4 sm:px-6 py-4 border-b">
                {/* Revision Warning Banner */}
                {isRevision && editingRequest?.rejectionReason && (
                    <div className="mb-4 bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3 flex-1">
                                <h3 className="text-sm font-medium text-orange-800">Request Revision Required</h3>
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

                <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                        {isEditing ? (
                            <>
                                <svg className="h-5 w-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                {isRevision ? 'Revise Request' : 'Edit Request'}
                                {editingRequest?.revisionCount && (
                                    <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                                        Revision #{(editingRequest.revisionCount || 0) + 1}
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <svg className="h-5 w-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Create New Request
                            </>
                        )}
                    </h2>
                    <button
                        onClick={handleCancel}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="flex items-start overflow-x-auto pb-2">
                    {steps.map((step, index) => (
                        <div key={step.id} className="flex items-center">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                                index <= currentStep 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-gray-200 text-gray-600'
                            }`}>
                                {index + 1}
                            </div>
                            <div className="ml-3">
                                <p className={`text-sm font-medium ${
                                    index <= currentStep ? 'text-blue-600' : 'text-gray-500'
                                }`}>
                                    {step.title}
                                </p>
                                <p className="text-xs text-gray-500">{step.description}</p>
                            </div>
                            {index < steps.length - 1 && (
                                <div className={`ml-6 mr-6 w-16 h-0.5 ${
                                    index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                                }`} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step Content */}
            <div className="px-4 sm:px-6 py-6">
                <CurrentStepComponent
                    formData={formData}
                    stepData={formData}
                    updateStepData={updateStepData}
                    user={user}
                    app={app}
                    db={db}
                    onNext={nextStep}
                    onPrev={prevStep}
                    onSubmit={handleSubmit}
                    isFirstStep={currentStep === 0}
                    isLastStep={currentStep === steps.length - 1}
                    loading={loading}
                    editingRequest={editingRequest}  // Pass editing request to all steps
                />
            </div>

            {/* Navigation Footer */}
            <div className="px-4 sm:px-6 py-4 border-t bg-gray-50 rounded-b-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="text-sm text-gray-500">
                        Step {currentStep + 1} of {steps.length}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                        {currentStep > 0 && (
                            <button
                                onClick={prevStep}
                                disabled={loading}
                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Previous
                            </button>
                        )}
                        
                        <button
                            onClick={handleCancel}
                            disabled={loading}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RequestWizard;
