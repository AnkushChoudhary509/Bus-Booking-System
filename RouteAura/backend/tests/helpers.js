import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app.js';
import { seed } from '../seeders/seed.js';

let mongod;

/** Starts an in-memory MongoDB (single-node replica set, so transactions work) and seeds demo data. */
export async function startDb() {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  await seed({ log: () => {} });
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}

export const api = () => request(app);
export const PASSWORD = 'Demo@12345';

export async function loginAs(email, password = PASSWORD) {
  const r = await api().post('/api/v1/auth/login').send({ email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.data.token, user: r.body.data.user, auth: { Authorization: `Bearer ${r.body.data.token}` } };
}

export async function registerPassenger(name, email) {
  const r = await api().post('/api/v1/auth/register').send({ name, email, password: 'Passw0rdOK', role: 'passenger' });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.data.token, user: r.body.data.user, auth: { Authorization: `Bearer ${r.body.data.token}` } };
}

/** Finds a bookable future journey with plenty of free seats. */
export async function findOpenJourney(minFree = 6) {
  const { Journey } = await import('../models/index.js');
  const list = await Journey.find({ status: 'scheduled', departure: { $gt: new Date(Date.now() + 36 * 3600 * 1000) } }).limit(50);
  const j = list.find((x) => x.seats.filter((s) => s.status === 'available').length >= minFree);
  if (!j) throw new Error('No open journey in seed data');
  return j;
}

export const freeSeats = (j, n) => j.seats.filter((s) => s.status === 'available').slice(0, n).map((s) => s.number);
export const pax = (n, who = 'Test Rider') => Array.from({ length: n }, (_, i) => ({ name: `${who} ${i + 1}`, age: 30, gender: 'other' }));
