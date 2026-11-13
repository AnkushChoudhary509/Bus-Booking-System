import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;
const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

/** One shared socket. The app works without it (pages poll / refetch), so failures are silent. */
export function getSocket() {
  if (!socket) {
    socket = io(url, { auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'], reconnectionAttempts: 10 });
  }
  return socket;
}

export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
