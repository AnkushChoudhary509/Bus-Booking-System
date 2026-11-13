export const isProd = () => process.env.NODE_ENV === 'production';

export const config = {
  get port() { return Number(process.env.PORT) || 5000; },
  get clientUrls() {
    return (process.env.CLIENT_URL || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
  },
  get jwtSecret() { return process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me'; },
  get jwtExpiresIn() { return process.env.JWT_EXPIRES_IN || '7d'; },
  /** "mock" (demo gateway, no real money) or "razorpay" (test/live keys required). Explicit, never silently switched. */
  get paymentMode() { return (process.env.PAYMENT_MODE || 'mock').toLowerCase() === 'razorpay' ? 'razorpay' : 'mock'; },
  get seatLockMinutes() { return Number(process.env.SEAT_LOCK_MINUTES) || 10; },
  get razorpayKeyId() { return process.env.RAZORPAY_KEY_ID || ''; },
  get razorpayKeySecret() { return process.env.RAZORPAY_KEY_SECRET || ''; },
};
