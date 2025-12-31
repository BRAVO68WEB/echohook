'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import LightRays from '../components/LightRays';

interface Session {
  session_id: string;
  ingestion_url: string;
  stream_url: string;
  requests_url: string;
  expires_at: string;
}

interface RecentSession {
  session_id: string;
  ingestion_url: string;
  created_at: string;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  useEffect(() => {
    // Load recent sessions from localStorage
    const stored = localStorage.getItem('webhook_sessions');

    // delete all previous sessions older than 3 hours
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const sessions = stored ? JSON.parse(stored) : [];
    const recentSessions = sessions.filter((session: RecentSession) => new Date(session.created_at) > threeHoursAgo);
    localStorage.setItem('webhook_sessions', JSON.stringify(recentSessions));

    setRecentSessions(recentSessions.slice(0, 10)); // Last 10 sessions
  }, []);

  // Auto-detect API URL: use env var, or detect from current hostname
  const getApiUrl = () => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  };

  const createSession = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/c`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const session: Session = await response.json();

      // Save to localStorage
      const stored = localStorage.getItem('webhook_sessions');
      const sessions: RecentSession[] = stored ? JSON.parse(stored) : [];
      sessions.unshift({
        session_id: session.session_id,
        ingestion_url: session.ingestion_url,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem('webhook_sessions', JSON.stringify(sessions.slice(0, 10)));

      // Redirect to session page
      router.push(`/session/${session.session_id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col bg-zinc-50 dark:bg-black overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <LightRays />
      </div>
      
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/webhook.png"
              alt="Webhook Logo"
              width={120}
              height={120}
              className="dark:invert-0 shadow-2xl rounded-2xl"
              priority
            />
          </div>

          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-5xl mb-4">
              EchoHook
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              Create temporary webhook endpoints to test and inspect incoming HTTP requests in real-time.
              Perfect for debugging webhook integrations.
            </p>
          </div>

          {/* Create Session Button */}
          <div className="flex justify-center mb-12">
            <button
              onClick={createSession}
              disabled={loading}
              className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold text-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
            >
              {loading ? 'Creating...' : 'Create New Session'}
            </button>
          </div>

          {/* Recent Sessions */}
          {recentSessions.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Recent Sessions
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {recentSessions.map((session) => (
                  <div
                    key={session.session_id}
                    onClick={() => router.push(`/session/${session.session_id}`)}
                    className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-zinc-600 dark:text-zinc-400 truncate">
                          {session.session_id}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                          {new Date(session.created_at).toLocaleString()}
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-zinc-400 dark:text-zinc-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
