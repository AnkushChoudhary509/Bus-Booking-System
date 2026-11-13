import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

/** Subscribe to a socket event; optionally join a journey room. Safe if the socket never connects. */
export default function useSocketEvent(event, handler, { journeyId } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let s;
    try { s = getSocket(); } catch { return undefined; }
    const fn = (p) => ref.current?.(p);
    const join = () => journeyId && s.emit('journey:join', journeyId);
    s.on(event, fn);
    s.on('connect', join);
    join();
    return () => { s.off(event, fn); s.off('connect', join); if (journeyId) s.emit('journey:leave', journeyId); };
  }, [event, journeyId]);
}
