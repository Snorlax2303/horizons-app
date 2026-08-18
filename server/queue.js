import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export function createQueue(redisUrl) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  return { connection, automationQueue: new Queue('iptv-automation', { connection }) };
}
