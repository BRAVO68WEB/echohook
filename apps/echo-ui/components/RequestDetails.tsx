'use client';

import { useEffect, useState } from 'react';
import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { constructCURL } from '../libs/curl';
import { TerminalSquare, Copy } from 'lucide-react';

interface WebhookRequest {
  request_id: string;
  method: string;
  path: string;
  query_params: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  ip_address: string;
  user_agent: string;
  timestamp: string;
  content_length: number;
}

interface RequestDetailsProps {
  request: WebhookRequest;
  apiUrl?: string;
}

type Tab = 'headers' | 'body' | 'raw' | 'query';

export default function RequestDetails({ request, apiUrl }: RequestDetailsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('headers');
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [ipCountry, setIpCountry] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchIpCountry = async () => {
      console.log('fetching ip country for', request.ip_address);
      // skip if ip is localhost, 127.0.0.1, or ::1, or 0.0.0.0
      if (request.ip_address === 'localhost' || request.ip_address === '127.0.0.1' || request.ip_address === '::1' || request.ip_address === '0.0.0.0') {
        return;
      }
      try {
        const response = await fetch(`https://ip.b68.dev/${request.ip_address}/json`);
        const data = await response.json();
        setIpCountry(data.country);
      } catch (error) {
        console.error('Error fetching IP country:', error);
      }
    };
    fetchIpCountry();
  }, [request.ip_address]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const formatBody = () => {
    if (!request.body) return 'No body';
    
    if (prettyPrint) {
      try {
        const parsed = JSON.parse(request.body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return request.body;
      }
    }
    return request.body;
  };

  const isJSON = () => {
    try {
      JSON.parse(request.body);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Request Details
          </h2>
          <button
            onClick={() => copyToClipboard(constructCURL({
              method: request.method,
              path: request.path,
              query_params: request.query_params,
              headers: request.headers,
              body: request.body,
              apiUrl: apiUrl,
            }))}
            className="px-3 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <TerminalSquare className="w-4 h-4" />
            Copy CURL
          </button>
        </div>
        <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          <p>
            <span className="font-semibold">Request ID:</span>{' '}
            <code className="font-mono">{request.request_id}</code>
          </p>
          <p>
            <span className="font-semibold">Timestamp:</span> <code className="font-mono">{new Date(request.timestamp).toLocaleString()}</code>
          </p>
          <p>
            <span className="font-semibold">IP Address:</span> <code className="font-mono">{request.ip_address}</code> {ipCountry ? countryCodeToFlagEmoji(ipCountry) : ''}
          </p>
          <p>
            <span className="font-semibold">User-Agent:</span> <code className="font-mono">{request.user_agent}</code>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto scrollbar-hide shrink-0">
        {(['headers', 'body', 'raw', 'query'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-b-2 border-black dark:border-white text-black dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        {activeTab === 'headers' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Headers</h3>
              <button
                onClick={() => copyToClipboard(JSON.stringify(request.headers, null, 2))}
                className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(request.headers).map(([key, value]) => (
                <div
                  key={key}
                  className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="font-semibold text-sm text-black dark:text-zinc-50 mb-1">
                    {key}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 font-mono break-all">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Body</h3>
              <div className="flex items-center gap-2">
                {isJSON() && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={prettyPrint}
                      onChange={(e) => setPrettyPrint(e.target.checked)}
                      className="rounded"
                    />
                    Pretty Print
                  </label>
                )}
                <button
                  onClick={() => copyToClipboard(formatBody())}
                  className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>
            {request.body ? (
              <pre className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-sm font-mono text-black dark:text-zinc-50">
                {formatBody()}
              </pre>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">No body</p>
            )}
          </div>
        )}

        {activeTab === 'query' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Query</h3>
              <button
                onClick={() => copyToClipboard(JSON.stringify(request.query_params, null, 2))}
                className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <pre className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-sm font-mono text-black dark:text-zinc-50">
              {/* Show the query params as a key-value pairs */}
              {Object.entries(request.query_params).map(([key, value]) => (
                <div key={key}>{key}: {value}</div>
              ))}
            </pre>
          </div>
        )}

        {activeTab === 'raw' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Raw Request</h3>
              <button
                onClick={() => copyToClipboard(JSON.stringify(request, null, 2))}
                className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <pre className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-sm font-mono text-black dark:text-zinc-50">
              {JSON.stringify(request, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

