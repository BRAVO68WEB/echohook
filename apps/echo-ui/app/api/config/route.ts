import { NextResponse } from 'next/server';

export async function GET() {
  // Read from runtime environment variables (available in Dokploy)
  // Try multiple env var names to support different deployment setups
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
                 process.env.API_URL ||
                 process.env.BACKEND_URL ||
                 null;

  return NextResponse.json({
    apiUrl,
  });
}

