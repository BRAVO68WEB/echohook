import { getApiUrlSync } from './apiUrl';

export const constructCURL = ({
    method,
    path,
    query_params,
    headers,
    body,
    apiUrl,
}: {
    method: string;
    path: string;
    query_params: Record<string, string>;
    headers: Record<string, string>;
    body: string | object | null;
    apiUrl?: string;
}) => {
    // Use provided apiUrl, or detect from window.location using consistent logic
    const baseUrl = apiUrl || getApiUrlSync();
    
    // Construct base URL
    let url = `${baseUrl}${path}`;
    
    // Add query parameters if any
    const searchParams = new URLSearchParams();
    Object.entries(query_params).forEach(([key, value]) => {
        if (key) searchParams.append(key, value);
    });
    
    const queryString = searchParams.toString();
    if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
    }

    const parts = [`curl -X ${method.toUpperCase()} '${url}'`];

    // Add headers, skipping those that curl adds automatically or shouldn't be overridden usually
    // but for replayability we often want most of them. 
    // We'll skip internal/meta headers if any were captured.
    Object.entries(headers).forEach(([key, value]) => {
        // Normalize header keys to avoid duplicates like 'Content-Length' vs 'content-length'
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'content-length') return; // curl calculates this
        
        // Escape single quotes in header values
        const escapedValue = value.replace(/'/g, "'\\''");
        parts.push(`-H '${key}: ${escapedValue}'`);
    });

    // Handle body
    if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        let bodyStr = '';
        if (typeof body === 'object') {
            bodyStr = JSON.stringify(body);
        } else {
            bodyStr = body;
        }

        if (bodyStr) {
            // Escape single quotes for the shell command
            const escapedBody = bodyStr.replace(/'/g, "'\\''");
            parts.push(`-d '${escapedBody}'`);
        }
    }

    return parts.join(' \\\n  ');
};