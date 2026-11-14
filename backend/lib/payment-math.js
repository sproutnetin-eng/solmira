'use strict';
// server/lib/payment-math.js
// ALL money is handled as integer paise (1 rupee = 100 paise). Never use floats
// for stored amounts.

function computeSplit(amountPaise, { feePercent }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('Amount must be a positive whole number of paise');
  }
  if (!(feePercent >= 0 && feePercent < 100)) {
    throw new Error('PLATFORM_FEE_PERCENT must be between 0 and 99');
  }
  const platformFee = Math.round((amountPaise * feePercent) / 100);
  const solverAmount = amountPaise - platformFee;
  if (solverAmount <= 0) throw new Error('Split leaves nothing for the solver');
  return { platformFee, solverAmount };
}

module.exports = { computeSplit };

