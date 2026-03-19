/**
 * CommonsClient — only used for legacy imports that haven't been converted yet.
 * All API calls should go through Next.js proxy routes in /app/api/.
 * No secret key is passed here; auth is handled server-side via NEST_API_SECRET_KEY.
 */

import { CommonsClient } from '@agent-commons/sdk';

const apiUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL ?? 'http://localhost:3001';

// No apiKey here — browser should never hold the secret key.
// All authenticated calls go through /app/api/* proxy routes.
export const commons = new CommonsClient({ baseUrl: apiUrl });
