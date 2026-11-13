import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, loginAs, registerPassenger, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);

describe('authentication', () => {
  it('registers a passenger and returns a token', async () => {
    const r = await api().post('/api/v1/auth/register').send({ name: 'Asha Verma', email: 'asha@example.test', password: 'Passw0rdOK' });
    expect(r.status).toBe(201);
    expect(r.body.data.token).toBeTruthy();
    expect(r.body.data.user.role).toBe('passenger');
    expect(r.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const r = await api().post('/api/v1/auth/register').send({ name: 'Asha Again', email: 'ASHA@example.test', password: 'Passw0rdOK' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('rejects weak passwords', async () => {
    const r = await api().post('/api/v1/auth/register').send({ name: 'Weak One', email: 'weak@example.test', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('logs in with correct credentials', async () => {
    const { user } = await loginAs('passenger@routeaura.test');
    expect(user.role).toBe('passenger');
  });

  it('rejects wrong password and unknown email with 401', async () => {
    const bad = await api().post('/api/v1/auth/login').send({ email: 'passenger@routeaura.test', password: 'wrong-password1' });
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'nobody@routeaura.test', password: 'Demo@12345' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
  });

  it('requires a token for protected routes', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });
});

describe('role-based access', () => {
  it('blocks passengers from admin and operator areas', async () => {
    const p = await registerPassenger('Role Tester', 'role@example.test');
    expect((await api().get('/api/v1/admin/stats').set(p.auth)).status).toBe(403);
    expect((await api().get('/api/v1/operator/dashboard').set(p.auth)).status).toBe(403);
    expect((await api().post('/api/v1/buses').set(p.auth).send({})).status).toBe(403);
  });

  it('lets an admin read stats', async () => {
    const a = await loginAs('admin@routeaura.test');
    const r = await api().get('/api/v1/admin/stats').set(a.auth);
    expect(r.status).toBe(200);
  });

  it('stops an unapproved operator from adding buses', async () => {
    const op = await loginAs('pending.operator@routeaura.test');
    const r = await api().post('/api/v1/buses').set(op.auth).send({ name: 'Blocked Bus', regNo: 'PB08AB9999', type: 'AC Seater', layoutType: 'seater-2x2', amenities: [] });
    expect(r.status).toBe(403);
  });

  it('lets an approved operator add a bus', async () => {
    const op = await loginAs('operator@routeaura.test');
    const r = await api().post('/api/v1/buses').set(op.auth).send({ name: 'Test Express', regNo: 'JK02TE4321', type: 'AC Seater', layoutType: 'seater-2x2', amenities: ['wifi'] });
    expect(r.status).toBe(201);
    expect(r.body.data.bus.totalSeats).toBe(40);
  });
});

describe('health', () => {
  it('reports database state', async () => {
    const r = await api().get('/health');
    expect(r.status).toBe(200);
    expect(r.body.database).toBe('connected');
  });
});
