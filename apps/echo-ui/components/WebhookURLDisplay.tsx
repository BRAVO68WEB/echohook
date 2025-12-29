'use client';

import { useState } from 'react';

interface WebhookURLDisplayProps {
  url: string;
}

export default function WebhookURLDisplay({ url }: WebhookURLDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-black dark:text-zinc-50 mb-2">
        Webhook URL
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          readOnly
          className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-black dark:text-zinc-50 font-mono text-sm focus:outline-none"
        />
        <button
          onClick={copyToClipboard}
          className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
        Send HTTP requests to this URL to capture them here
      </p>
    </div>
  );
}

