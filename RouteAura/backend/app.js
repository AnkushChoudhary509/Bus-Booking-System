import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1); // Render terminates TLS in front of the app
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/no-origin tools (curl, health checks) and the configured frontends
      if (!origin || config.clientUrls.includes(origin.replace(/\/$/, ''))) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' }));

app.get('/health', (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.status(dbState === 'connected' ? 200 : 503).json({ success: true, status: dbState === 'connected' ? 'ok' : 'degraded', database: dbState, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
});

app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
