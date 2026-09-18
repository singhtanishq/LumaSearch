// Worker entry point - Background jobs processor
import { createFastifyServer } from '@luma-search/api';
import { createWorker } from 'bullmq';

async function main() {
  const worker = createWorker();
  
  // Process jobs from BullMQ queues
  worker.process('crawl:fetch', async (job) => {
    // Handle crawl fetch job
    return await worker.processCrawlFetch(job);
  });
  
  worker.process('crawl:parse', async (job) => {
    // Handle crawl parse job
    return await worker.processCrawlParse(job);
  });
  
  worker.process('index:ingest', async (job) => {
    // Handle index ingestion job
    return await worker.processIndexIngest(job);
  });
  
  worker.process('embed:generate', async (job) => {
    // Handle embedding generation job
    return await worker.processEmbedGenerate(job);
  });
  
  worker.process('answer:generate', async (job) => {
    // Handle answer generation job
    return await worker.processAnswerGenerate(job);
  });
  
  console.log('LumaSearch Worker started');
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
