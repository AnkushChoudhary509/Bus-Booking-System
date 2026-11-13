import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User, BusOperator } from '../models/index.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

/** Requires a valid Bearer token. Loads the user and (for operators) the operator profile. */
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Session expired or invalid. Please log in again.', 401);
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError('Account not found or disabled', 401);
  req.user = user;
  if (user.role === 'operator') req.operator = await BusOperator.findOne({ user: user._id });
  next();
});

/** Attaches req.user when a valid token is present, but never rejects (used by public endpoints that personalise). */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7));
      const user = await User.findById(payload.sub);
      if (user && user.isActive) req.user = user;
    } catch {
      /* ignore invalid token on public endpoints */
    }
  }
  next();
});

/** Role-based authorization: restrict('admin', 'operator') */
export const restrict = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError('You do not have permission to do that', 403);
  next();
};

/** Operators may only publish/manage inventory after admin approval. Admins always pass. */
export const requireApprovedOperator = (req, res, next) => {
  if (req.user.role === 'admin') return next();
  if (!req.operator || req.operator.approvalStatus !== 'approved') {
    throw new AppError('Your operator account is awaiting administrator approval', 403);
  }
  next();
};
