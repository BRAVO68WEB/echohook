import { NextRequest } from 'next/server';
import { getApiUrlFromRedis } from '../../../../../libs/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const apiUrl = await getApiUrlFromRedis();
    if (!apiUrl) {
      return new Response('Backend API URL not configured', { status: 503 });
    }

    // Forward the SSE stream from backend
    const backendResponse = await fetch(`${apiUrl}/s/${sessionId}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        // Forward relevant headers from the client request
        'Origin': request.headers.get('origin') || '',
      },
    });

    if (!backendResponse.ok) {
      return new Response(
        `Backend error: ${backendResponse.statusText}`,
        { status: backendResponse.status }
      );
    }

    // Create a readable stream to forward SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Clean up if client disconnects
        backendResponse.body?.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Failed to establish SSE connection', { status: 500 });
  }
}

