const UNIT_INFO = {
  g: { group: 'mass', factor: 1 },
  kg: { group: 'mass', factor: 1000 },
  ml: { group: 'volume', factor: 1 },
  l: { group: 'volume', factor: 1000 },
};

const getUnitInfo = (unit) => UNIT_INFO[String(unit || '').trim().toLowerCase()] || null;

// Pretvara količinu između g/kg i ml/l; za ostale jedinice vraća količinu nepromijenjenu.
const convertQuantity = (quantity, fromUnit, toUnit) => {
  const value = Number(quantity ?? 0);
  const from = getUnitInfo(fromUnit);
  const to = getUnitInfo(toUnit);

  if (from && to && from.group === to.group) {
    return (value * from.factor) / to.factor;
  }

  return value;
};

module.exports = { convertQuantity };
