import { emitCatalogUpdate } from '../sockets/index.js';

// Which successful write requests change what other screens list. (GPS fixes and seat locks are deliberately absent.)
const RULES = [
  [/^\/routes(\/|$)/, 'route'],
  [/^\/buses(\/|$)/, 'bus'],
  [/^\/journeys$/, 'journey'],
  [/^\/journeys\/[a-f0-9]{24}(\/status)?$/i, 'journey'],
  [/^\/admin\/(operators|buses|routes|journeys|simulation)(\/|$)/, 'admin'],
];

/** After any successful POST/PUT/PATCH/DELETE on catalog data, tell connected clients to refresh. */
export function announceCatalogChanges(req, res, next) {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const hit = RULES.find(([re]) => re.test(req.path));
    if (hit) emitCatalogUpdate(hit[1]);
  });
  next();
}
