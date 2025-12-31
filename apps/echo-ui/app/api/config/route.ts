import { NextResponse } from 'next/server';
import { getApiUrlFromRedis } from '../../../libs/redis';

export async function GET() {
  // Always try to read from Redis first
  let apiUrl = await getApiUrlFromRedis();

  // Fallback to environment variables if Redis doesn't have it
  if (!apiUrl) {
    apiUrl = process.env.NEXT_PUBLIC_API_URL || 
             process.env.API_URL ||
             process.env.BACKEND_URL ||
             null;
  }

  return NextResponse.json({
    apiUrl,
  });
}

