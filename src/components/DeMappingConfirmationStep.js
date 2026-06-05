import React, { useState } from 'react';
import { AlertTriangle, Smartphone, User, MapPin, Calendar, FileText, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * De-mapping Confirmation Step
 * Shows device details and requires confirmation before proceeding
 */
function DeMappingConfirmationStep({ 
    formData, 
    updateStepData, 
    onNext, 
    onPrev, 
    isFirstStep, 
    isLastStep 
}) {
    const [demappingReason, setDemappingReason] = useState(
        formData.demappingDetails?.demappingReason || 
        formData.additionalInfo?.demappingReason || 
        ''
    );
    const [acknowledged, setAcknowledged] = useState(
        formData.demappingDetails?.acknowledged || 
        formData.additionalInfo?.acknowledged || 
        false
    );

    // Access device selection data from the correct location in formData
    const deviceSelectionData = formData.additionalInfo || formData.device_selection || {};
    const selectedDevice = deviceSelectionData.selectedDevice;
    const currentMapping = deviceSelectionData.currentMapping;

    // Debug logging
    console.log('🔧 DeMappingConfirmationStep - formData:', formData);
    console.log('🔧 DeMappingConfirmationStep - deviceSelectionData:', deviceSelectionData);
    console.log('🔧 DeMappingConfirmationStep - selectedDevice:', selectedDevice);
    console.log('🔧 DeMappingConfirmationStep - currentMapping:', currentMapping);

    /**
     * Handle form data update
     */
    const updateFormData = () => {
        // Preserve device selection data and add de-mapping confirmation data
        const updatedAdditionalInfo = {
            ...formData.additionalInfo,
            // Preserve device selection data
            selectedDevice: selectedDevice,
            currentMapping: currentMapping,
            // Add de-mapping confirmation data
            demappingReason: demappingReason.trim(),
            acknowledged,
            deviceInfo: currentMapping?.deviceInfo
        };

        updateStepData('demapping_confirmation', updatedAdditionalInfo);

        // Also update the demappingDetails that ReviewSubmitStep expects
        updateStepData('demapping_details', {
            demappingReason: demappingReason.trim(),
            acknowledged,
            deviceInfo: currentMapping?.deviceInfo,
            currentMapping: currentMapping,
            selectedDevice: selectedDevice
        });
    };

    /**
     * Handle next step with validation
     */
    const handleNext = () => {
        // Validation
        if (!demappingReason.trim()) {
            toast.error('Please provide a reason for de-mapping');
            return;
        }

        if (demappingReason.trim().length < 10) {
            toast.error('Please provide a more detailed reason (at least 10 characters)');
            return;
        }

        if (!acknowledged) {
            toast.error('Please acknowledge that you understand the implications');
            return;
        }

        // Update form data and proceed
        updateFormData();
        onNext();
    };

    /**
     * Handle input changes
     */
    const handleReasonChange = (value) => {
        setDemappingReason(value);
        updateFormData();
    };

    const handleAcknowledgeChange = (checked) => {
        setAcknowledged(checked);
        updateFormData();
    };

    /**
     * Format date for display
     */
    const formatDate = (date) => {
        if (!date) return 'Not available';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!selectedDevice || !currentMapping) {
        return (
            <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Device Selected</h3>
                <p className="text-gray-600 mb-4">Please go back and select a device to de-map.</p>
                <button
                    onClick={onPrev}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Device De-mapping</h2>
                <p className="text-gray-600">
                    Please review the device details and confirm the de-mapping request.
                    This action will remove the BDO assignment but preserve audit history.
                </p>
            </div>

            {/* Warning Banner */}
            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-800">Important Notice</h3>
                        <div className="mt-1 text-sm text-amber-700">
                            <p>De-mapping will:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Remove the BDO assignment from this device</li>
                                <li>Set device status to "DEMAPPED"</li>
                                <li>Clear current location and shop information</li>
                                <li>Preserve complete audit history for compliance</li>
                                <li>Require sales and operations team approval</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Current Mapping Details */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Smartphone className="h-5 w-5 mr-2 text-blue-600" />
                    Current Device Mapping
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Device Information */}
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                            <Smartphone className="h-4 w-4 mr-2" />
                            Device Details
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">IMEI:</span>
                                <span className="font-mono text-gray-900">{currentMapping.deviceInfo?.imei}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Model:</span>
                                <span className="text-gray-900">{currentMapping.deviceInfo?.model || 'Not specified'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Status:</span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    {currentMapping.deviceInfo?.status || 'ACTIVE'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* BDO Information */}
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                            <User className="h-4 w-4 mr-2" />
                            Current BDO Assignment
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Name:</span>
                                <span className="text-gray-900">{currentMapping.bdoDetails?.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">BDO ID:</span>
                                <span className="font-mono text-gray-900">{currentMapping.bdoDetails?.bdoId}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">CNIC:</span>
                                <span className="font-mono text-gray-900">{currentMapping.bdoDetails?.cnic}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Phone:</span>
                                <span className="font-mono text-gray-900">{currentMapping.bdoDetails?.phoneNumber}</span>
                            </div>
                        </div>
                    </div>

                    {/* Location Information */}
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                            <MapPin className="h-4 w-4 mr-2" />
                            Current Location
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Shop:</span>
                                <span className="text-gray-900">{currentMapping.locationDetails?.shopName || 'Not specified'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">City:</span>
                                <span className="text-gray-900">{currentMapping.locationDetails?.city || 'Not specified'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Address:</span>
                                <span className="text-gray-900">{currentMapping.locationDetails?.streetAddress || 'Not specified'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Mapping History */}
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                            <Calendar className="h-4 w-4 mr-2" />
                            Mapping History
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Mapped:</span>
                                <span className="text-gray-900">{formatDate(currentMapping.mappingDate)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Status:</span>
                                <span className="text-gray-900 capitalize">{currentMapping.status}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* De-mapping Reason */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="inline h-4 w-4 mr-1" />
                    Reason for De-mapping *
                </label>
                <textarea
                    value={demappingReason}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    placeholder="Please provide a detailed reason for requesting device de-mapping..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                />
                <p className="mt-1 text-xs text-gray-500">
                    Minimum 10 characters required. Current: {demappingReason.length}
                </p>
            </div>

            {/* Acknowledgment Checkbox */}
            <div className="flex items-start">
                <div className="flex items-center h-5">
                    <input
                        id="acknowledge"
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => handleAcknowledgeChange(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        required
                    />
                </div>
                <div className="ml-3">
                    <label htmlFor="acknowledge" className="text-sm font-medium text-gray-700">
                        I understand the implications of de-mapping this device
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                        This action will require approval from sales and operations teams and cannot be undone automatically.
                    </p>
                </div>
            </div>

            {/* Validation Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Validation Checklist:</h4>
                <div className="space-y-2">
                    <div className={`flex items-center text-sm ${
                        demappingReason.trim().length >= 10 ? 'text-green-600' : 'text-gray-500'
                    }`}>
                        <CheckCircle className={`h-4 w-4 mr-2 ${
                            demappingReason.trim().length >= 10 ? 'text-green-500' : 'text-gray-300'
                        }`} />
                        Detailed reason provided (minimum 10 characters)
                    </div>
                    <div className={`flex items-center text-sm ${
                        acknowledged ? 'text-green-600' : 'text-gray-500'
                    }`}>
                        <CheckCircle className={`h-4 w-4 mr-2 ${
                            acknowledged ? 'text-green-500' : 'text-gray-300'
                        }`} />
                        Implications acknowledged
                    </div>
                </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-6 border-t">
                <button
                    onClick={onPrev}
                    className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                    Previous
                </button>
                
                <button
                    onClick={handleNext}
                    disabled={
                        !demappingReason.trim() || 
                        demappingReason.trim().length < 10 ||
                        !acknowledged
                    }
                    className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Proceed to Review
                </button>
            </div>
        </div>
    );
}

export default DeMappingConfirmationStep;
