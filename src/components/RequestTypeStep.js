// --- Request Type Selection Step ---
import React, { useState, useEffect } from 'react';

/**
 * Step 1: Request Type Selection
 * Allows user to select the type of device request
 */
function RequestTypeStep({ 
    formData, 
    updateStepData, 
    onNext, 
    isFirstStep, 
    isLastStep 
}) {
    const [selectedType, setSelectedType] = useState(formData.requestType || '');
    const [isValid, setIsValid] = useState(false);

    // Request type options
    const requestTypes = [
        {
            id: 'NEW_MAPPING',
            title: 'New Device Mapping',
            description: 'Map a new BVS device to a BDO/Retailer',
            icon: '📱',
            details: 'Create a new device assignment for field operations'
        },
        {
            id: 'OTP_CHANGE',
            title: 'OTP Number Change',
            description: 'Update OTP mobile number for existing mapping',
            icon: '📞',
            details: 'Change the OTP verification phone number'
        },
        {
            id: 'DE_MAPPING',
            title: 'Device De-mapping',
            description: 'Remove device mapping and deactivate',
            icon: '🚫',
            details: 'Deactivate and unassign device from current handler'
        },
        {
            id: 'LOCATION_UPDATE',
            title: 'Location Change',
            description: 'Reset or update mapped device latitude and longitude',
            icon: '📍',
            details: 'Select an existing IMEI and optionally provide new coordinates'
        }
    ];

    useEffect(() => {
        setIsValid(selectedType !== '');
    }, [selectedType]);

    const handleTypeSelect = (typeId) => {
        setSelectedType(typeId);
        updateStepData('request_type', typeId);
    };

    const handleNext = () => {
        if (isValid) {
            onNext();
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select Request Type
                </h3>
                <p className="text-sm text-gray-600">
                    Choose the type of device operation you want to perform
                </p>
            </div>

            {/* Request Type Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requestTypes.map((type) => (
                    <div
                        key={type.id}
                        onClick={() => handleTypeSelect(type.id)}
                        className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                            selectedType === type.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        <div className="flex items-start">
                            <div className="text-2xl mr-3">{type.icon}</div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base font-medium text-gray-900 mb-1">
                                    {type.title}
                                </h4>
                                <p className="text-sm text-gray-600 mb-2">
                                    {type.description}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {type.details}
                                </p>
                            </div>
                        </div>

                        {/* Selection indicator */}
                        {selectedType === type.id && (
                            <div className="absolute top-2 right-2">
                                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Additional Information based on selected type */}
            {selectedType && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h4 className="text-sm font-medium text-blue-800">
                                Next Steps for {requestTypes.find(t => t.id === selectedType)?.title}
                            </h4>
                            <div className="mt-2 text-sm text-blue-700">
                                {selectedType === 'NEW_MAPPING' && (
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Select or create a BDO/Retailer profile</li>
                                        <li>Enter device IMEI and shop details</li>
                                        <li>Upload shop photos and documentation</li>
                                    </ul>
                                )}
                                {selectedType === 'TRANSFER' && (
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Select current device holder</li>
                                        <li>Select new BDO/Retailer for transfer</li>
                                        <li>Provide transfer reason and documentation</li>
                                    </ul>
                                )}
                                {selectedType === 'OTP_CHANGE' && (
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Select existing device mapping</li>
                                        <li>Enter new OTP mobile number</li>
                                        <li>Provide change reason</li>
                                    </ul>
                                )}
                                {selectedType === 'DE_MAPPING' && (
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Select device to deactivate</li>
                                        <li>Provide de-mapping reason</li>
                                        <li>Upload device return documentation</li>
                                    </ul>
                                )}
                                {selectedType === 'LOCATION_UPDATE' && (
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Select the mapped device IMEI</li>
                                        <li>Review current BDO, shop and location details</li>
                                        <li>Optionally enter new latitude and longitude</li>
                                        <li>Submit for Sales review and Operations completion</li>
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-end">
                <button
                    onClick={handleNext}
                    disabled={!isValid}
                    className={`px-6 py-2 rounded-md font-medium transition-colors ${
                        isValid
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}

export default RequestTypeStep;
