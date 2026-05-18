export const formatPurchaseOrderReference = (poNumber) => {
  if (!poNumber) return 'OC-00000';
  const raw = String(poNumber).replace(/^OC-/, '');
  return `OC-${raw.padStart(5, '0')}`;
};
