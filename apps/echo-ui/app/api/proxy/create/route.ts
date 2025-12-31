import { NextRequest, NextResponse } from 'next/server';
import { getApiUrlFromRedis } from '../../../../libs/redis';

export async function POST(request: NextRequest) {
  try {
    const apiUrl = await getApiUrlFromRedis();
    if (!apiUrl) {
      return NextResponse.json(
        { error: 'Backend API URL not configured' },
        { status: 503 }
      );
    }

    const response = await fetch(`${apiUrl}/c`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

