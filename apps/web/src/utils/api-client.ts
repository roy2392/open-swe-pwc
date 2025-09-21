/**
 * Centralized API client with consistent configuration
 */

function getBaseApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
  let baseApiUrl = new URL(apiUrl).href;
  baseApiUrl = baseApiUrl.endsWith("/") ? baseApiUrl : `${baseApiUrl}/`;

  // Log warning if port might be mismatched
  if (typeof window !== 'undefined') {
    const currentPort = window.location.port || '80';
    const apiPort = new URL(apiUrl).port || '80';

    if (currentPort !== '80' && apiPort !== currentPort && currentPort !== '3000') {
      console.warn(`⚠️ Potential port mismatch: Frontend on ${currentPort}, API configured for ${apiPort}`);
    }
  }

  return baseApiUrl;
}

/**
 * Configured fetch with consistent options for authenticated API calls
 */
export async function apiClient(url: string, options: RequestInit = {}) {
  const defaultOptions: RequestInit = {
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  const fullUrl = url.startsWith('http') ? url : `${getBaseApiUrl()}${url.replace(/^\//, '')}`;

  try {
    const response = await fetch(fullUrl, mergedOptions);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      throw new Error(`API Error ${response.status}: ${JSON.stringify(errorData)}`);
    }

    return response;
  } catch (error) {
    console.error(`API request failed: ${fullUrl}`, error);
    throw error;
  }
}

/**
 * GitHub-specific API client with proper authentication headers
 */
export async function githubApiClient(path: string, options: RequestInit = {}) {
  const githubOptions: RequestInit = {
    ...options,
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "OpenSWE-Agent",
      ...options.headers,
    },
  };

  return apiClient(`github/proxy/${path}`, githubOptions);
}