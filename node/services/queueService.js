import { claimNextJob, markDone, markFailed } from '../db/translations.js';
import { translate } from './ollamaService.js';
import { parseOllamaResult } from './parserService.js';

async function processNextJob() {
    const job = await claimNextJob();
    if (!job) return;

    try {
        const raw = await translate(job.input_text, job.type, job.context, job.target_lang);
        const parsed = { raw, ...parseOllamaResult(raw) };
        await markDone(job.id, parsed);
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



