import 'dotenv/config';
import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import { config } from './config/env.js';
import { initSocket } from './sockets/index.js';
import { releaseExpiredLocks } from './services/seatService.js';
import { completePastJourneys } from './services/journeyService.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set in production');
  process.exit(1);
}

const server = http.createServer(app);
initSocket(server);

async function start() {
  await connectDB();

  // Seat locks are also treated as expired at read time; this sweeper tidies the data and notifies watchers.
  setInterval(() => releaseExpiredLocks().catch((e) => console.error('lock sweep failed', e.message)), 30 * 1000);
  setInterval(() => completePastJourneys().catch((e) => console.error('journey sweep failed', e.message)), 5 * 60 * 1000);

  server.listen(config.port, () => console.log(`RouteAura API listening on :${config.port} (${process.env.NODE_ENV || 'development'}, payments: ${config.paymentMode})`));
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
