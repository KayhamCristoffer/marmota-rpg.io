const mongoose = require('mongoose');

const rankingSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coins:     { type: Number, default: 0 },
  period:    { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  snapshot:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ranking', rankingSchema);
