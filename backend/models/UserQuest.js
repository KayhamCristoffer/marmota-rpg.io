const mongoose = require('mongoose');

const userQuestSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Quest', required: true },
  status:     {
    type: String,
    enum: ['active', 'pending_review', 'completed', 'rejected', 'failed'],
    default: 'active'
  },
  printUrl:   { type: String, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewNote: { type: String, default: null },
  takenAt:    { type: Date, default: Date.now },
  completedAt:{ type: Date, default: null },
  reviewedAt: { type: Date, default: null }
});

// Índice para evitar pegar a mesma quest duas vezes
userQuestSchema.index({ userId: 1, questId: 1 }, { unique: true });

module.exports = mongoose.model('UserQuest', userQuestSchema);
