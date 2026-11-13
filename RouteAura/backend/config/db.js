import mongoose from 'mongoose';

/**
 * Connects to local MongoDB or MongoDB Atlas depending on DB_MODE.
 *   DB_MODE=local -> MONGODB_LOCAL_URI (default mongodb://127.0.0.1:27017/routeaura)
 *   DB_MODE=atlas -> MONGODB_URI (Atlas connection string, never hardcoded)
 */
export function resolveMongoUri(env = process.env) {
  const mode = (env.DB_MODE || 'local').toLowerCase();
  const uri =
    mode === 'atlas'
      ? env.MONGODB_URI
      : env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/routeaura';
  if (!uri) throw new Error(`Missing connection string for DB_MODE="${mode}". Set MONGODB_URI in your environment.`);
  return { mode, uri };
}

export default async function connectDB(overrideUri) {
  mongoose.set('strictQuery', true);
  if (overrideUri) {
    await mongoose.connect(overrideUri);
    return;
  }
  const { mode, uri } = resolveMongoUri();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected (${mode}): ${mongoose.connection.host}/${mongoose.connection.name}`);
}
