import { Router } from 'express';
import { insertJob, getJob } from '../db/translations.js';

const MAX_TEXT_LENGTH = 100;
const MAX_CONTEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2000;
const ALLOWED_LANGS = ['english', 'german', 'french', 'spanish'];
const ALLOWED_TYPES = ['vocabulary', 'phrase'];

function sanitize(str, maxLength) {
    if (typeof str !== 'string') return null;
    return str.trim().slice(0, maxLength);
}

export const router = Router();

router.post('/', async (req, res) => {

    try {
        const { text, type, context, targetLang, sourceUrl } = req.body;

        // Pflichtfelder
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'text is required' });
        }
        if (!targetLang || !ALLOWED_LANGS.includes(targetLang.toLowerCase())) {
            return res.status(400).json({ error: 'unsupported language' });
        }

        // Länge
        const cleanText = sanitize(text, MAX_TEXT_LENGTH);
        if (cleanText.length < 2) {
            return res.status(400).json({ error: 'text too short' });
        }

        // Wortanzahl
        const wordCount = cleanText.split(/\s+/).length;
        if (wordCount > 7) {
            return res.status(400).json({ error: 'max 7 words allowed' });
        }

        // Typ
        const cleanType = ALLOWED_TYPES.includes(type) ? type : 'vocabulary';

        // Optionale Felder
        const cleanContext = sanitize(context, MAX_CONTEXT_LENGTH);
        const cleanUrl = sanitize(sourceUrl, MAX_URL_LENGTH);

        const jobId = await insertJob(cleanText, cleanType, cleanContext, targetLang, cleanUrl);
        res.json({ jobId });

    } catch (err) {
        console.error('POST /translate error:', err.message);
        res.status(500).json({ error: 'Internal server error' });

    }
});

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