'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import RequestList from '../../../components/RequestList';
import RequestDetails from '../../../components/RequestDetails';
import WebhookURLDisplay from '../../../components/WebhookURLDisplay';
import { Plus, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';

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


export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.uuid as string;
  const [requests, setRequests] = useState<WebhookRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [apiUrl, setApiUrl] = useState<string>('');

  // Fetch API URL from server-side config (for display purposes only)
  useEffect(() => {
    const fetchApiConfig = async () => {
      try {
        const { getApiUrl } = await import('../../../libs/apiUrl');
        const url = await getApiUrl();
        setApiUrl(url);
      } catch (error) {
        console.error('Failed to fetch API config:', error);
        // Don't set a fallback - proxy routes will handle errors
      }
    };
    
    fetchApiConfig();
  }, []);

  // Fetch initial requests and set expiration
  useEffect(() => {
    const fetchRequests = async () => {
      if (!apiUrl) return; // Wait for API URL to be loaded
      
      try {
        const response = await fetch(`${apiUrl}/r/${sessionId}?limit=100`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Session not found or expired');
            return;
          }
          throw new Error('Failed to fetch requests');
        }
        const data = await response.json();
        setRequests(data.requests || []);
        
        // Calculate expiration from localStorage
        const stored = localStorage.getItem('webhook_sessions');
        if (stored) {
          const sessions = JSON.parse(stored);
          const session = sessions.find((s: { session_id: string; created_at: string }) => s.session_id === sessionId);
          if (session && session.created_at) {
            const createdAt = new Date(session.created_at);
            const expires = new Date(createdAt.getTime() + 3 * 60 * 60 * 1000).toISOString();
            setExpiresAt(expires);
            return;
          }
        }
        
        // Fallback: 3 hours from now if not in localStorage
        const expires = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
        setExpiresAt(expires);
      } catch (err) {
        console.error('Error fetching requests:', err);
        setError('Failed to load requests');
      }
    };

    if (sessionId && apiUrl) {
      fetchRequests();
    }
  }, [sessionId, apiUrl]);

  // Update time remaining
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimeRemaining = () => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // SSE connection with reconnection logic
  useEffect(() => {
    if (!sessionId || !apiUrl) return; // Wait for both sessionId and apiUrl

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 1000; // Start with 1 second

    const connect = () => {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(`${apiUrl}/s/${sessionId}`);

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts = 0; // Reset on successful connection
      };

      eventSource.addEventListener('request', (event) => {
        try {
          const newRequest: WebhookRequest = JSON.parse(event.data);
          setRequests((prev) => {
            // Avoid duplicates by checking request_id
            const exists = prev.some((r) => r.request_id === newRequest.request_id);
            if (exists) return prev;
            return [newRequest, ...prev];
          });
        } catch (err) {
          console.error('Error parsing SSE request:', err);
        }
      });

      eventSource.addEventListener('ping', () => {
        // Connection is alive - update connection status
        setIsConnected(true);
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        
        // Only attempt reconnection if we haven't exceeded max attempts
        if (reconnectAttempts < maxReconnectAttempts && eventSource?.readyState === EventSource.CLOSED) {
          const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
          reconnectAttempts++;
          
          reconnectTimeout = setTimeout(() => {
            console.log(`Reconnecting SSE (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
            connect();
          }, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          setError('Failed to maintain SSE connection. Please refresh the page.');
        }
      };
    };

    // Initial connection
    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [sessionId, apiUrl]);

  if (error && requests.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">⚠️ Error Encountered:</h1>
          <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  // Build ingestion URL - use apiUrl if available, otherwise show placeholder
  const ingestionUrl = apiUrl ? `${apiUrl}/i/${sessionId}` : `/i/${sessionId}`;

  function createNewSession(): void {
    router.push(`/`);
  }

  function deleteSession(): void {
    // delete session from localStorage
    const stored = localStorage.getItem('webhook_sessions');
    if (stored) {
      const sessions = JSON.parse(stored);
      const newSessions = sessions.filter((s: { session_id: string }) => s.session_id !== sessionId);
      localStorage.setItem('webhook_sessions', JSON.stringify(newSessions));
    }
    router.push(`/`);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black overflow-hidden">
      <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="shrink-0 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
                <Image
                  src="/webhook.png"
                  alt="Webhook Logo"
                  width={24}
                  height={24}
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
                  EchoHook Session
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1 font-mono">
                  {sessionId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {timeRemaining && (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Expires in: {timeRemaining}
                </div>
              )}
              {/* Create new session button */}
              <button
                onClick={() => createNewSession()}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                Create New Session
                <Plus className="w-4 h-4" />
              </button>
              {/* Delete session button */}
              <button
                onClick={() => deleteSession()}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                Delete
                <Trash className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Panel - Webhook URL and Request List */}
        <div className="w-full lg:w-1/2 border-r border-zinc-200 dark:border-zinc-800 flex flex-col min-h-0">
          <div className="shrink-0 p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
            <WebhookURLDisplay url={ingestionUrl} />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <RequestList
              requests={requests}
              selectedRequest={selectedRequest}
              onSelectRequest={setSelectedRequest}
              ingestionUrlBase={`/i/${sessionId}`}
            />
          </div>
        </div>

        {/* Right Panel - Request Details */}
        <div className="w-full lg:w-1/2 flex flex-col min-h-0 overflow-hidden">
          {selectedRequest ? (
            <RequestDetails request={selectedRequest} apiUrl={apiUrl} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-zinc-500 dark:text-zinc-400">
                Select a request to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

