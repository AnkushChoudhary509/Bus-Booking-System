import { User, BusOperator } from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { notify } from '../services/notificationService.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, orgName, licenseNo } = req.body;
  if (await User.exists({ email })) throw new AppError('An account with this email already exists', 409);

  const user = await User.create({ name, email, phone, role, passwordHash: await User.hashPassword(password) });
  let operator = null;
  if (role === 'operator') {
    operator = await BusOperator.create({ user: user._id, orgName, licenseNo, contactPhone: phone });
    const admins = await User.find({ role: 'admin' }).select('_id');
    await Promise.all(admins.map((a) => notify(a._id, { type: 'operator', title: 'New operator application', body: `${orgName} is awaiting approval.`, link: '/admin' })));
  }
  ok(res, { token: signToken(user), user: user.toSafeJSON(), operator }, 'Account created', 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // same message for unknown email and wrong password (no account enumeration)
  if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('This account has been disabled. Contact support.', 403);
  const operator = user.role === 'operator' ? await BusOperator.findOne({ user: user._id }) : null;
  ok(res, { token: signToken(user), user: user.toSafeJSON(), operator }, 'Logged in');
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user.toSafeJSON(), operator: req.operator || null });
});

export const logout = (req, res) => ok(res, {}, 'Logged out'); // JWTs are stateless: the client discards the token
