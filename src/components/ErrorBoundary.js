import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log the error for debugging
        console.error('🚨 Error Boundary caught an error:', error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            // Fallback UI
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                Something went wrong
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                                The application encountered an unexpected error. Please try refreshing the page.
                            </p>
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                            >
                                Refresh Page
                            </button>
                            
                            {/* Show error details in development */}
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <details className="mt-4 text-left">
                                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                                        Error Details (Development Only)
                                    </summary>
                                    <div className="mt-2 p-3 bg-red-50 rounded border text-xs font-mono">
                                        <div className="text-red-800 font-semibold mb-2">Error:</div>
                                        <div className="text-red-700 mb-3">{this.state.error.toString()}</div>
                                        <div className="text-red-800 font-semibold mb-2">Stack Trace:</div>
                                        <pre className="text-red-600 whitespace-pre-wrap text-xs overflow-auto max-h-32">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
