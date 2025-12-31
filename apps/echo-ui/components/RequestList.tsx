'use client';

import { constructCURL } from '@/libs/curl';
import { Copy, Download, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Grid } from 'react-spinners-css'

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

interface RequestListProps {
  requests: WebhookRequest[];
  selectedRequest: WebhookRequest | null;
  onSelectRequest: (request: WebhookRequest) => void;
  ingestionUrlBase?: string;
}

const methodColors: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  POST: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  PUT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PATCH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  HEAD: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  OPTIONS: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function RequestList({
  requests,
  selectedRequest,
  onSelectRequest,
  ingestionUrlBase,
}: RequestListProps) {
  const [filter, setFilter] = useState('');
  const [apiUrl, setApiUrl] = useState<string>('');

  useEffect(() => {
    const fetchApiConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (config.apiUrl) {
          setApiUrl(config.apiUrl);
        }
      } catch (error) {
        console.error('Failed to fetch API config from Redis:', error);
        // Don't set fallback - will use ingestionUrlBase if apiUrl is empty
      }
    };
    fetchApiConfig();
  }, []);

  const filteredRequests = requests.filter((req) => {
    if (!filter) return true;
    const lowerFilter = filter.toLowerCase();
    return (
      req.method.toLowerCase().includes(lowerFilter) ||
      req.path.toLowerCase().includes(lowerFilter) ||
      req.user_agent.toLowerCase().includes(lowerFilter) ||
      Object.keys(req.headers).some((key) => key.toLowerCase().includes(lowerFilter)) ||
      Object.values(req.headers).some((val) => val.toLowerCase().includes(lowerFilter))
    );
  });

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  const exportAsJSON = () => {
    const json = JSON.stringify(requests, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const sessionId = ingestionUrlBase?.split('/').pop() || 'session';
    const filename = 'requests-' + sessionId + '-' + new Date().toISOString() + '.json';
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search/Filter */}
      <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <input
          type="text"
          placeholder="Filter requests..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />
        <button
          onClick={() => exportAsJSON()}
          className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
        >
          Export
          <Download className="w-4 h-4" />
        </button>
      </div>

      {requests.length === 0 && (
        <div className="flex-1 flex items-center justify-center flex-col gap-8">
          <Grid color="var(--color-zinc-500)" />
          <p className="text-zinc-500 dark:text-zinc-400 text-center text-sm">
            No requests captured yet. Send a webhook to the URL above.
          </p>
            <div className="text-zinc-500 dark:text-zinc-400 text-center text-sm flex flex-col items-center justify-center gap-2">
              Example CURL command:
              {/* Word wrap the CURL command */}
              <code className="text-sm font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 p-2 rounded-md whitespace-pre-wrap break-words w-full">{constructCURL({
                method: 'POST',
                path: (ingestionUrlBase || '') + '/name',
                query_params: {},
                headers: {},
                body: '{"name": "John", "email": "john@example.com"}',
                apiUrl: apiUrl,
              })}
            </code>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyToClipboard(constructCURL({
                  method: 'POST',
                  path: (ingestionUrlBase || '') + '/name',
                  query_params: {},
                  headers: {},
                  body: '{"name": "John", "email": "john@example.com"}',
                  apiUrl: apiUrl,
                }))}
                className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 wrap-break-word"
              >
                Copy
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (!apiUrl) {
                    alert('Backend API URL not configured');
                    return;
                  }
                  const sessionId = ingestionUrlBase?.split('/').pop() || '';
                  try {
                    await fetch(`${apiUrl}/i/${sessionId}`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: '{"name": "John", "email": "john@example.com"}',
                    });
                  } catch (error) {
                    console.error('Test request failed:', error);
                  }
                }}
                className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                Test
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredRequests.length === 0 && requests.length > 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400 text-center">
            No requests match your filter.
          </p>
        </div>
      )}

      {/* Request List */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredRequests.map((request) => (
              <div
                key={request.request_id}
                onClick={() => onSelectRequest(request)}
                className={`p-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${
                  selectedRequest?.request_id === request.request_id
                    ? 'bg-zinc-200 dark:bg-zinc-800'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          methodColors[request.method] ||
                          'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                        }`}
                      >
                        {request.method}
                      </span>
                      <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">
                        {ingestionUrlBase && request.path.startsWith(ingestionUrlBase)
                          ? (
                              <>
                                {/* // eslint-disable-next-line react/jsx-no-comment-textnodes */}
                                <span className="text-zinc-500 dark:text-zinc-500 border-2 border-zinc-300 dark:border-zinc-700 rounded-md px-1 py-0.5">WEBHOOK_BASE</span>
                                <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">{request.path.slice(ingestionUrlBase.length) || '/'}</span>
                              </>
                            )
                          : request.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-500">
                      <code className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">{formatTime(request.timestamp)}</code>
                      <code className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">{request.ip_address}</code>
                      {request.content_length > 0 && (
                        <code className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">{(request.content_length / 1024).toFixed(2)} KB</code>
                      )}
                      <code className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">{request.user_agent}</code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
}

