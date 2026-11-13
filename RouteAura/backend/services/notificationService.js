import nodemailer from 'nodemailer';
import { Notification, User } from '../models/index.js';
import { emitToUser } from '../sockets/index.js';

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter || null;
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  } else {
    transporter = false; // email disabled
  }
  return transporter || null;
}

async function sendEmail(userId, title, body) {
  const t = getTransporter();
  if (!t) return;
  try {
    const user = await User.findById(userId).select('email name');
    if (!user) return;
    await t.sendMail({
      from: `RouteAura <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `RouteAura: ${title}`,
      text: `Hi ${user.name},\n\n${body || title}\n\n— RouteAura`,
    });
  } catch (err) {
    console.warn('Email send failed (non-fatal):', err.message);
  }
}

/** Creates an in-app notification, pushes it over Socket.IO and (if configured) emails it. */
export async function notify(userId, { type = 'system', title, body, link, email = false }) {
  const n = await Notification.create({ user: userId, type, title, body, link });
  emitToUser(String(userId), 'notification:new', {
    id: n._id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
  });
  if (email) sendEmail(userId, title, body); // fire and forget
  return n;
}

export const notifyMany = (userIds, payload) => Promise.all([...new Set(userIds.map(String))].map((id) => notify(id, payload)));
