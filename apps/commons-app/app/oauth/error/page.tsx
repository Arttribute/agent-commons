'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { XCircle, AlertTriangle } from 'lucide-react';

function OAuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const message = searchParams.get('message') || 'An unknown error occurred';
  const returnUrl = searchParams.get('returnUrl') || '/studio';

  const handleRetry = () => {
    router.back();
  };

  const handleGoHome = () => {
    router.push(returnUrl);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          {/* Error Icon */}
          <div className="mb-6 flex justify-center">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Connection Failed
          </h1>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We encountered an error while connecting your OAuth account.
          </p>

          {/* Error Message */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                  Error Details
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">
                  {message}
                </p>
              </div>
            </div>
          </div>

          {/* Common Issues */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Common Issues:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>You may have denied permission to the application</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>The authorization request may have expired</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>The OAuth provider may be experiencing issues</span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>

            <button
              onClick={handleGoHome}
              className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>

          {/* Help Text */}
          <p className="mt-6 text-xs text-gray-500 dark:text-gray-500">
            If the problem persists, please contact support or check the OAuth
            provider&apos;s status page.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OAuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">Loading...</div>}>
      <OAuthErrorContent />
    </Suspense>
  );
}
