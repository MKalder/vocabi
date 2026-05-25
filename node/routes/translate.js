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

router.get('/result/:id', async (req, res) => {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});