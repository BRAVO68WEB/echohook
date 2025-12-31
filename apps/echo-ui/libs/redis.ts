import Redis from 'ioredis';

let redis: Redis | null = null;

/**
 * Get or create Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      db: 1
    });

    redis.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  }

  return redis;
}

/**
 * Get API URL from Redis
 */
export async function getApiUrlFromRedis(): Promise<string | null> {
  try {
    const client = getRedisClient();
    const apiUrl = await client.get('config:api_url');
    return apiUrl;
  } catch (error) {
    console.error('Failed to get API URL from Redis:', error);
    return null;
  }
}

