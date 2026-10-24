const moneyFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const wholeMoneyFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  maximumFractionDigits: 0
});

function formatMoney(value, fractionDigits = 2) {
  return (fractionDigits === 0 ? wholeMoneyFormatter : moneyFormatter).format(Number(value));
}

function normalizeMoneyInput(value) {
  return String(value)
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[,٬\s]/g, '')
    .replace(/٫/g, '.');
}

function groupMoneyInput(value) {
  const raw = normalizeMoneyInput(value);
  if (!/^-?\d*(?:\.\d*)?$/.test(raw)) return raw;
  const [integer, fraction] = raw.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

module.exports = { formatMoney, normalizeMoneyInput, groupMoneyInput };
