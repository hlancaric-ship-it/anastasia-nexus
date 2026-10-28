// Štítky produktu z administrácie (metadata.flags). Prijímame len známe kľúče v pevnom poradí.
// „Akcia“ sa neoznačuje ručne: vzniká, keď server vypočíta cenu nižšiu ako bežnú.
export const PRODUCT_FLAGS = Object.freeze({ novinka: 'Novinka', odporucame: 'Odporúčame', bestseller: 'Bestseller' });
export const productFlags = metadata => {
  const raw = Array.isArray(metadata?.flags) ? metadata.flags : [];
  return Object.keys(PRODUCT_FLAGS).filter(k => raw.includes(k));
};
const BADGES = [['onSale', 'Akcia'], ['isNew', 'Novinka'], ['isRecommended', 'Odporúčame'], ['isBestseller', 'Bestseller']];
export const flagBadges = (p, cls = 'product-flags') => {
  const list = BADGES.filter(([k]) => p?.[k] === true);
  return list.length ? `<span class="${cls}">${list.map(([k, label]) => `<span class="product-flag product-flag--${k}">${label}</span>`).join('')}</span>` : '';
};
