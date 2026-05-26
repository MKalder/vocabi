import { claimNextJob, markDone, markFailed } from '../db/translations.js';
import { translate } from './ollamaService.js';

async function processNextJob() {
    const job = await claimNextJob();
    if (!job) return;

    try {
        const result = await translate(job.input_text, job.type, job.context, job.target_lang);
        await markDone(job.id, result);
        console.log(`Job ${job.id} done`);
    } catch (err) {
        await markFailed(job.id, err.message);
        console.error(`Job ${job.id} failed:`, err.message);
    }
}

export function startWorker() {
    setInterval(processNextJob, 2000);
    console.log('Worker started');
}