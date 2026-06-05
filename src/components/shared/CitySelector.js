// --- City Selector Component ---
import React, { useState, useEffect } from 'react';

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
 * Reusable City Selector Component
 * Provides a dropdown with search functionality for Pakistani cities
 * Also includes option for manual city input
 */
function CitySelector({ 
    value, 
    onChange, 
    required = false, 
    placeholder = "Select a city...",
    className = "",
    disabled = false 
}) {
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
    const [citySearchTerm, setCitySearchTerm] = useState('');
    const [filteredCities, setFilteredCities] = useState(PAKISTAN_CITIES);
    const [showManualCityInput, setShowManualCityInput] = useState(false);

    // Filter cities based on search term
    useEffect(() => {
        if (citySearchTerm) {
            const filtered = PAKISTAN_CITIES.filter(city => 
                city.toLowerCase().includes(citySearchTerm.toLowerCase())
            );
            setFilteredCities(filtered);
        } else {
            setFilteredCities(PAKISTAN_CITIES);
        }
    }, [citySearchTerm]);

    // Close dropdown when clicking outside
    useEffect(() => {
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
     * Handle city selection from dropdown
     */
    const handleCitySelect = (city) => {
        onChange(city);
        setCityDropdownOpen(false);
        setCitySearchTerm('');
        setShowManualCityInput(false);
    };

    /**
     * Handle manual city input toggle
     */
    const handleManualCityToggle = () => {
        setShowManualCityInput(true);
        setCityDropdownOpen(false);
        onChange('');
    };

    return (
        <div className={`city-dropdown-container ${className}`}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                City {required && '*'}
            </label>
            {!showManualCityInput ? (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => !disabled && setCityDropdownOpen(!cityDropdownOpen)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex justify-between items-center ${
                            disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-gray-400'
                        }`}
                    >
                        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
                            {value || placeholder}
                        </span>
                        {!disabled && (
                            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                    
                    {cityDropdownOpen && !disabled && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            <div className="p-2">
                                <input
                                    type="text"
                                    placeholder="Search cities..."
                                    value={citySearchTerm}
                                    onChange={(e) => setCitySearchTerm(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                            {filteredCities.length > 0 ? (
                                <>
                                    {filteredCities.map(city => (
                                        <button
                                            key={city}
                                            type="button"
                                            onClick={() => handleCitySelect(city)}
                                            className="w-full px-3 py-2 text-left hover:bg-gray-100 text-sm focus:bg-gray-100 focus:outline-none"
                                        >
                                            {city}
                                        </button>
                                    ))}
                                    <div className="border-t border-gray-200 p-2">
                                        <button
                                            type="button"
                                            onClick={handleManualCityToggle}
                                            className="text-blue-600 hover:text-blue-700 text-sm"
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
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Enter city name manually"
                        disabled={disabled}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            disabled ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                    />
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowManualCityInput(false);
                                onChange('');
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700"
                        >
                            ← Back to city list
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default CitySelector;
export { PAKISTAN_CITIES };
