import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const corsOptions = {
    origin: [
        'http://localhost:3000', 
        'https://carpoolink.duckdns.org'
    ],
    credentials: true, 
};
app.use(cors(corsOptions));

// 테스트 엔드포인트
app.get('/', (req, res) => {
    res.json({ message: '2026 Capstone AP - Carpoolink' });
});

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.use('/api', apiRouter);
app.use(apiRouter);

export default app;