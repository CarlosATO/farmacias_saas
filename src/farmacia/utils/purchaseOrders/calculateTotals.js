export const calculatePurchaseOrderTotals = (items = []) => {
  const net = (items || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_cost || 0)), 0);
  const tax = net * 0.19;
  return {
    net,
    tax,
    total: net + tax,
  };
};

export const calculateReceivedTotals = (receiveItems = []) => {
  const subtotal = (receiveItems || []).reduce((sum, item) => {
    const enteredForThisItem = (item.batches || []).reduce((bSum, b) => bSum + Number(b.entered_quantity || 0), 0);
    return sum + (enteredForThisItem * Number(item.unit_cost || 0));
  }, 0);

  const tax = subtotal * 0.19;
  return {
    subtotal,
    tax,
    total: subtotal + tax,
  };
};
