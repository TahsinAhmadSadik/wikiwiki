const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('wiki_token');

  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // 1. Automatically inject JWT bearer token if present in storage
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 2. Adjust headers if payload is FormData (e.g. file uploads in Editor / Profile)[cite: 15]
  if (options.body instanceof FormData) {
    // Binary File Uploads
    delete headers['Content-Type'];
  } else if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
  }

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 3. Intercept 401 Unauthorized (expired or revoked via token_version)
    if (response.status === 401) {
      localStorage.removeItem('wiki_token');
      localStorage.removeItem('wiki_user');
      
      // Notify application listeners (e.g., AuthContext) without forcing a hard page reload
      window.dispatchEvent(new CustomEvent('wiki:unauthorized'));
    }

    // Parse JSON payload or fallback to null for empty responses (e.g., 204 No Content)
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        data?.message || `Request failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network errors, DNS resolution failures, or offline state
    throw new ApiError(error.message || 'Network connection failed', 0, null);
  }
}

// Convenience methods
export const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};