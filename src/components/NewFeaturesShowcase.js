// Enhanced Features Demo Component
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, AlertTriangle, Clock, Shield, Bell, Zap, Database, FileText } from 'lucide-react';

const NewFeaturesShowcase = ({ appServices, user }) => {
    const [activeFeature, setActiveFeature] = useState('logging');

    const features = [
        {
            id: 'logging',
            title: 'Comprehensive Action Logging',
            icon: Database,
            color: 'blue',
            description: 'Every action is automatically logged for complete audit trails',
            capabilities: [
                'User login/logout tracking',
                'Request creation and modifications',
                'Status change history',
                'Error tracking and debugging',
                'Security event monitoring'
            ],
            status: appServices?.actionLogger ? 'Active' : 'Initializing'
        },
        {
            id: 'conflicts',
            title: 'Intelligent Conflict Resolution',
            icon: Shield,
            color: 'green',
            description: 'Prevents IMEI conflicts and ensures data integrity',
            capabilities: [
                'Atomic IMEI claiming',
                'Concurrent request prevention',
                'BDO validation checks',
                'Transfer ownership validation',
                'Franchise limit enforcement'
            ],
            status: appServices?.conflictResolver ? 'Active' : 'Initializing'
        },
        {
            id: 'notifications',
            title: 'Real-time Notifications',
            icon: Bell,
            color: 'purple',
            description: 'Instant alerts for status changes and important events',
            capabilities: [
                'Push notifications',
                'Email alerts',
                'In-app notifications',
                'Role-based messaging',
                'System announcements'
            ],
            status: appServices?.notificationSystem ? 'Active' : 'Initializing'
        },
        {
            id: 'workflow',
            title: 'Enhanced Workflow Management',
            icon: Zap,
            color: 'orange',
            description: 'Automated approval workflows with complete tracking',
            capabilities: [
                'Multi-stage approval process',
                'Automatic status transitions',
                'Comment system',
                'Hold/Resume functionality',
                'Completion tracking'
            ],
            status: appServices?.workflowManager ? 'Active' : 'Initializing'
        },
        {
            id: 'requests',
            title: 'New Request Types',
            icon: FileText,
            color: 'indigo',
            description: 'Support for all BVS device lifecycle management',
            capabilities: [
                'New Device Mapping',
                'Transfer of Ownership',
                'OTP Number Change',
                'Device De-mapping',
                'Batch operations'
            ],
            status: 'Active'
        }
    ];

    const getStatusColor = (status) => {
        switch (status) {
            case 'Active': return 'text-green-600 bg-green-100';
            case 'Initializing': return 'text-yellow-600 bg-yellow-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const getFeatureColor = (color) => {
        const colors = {
            blue: 'border-blue-200 bg-blue-50',
            green: 'border-green-200 bg-green-50',
            purple: 'border-purple-200 bg-purple-50',
            orange: 'border-orange-200 bg-orange-50',
            indigo: 'border-indigo-200 bg-indigo-50'
        };
        return colors[color] || colors.blue;
    };

    const getIconColor = (color) => {
        const colors = {
            blue: 'text-blue-600',
            green: 'text-green-600',
            purple: 'text-purple-600',
            orange: 'text-orange-600',
            indigo: 'text-indigo-600'
        };
        return colors[color] || colors.blue;
    };

    const selectedFeature = features.find(f => f.id === activeFeature);

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
                <h2 className="text-2xl font-bold mb-2">🚀 Enhanced BVS System Features</h2>
                <p className="text-blue-100">
                    Your application now includes advanced capabilities for enterprise-grade device management
                </p>
            </div>

            <div className="p-6">
                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <div
                                key={feature.id}
                                onClick={() => setActiveFeature(feature.id)}
                                className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                                    activeFeature === feature.id 
                                        ? getFeatureColor(feature.color)
                                        : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <Icon className={`w-6 h-6 ${getIconColor(feature.color)}`} />
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(feature.status)}`}>
                                        {feature.status}
                                    </span>
                                </div>
                                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                                <p className="text-sm text-gray-600">{feature.description}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Detailed Feature View */}
                {selectedFeature && (
                    <div className="border rounded-lg p-6 bg-gray-50">
                        <div className="flex items-center mb-4">
                            <selectedFeature.icon className={`w-8 h-8 mr-3 ${getIconColor(selectedFeature.color)}`} />
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">{selectedFeature.title}</h3>
                                <p className="text-gray-600">{selectedFeature.description}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-3">Capabilities:</h4>
                                <ul className="space-y-2">
                                    {selectedFeature.capabilities.map((capability, index) => (
                                        <li key={index} className="flex items-center text-sm text-gray-700">
                                            <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                                            {capability}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold text-gray-900 mb-3">System Status:</h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                                        <span className="text-sm font-medium">Service Status</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedFeature.status)}`}>
                                            {selectedFeature.status}
                                        </span>
                                    </div>
                                    
                                    {selectedFeature.id === 'logging' && appServices?.actionLogger && (
                                        <div className="flex items-center justify-between p-3 bg-white rounded border">
                                            <span className="text-sm font-medium">User Session</span>
                                            <span className="text-xs text-gray-600">
                                                {appServices.actionLogger.user?.name || 'Active'}
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                                        <span className="text-sm font-medium">Integration</span>
                                        <span className="text-xs text-green-600 font-semibold">Connected</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Demo Actions */}
                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-3">Try It Out:</h4>
                            <div className="flex flex-wrap gap-3">
                                {selectedFeature.id === 'logging' && (
                                    <button
                                        onClick={async () => {
                                            if (appServices?.actionLogger) {
                                                await appServices.actionLogger.logAction({
                                                    type: 'DEMO',
                                                    description: 'User tested action logging feature',
                                                    category: 'SYSTEM',
                                                    target: {
                                                        entityType: 'system',
                                                        entityId: 'demo',
                                                        entityIdentifier: 'feature-test'
                                                    },
                                                    severity: 'INFO'
                                                });
                                                toast.success('Action logged successfully!');
                                            }
                                        }}
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                    >
                                        Test Action Log
                                    </button>
                                )}
                                
                                {selectedFeature.id === 'notifications' && (
                                    <button
                                        onClick={() => {
                                            toast.success('🔔 This is a sample notification!', {
                                                duration: 4000,
                                                style: {
                                                    background: '#10b981',
                                                    color: 'white'
                                                }
                                            });
                                        }}
                                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                                    >
                                        Test Notification
                                    </button>
                                )}
                                
                                <button
                                    onClick={() => {
                                        toast.info(`${selectedFeature.title} is ready to use!`);
                                    }}
                                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                                >
                                    Feature Info
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Start Guide */}
                <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">🎯 What You Can Do Now:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">For Franchises:</h4>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li>• Create requests with automatic conflict detection</li>
                                <li>• Track all request changes in real-time</li>
                                <li>• Receive instant notifications on status updates</li>
                                <li>• Transfer device ownership seamlessly</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">For Sales & Operations:</h4>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li>• Enhanced approval workflows</li>
                                <li>• Complete audit trails for compliance</li>
                                <li>• Automated notification system</li>
                                <li>• Advanced analytics and reporting</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewFeaturesShowcase;
