export const normalizeBranchPricing = (product = {}, branchConfig = null) => {
  const productBasePrice = Number(product?.price_sale ?? 0) || 0;
  const corporatePrice = productBasePrice > 0 ? productBasePrice : 0;
  const overrideValue = branchConfig?.override_sale_price ?? null;
  const useLocalPrice = Boolean(branchConfig?.use_local_price);
  const active = branchConfig?.active !== false;
  const hasLocalOverride = active && useLocalPrice && overrideValue !== null && overrideValue !== undefined && overrideValue !== '';
  const localOverridePrice = hasLocalOverride ? Number(overrideValue) || 0 : 0;
  const effectivePrice = hasLocalOverride ? localOverridePrice : corporatePrice;

  return {
    corporatePrice,
    localOverridePrice,
    effectivePrice,
    useLocalPrice,
    active,
    hasLocalOverride,
    pricingSource: hasLocalOverride ? 'LOCAL' : 'CORPORATE',
  };
};

export const getBranchPricingStatusLabel = (pricing) => {
  if (pricing?.hasLocalOverride) return 'Precio local activo';
  return 'Usando precio corporativo';
};
