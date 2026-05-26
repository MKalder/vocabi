import { Router } from 'express';
import { insertJob, getJob } from '../db/translations.js';

export const router = Router();

router.post('/', async (req, res) => {
    const { text, targetLang, sourceUrl } = req.body;

    if (!text || !targetLang) {
        return res.status(400).json({ error: 'text and targetLang are required' });
    }

    const jobId = await insertJob(text, targetLang, sourceUrl);
    res.json({ jobId });
});

// router.get('/result/:id', async (req, res) => {
//     const job = await getJob(req.params.id);
//     if (!job) return res.status(404).json({ error: 'Job not found' });
//     res.json(job);
// });

router.get('/stream/:id', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const interval = setInterval(async () => {
        const job = await getJob(req.params.id);
        if (!job) {
            clearInterval(interval);
            send({ error: 'Job not found' });
            return res.end();
        }

        if (job.status === 'done') {
            clearInterval(interval);
            send({ status: 'done', result: job.result });
            return res.end();
        }

        if (job.status === 'failed') {
            clearInterval(interval);
            send({ status: 'failed', error: job.error });
            return res.end();
        }
    }, 1000);

    req.on('close', () => clearInterval(interval));
});