const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  type:         { type: String, enum: ['daily', 'weekly', 'monthly', 'event'], required: true },
  rewardCoins:  { type: Number, required: true },
  rewardXP:     { type: Number, default: 0 },
  maxUsers:     { type: Number, default: null }, // null = ilimitado
  currentUsers: { type: Number, default: 0 },
  minLevel:     { type: Number, default: 1 },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt:    { type: Date, default: null },
  isActive:     { type: Boolean, default: true },
  imageRequired:{ type: Boolean, default: true },
  eventName:    { type: String, default: null }, // para eventos especiais
  createdAt:    { type: Date, default: Date.now }
});

// Virtual para verificar se ainda está disponível
questSchema.virtual('isAvailable').get(function () {
  if (!this.isActive) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.maxUsers !== null && this.currentUsers >= this.maxUsers) return false;
  return true;
});

questSchema.set('toJSON', { virtuals: true });
questSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Quest', questSchema);
