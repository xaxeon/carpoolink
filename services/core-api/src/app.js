import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 테스트 엔드포인트
app.get('/', (req, res) => {
    res.json({ message: '2026 Capstone AP - Carpoolink' });
});

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.use(apiRouter);

export default app;
