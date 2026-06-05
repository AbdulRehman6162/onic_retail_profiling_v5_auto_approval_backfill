// --- Location Change Details Step ---
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, MapPin, Navigation, Smartphone, User } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Location Change Details Step
 * Allows franchise users to submit a location reset/update request for an already mapped IMEI.
 * Latitude/longitude are optional. If blank, Operations completion resets both coordinates to null.
 */
function LocationChangeDetailsStep({
    formData,
    updateStepData,
    onNext,
    onPrev,
    isFirstStep
}) {
    const existingDetails = formData.locationChangeDetails || {};
    const selectedDevice = existingDetails.selectedDevice || formData.additionalInfo?.selectedDevice || {};
    const currentMapping = existingDetails.currentMapping || formData.additionalInfo?.currentMapping || {};
    const currentLocation = currentMapping.locationDetails || selectedDevice || {};
    const currentBdo = currentMapping.bdoDetails || selectedDevice || {};
    const currentDevice = currentMapping.deviceInfo || selectedDevice || {};

    const [latitude, setLatitude] = useState(
        existingDetails.newLocation?.hasCoordinates ? String(existingDetails.newLocation.latitude ?? '') : ''
    );
    const [longitude, setLongitude] = useState(
        existingDetails.newLocation?.hasCoordinates ? String(existingDetails.newLocation.longitude ?? '') : ''
    );
    const [reason, setReason] = useState(existingDetails.locationChangeReason || '');
    const [acknowledged, setAcknowledged] = useState(Boolean(existingDetails.acknowledged));

    const imei = currentDevice.imei || selectedDevice.imei;
    const hasAnyCoordinate = latitude.trim() !== '' || longitude.trim() !== '';

    const validation = useMemo(() => {
        if (!imei) {
            return { valid: false, message: 'Please go back and select a mapped device first.' };
        }

        if (hasAnyCoordinate) {
            if (latitude.trim() === '' || longitude.trim() === '') {
                return { valid: false, message: 'Enter both latitude and longitude, or leave both blank to reset coordinates to null.' };
            }

            const lat = Number(latitude);
            const lng = Number(longitude);

            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                return { valid: false, message: 'Latitude must be a valid number between -90 and 90.' };
            }

            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                return { valid: false, message: 'Longitude must be a valid number between -180 and 180.' };
            }
        }

        if (!acknowledged) {
            return { valid: false, message: 'Please confirm the location change request before continuing.' };
        }

        return { valid: true, message: '' };
    }, [acknowledged, hasAnyCoordinate, imei, latitude, longitude]);

    const buildDetails = () => {
        const hasCoordinates = hasAnyCoordinate;
        const newLocation = hasCoordinates
            ? {
                latitude: Number(latitude),
                longitude: Number(longitude),
                hasCoordinates: true,
                resetToNull: false
            }
            : {
                latitude: null,
                longitude: null,
                hasCoordinates: false,
                resetToNull: true
            };

        return {
            selectedDevice,
            currentMapping,
            deviceInfo: currentDevice,
            bdoDetails: currentBdo,
            currentLocation,
            newLocation,
            locationChangeReason: reason.trim() || null,
            acknowledged,
            submittedAt: new Date().toISOString()
        };
    };

    useEffect(() => {
        updateStepData('location_change_details', buildDetails());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latitude, longitude, reason, acknowledged]);

    const handleNext = () => {
        if (!validation.valid) {
            toast.error(validation.message);
            return;
        }

        updateStepData('location_change_details', buildDetails());
        onNext();
    };

    const formatValue = (value) => {
        if (value === null || value === undefined || value === '') return 'Not set';
        return String(value);
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Location Change Details</h3>
                <p className="text-sm text-gray-600">
                    Review the selected IMEI and optionally provide new coordinates. Leaving coordinates blank will reset latitude and longitude to null after Operations completes the request.
                </p>
            </div>

            {!imei ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-red-900">No device selected</h4>
                            <p className="text-sm text-red-700 mt-1">Please go back and select an active mapped device.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Smartphone className="h-5 w-5 text-blue-600" />
                            <h4 className="font-medium text-gray-900">Device</h4>
                        </div>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-gray-500">IMEI</dt>
                                <dd className="font-mono font-medium text-gray-900 break-all">{formatValue(imei)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Status</dt>
                                <dd className="text-gray-900">{formatValue(currentDevice.status || selectedDevice.status)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Model</dt>
                                <dd className="text-gray-900">{formatValue(currentDevice.model || selectedDevice.model)}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <User className="h-5 w-5 text-purple-600" />
                            <h4 className="font-medium text-gray-900">Current BDO</h4>
                        </div>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-gray-500">BDO ID</dt>
                                <dd className="font-medium text-gray-900">{formatValue(currentBdo.bdoId || selectedDevice.bdoId)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Name</dt>
                                <dd className="text-gray-900">{formatValue(currentBdo.name || currentBdo.bdoName || selectedDevice.bdoName)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">OTP Mobile</dt>
                                <dd className="text-gray-900">{formatValue(currentBdo.otpMobileNumber || currentBdo.phoneNumber || selectedDevice.otpMobileNumber)}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <MapPin className="h-5 w-5 text-green-600" />
                            <h4 className="font-medium text-gray-900">Current Location</h4>
                        </div>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-gray-500">Shop</dt>
                                <dd className="text-gray-900">{formatValue(currentLocation.shopName || selectedDevice.shopName)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">City</dt>
                                <dd className="text-gray-900">{formatValue(currentLocation.city || selectedDevice.city)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Coordinates</dt>
                                <dd className="text-gray-900 break-all">
                                    {formatValue(currentLocation.latitude ?? selectedDevice.latitude)}, {formatValue(currentLocation.longitude ?? selectedDevice.longitude)}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-start gap-3">
                    <Navigation className="h-5 w-5 text-yellow-700 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="font-medium text-yellow-900">New coordinate action</h4>
                        <p className="text-sm text-yellow-800 mt-1">
                            Enter both fields to update coordinates. Leave both fields blank to reset latitude and longitude to null.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Latitude Optional</label>
                    <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(event) => setLatitude(event.target.value)}
                        placeholder="Example: 24.8607"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Valid range: -90 to 90</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Longitude Optional</label>
                    <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(event) => setLongitude(event.target.value)}
                        placeholder="Example: 67.0011"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Valid range: -180 to 180</p>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason / remarks Optional</label>
                <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    placeholder="Add any remarks for Sales or Operations"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 cursor-pointer">
                <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                    I confirm this IMEI requires a location reset/update and understand the request will be sent to Sales first, then Operations for AKSA portal action.
                </span>
            </label>

            {validation.valid ? (
                <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    <CheckCircle className="h-4 w-4 mt-0.5" />
                    <span>{hasAnyCoordinate ? 'Coordinates will be updated after Operations completion.' : 'Coordinates will be reset to null after Operations completion.'}</span>
                </div>
            ) : validation.message ? (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{validation.message}</span>
                </div>
            ) : null}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-4">
                <button
                    onClick={onPrev}
                    disabled={isFirstStep}
                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Previous
                </button>
                <button
                    onClick={handleNext}
                    disabled={!validation.valid}
                    className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Continue to Review
                </button>
            </div>
        </div>
    );
}

export default LocationChangeDetailsStep;
