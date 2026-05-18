export const roundPrice = (value, step, mode = 'nearest') => {
  const numericValue = Number(value);
  const numericStep = Number(step);

  if (!Number.isFinite(numericValue)) {
    throw new Error('El valor a redondear debe ser numérico.');
  }

  if (!Number.isFinite(numericStep) || numericStep <= 0) {
    throw new Error('El múltiplo de redondeo debe ser mayor que 0.');
  }

  const safeValue = Math.max(0, numericValue);
  const quotient = safeValue / numericStep;

  if (mode === 'up') {
    return Math.max(0, Math.ceil(quotient) * numericStep);
  }

  if (mode === 'down') {
    return Math.max(0, Math.floor(quotient) * numericStep);
  }

  return Math.max(0, Math.round(quotient) * numericStep);
};
