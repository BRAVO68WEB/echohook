import { NextRequest, NextResponse } from 'next/server';
import { getApiUrlFromRedis } from '../../../../../libs/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const apiUrl = await getApiUrlFromRedis();
    if (!apiUrl) {
      return NextResponse.json(
        { error: 'Backend API URL not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';

    const response = await fetch(
      `${apiUrl}/r/${sessionId}?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requests' },
      { status: 500 }
    );
  }
}

