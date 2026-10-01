import { claimNextJob, markDone, markFailed, recoverStuckJobs, failStuckProcessingJobs } from '../db/translations.js';
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

export async function startWorker() {
    const recovered = await recoverStuckJobs();
    if (recovered > 0) {
        console.log(`${recovered} hängengebliebene Jobs beim Start zurückgesetzt`);
    }

    setInterval(processNextJob, 2000);

    setInterval(async () => {
        const failedCount = await failStuckProcessingJobs(5);
        if (failedCount > 0) {
            console.log(`${failedCount} Jobs wegen Timeout auf failed gesetzt`);
        }
    }, 120000);

    console.log('Worker started');
}
