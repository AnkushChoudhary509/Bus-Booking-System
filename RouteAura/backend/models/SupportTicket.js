import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    category: { type: String, enum: ['booking', 'payment', 'refund', 'journey', 'account', 'other'], default: 'other' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 1500 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
    replies: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        authorRole: String,
        message: { type: String, required: true, maxlength: 1500 },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('SupportTicket', supportTicketSchema);
