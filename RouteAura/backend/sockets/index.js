import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';

let io = null;

/**
 * Room strategy:
 *  - journey:<id>  public room for seat availability + journey status (no personal data is ever emitted here)
 *  - user:<id>     private room; an authenticated socket auto-joins only its own user room
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrls, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // anonymous sockets may watch journeys (public data only)
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
    } catch {
      // invalid token -> treat as anonymous rather than failing the connection
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);

    socket.on('journey:join', (id) => {
      if (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) socket.join(`journey:${id}`);
    });
    socket.on('journey:leave', (id) => {
      if (typeof id === 'string') socket.leave(`journey:${id}`);
    });
  });
  return io;
}

export const getIO = () => io;

export const emitToJourney = (journeyId, event, payload) => io?.to(`journey:${journeyId}`).emit(event, payload);
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);

// Catalog changes (routes, buses, journeys, operators) are announced to every connected screen so lists refresh at once.
// Only the entity name is sent, never data; clients refetch through the normal (permission-checked) API.
let pending = new Set();
let timer = null;
export function emitCatalogUpdate(entity) {
  pending.add(entity);
  if (timer) return;
  timer = setTimeout(() => {
    io?.emit('catalog:update', { entities: [...pending], at: Date.now() });
    pending = new Set();
    timer = null;
  }, 150);
}
