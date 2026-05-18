const LOCATION_HINTS = [
  { tone: 'quarantine', tokens: ['cuarentena', 'quarantine'] },
  { tone: 'sales', tokens: ['venta', 'mostrador', 'sala de ventas', 'sales'] },
  { tone: 'storage', tokens: ['bodega', 'almacen', 'almacén', 'storage'] },
];

const createZeroedSummary = () => ({
  balance: 0,
  externalIn: {
    total: 0,
    purchases: 0,
    returns: 0,
    inboundTransfers: 0,
    positiveAdjustments: 0,
    uncategorized: 0,
  },
  externalOut: {
    total: 0,
    sales: 0,
    outboundTransfers: 0,
    negativeAdjustments: 0,
    uncategorized: 0,
  },
  internal: {
    total: 0,
    quarantineToSales: 0,
    quarantineToStorage: 0,
    storageToSales: 0,
    other: 0,
  },
  returns: {
    total: 0,
  },
  uncategorized: {
    total: 0,
  },
});

const getLocationTone = (loc) => {
  const name = [loc?.name, loc?.warehouses?.name].filter(Boolean).join(' ').toLowerCase();
  const hit = LOCATION_HINTS.find((entry) => entry.tokens.some((token) => name.includes(token)));
  return hit?.tone || 'unknown';
};

const isInternalMovement = (row) => Boolean(row?.is_internal || row?.movement_type === 'INTERNAL_TRANSFER');

export const summarizeKardexRows = (rows = []) => {
  const summary = createZeroedSummary();

  rows.forEach((row) => {
    const qty = Number(row?.quantity) || 0;
    if (!qty) return;

    const absQty = Math.abs(qty);
    const movementType = String(row?.movement_type || '').toUpperCase();
    const originTone = getLocationTone(row?.from_loc);
    const destinationTone = getLocationTone(row?.to_loc);
    const internal = isInternalMovement(row);

    if (!internal) {
      summary.balance += qty;
    }

    if (internal) {
      summary.internal.total += absQty;

      if (originTone === 'quarantine' && destinationTone === 'sales') {
        summary.internal.quarantineToSales += absQty;
        return;
      }

      if (originTone === 'quarantine' && destinationTone === 'storage') {
        summary.internal.quarantineToStorage += absQty;
        return;
      }

      if (originTone === 'storage' && destinationTone === 'sales') {
        summary.internal.storageToSales += absQty;
        return;
      }

      summary.internal.other += absQty;
      return;
    }

    if (movementType === 'RETURN') {
      summary.externalIn.total += absQty;
      summary.externalIn.returns += absQty;
      summary.returns.total += absQty;
      return;
    }

    if (movementType === 'IN_PURCHASE' || movementType === 'PURCHASE_RECEIPT' || movementType === 'RECEIPT') {
      summary.externalIn.total += absQty;
      summary.externalIn.purchases += absQty;
      return;
    }

    if (movementType === 'INBOUND_TRANSFER') {
      summary.externalIn.total += absQty;
      summary.externalIn.inboundTransfers += absQty;
      return;
    }

    if (movementType === 'ADJUSTMENT_IN' || (movementType === 'ADJUSTMENT' && qty > 0)) {
      summary.externalIn.total += absQty;
      summary.externalIn.positiveAdjustments += absQty;
      return;
    }

    if (movementType === 'SALE') {
      summary.externalOut.total += absQty;
      summary.externalOut.sales += absQty;
      return;
    }

    if (movementType === 'OUTBOUND_TRANSFER') {
      summary.externalOut.total += absQty;
      summary.externalOut.outboundTransfers += absQty;
      return;
    }

    if (movementType === 'ADJUSTMENT_OUT' || (movementType === 'ADJUSTMENT' && qty < 0)) {
      summary.externalOut.total += absQty;
      summary.externalOut.negativeAdjustments += absQty;
      return;
    }

    if (qty > 0) {
      summary.externalIn.total += absQty;
      summary.externalIn.uncategorized += absQty;
      summary.uncategorized.total += absQty;
      return;
    }

    summary.externalOut.total += absQty;
    summary.externalOut.uncategorized += absQty;
    summary.uncategorized.total += absQty;
  });

  return summary;
};
