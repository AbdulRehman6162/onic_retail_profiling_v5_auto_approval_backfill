// --- Premise Relationship Selector Component ---
import React from 'react';

/**
 * Reusable Premise Relationship Selector Component
 * Provides a dropdown for selecting premise relationship type
 */
function PremiseRelationshipSelector({ 
    value, 
    onChange, 
    required = false, 
    className = "",
    disabled = false 
}) {
    const relationshipOptions = [
        { value: '', label: 'Select relationship' },
        { value: 'Owner', label: 'Owner' },
        { value: 'Tenant', label: 'Tenant' },
        { value: 'Partner', label: 'Partner' },
        { value: 'Family Member', label: 'Family Member' }
    ];

    return (
        <div className={className}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Premise Relationship {required && '*'}
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    disabled ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
            >
                {relationshipOptions.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {value && (
                <p className="text-xs text-gray-500 mt-1">
                    {value === 'Owner' && 'The person owns the premises where the device is located'}
                    {value === 'Tenant' && 'The person rents the premises where the device is located'}
                    {value === 'Partner' && 'The person is a business partner in the premises'}
                    {value === 'Family Member' && 'The person is a family member of the premise owner'}
                </p>
            )}
        </div>
    );
}

export default PremiseRelationshipSelector;
