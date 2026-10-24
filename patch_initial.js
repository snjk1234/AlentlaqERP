const fs = require('fs');

let text = fs.readFileSync('src/app/page.tsx', 'utf8');

text = text.replace(
  /customerType:\s*'CASH',\s*discount:\s*'0'\s*\}/g,
  "customerType: 'CASH', discount: '0', openingBalance: '0' }"
);

text = text.replace(
  /maxStockQty:\s*'1000'\s*\}/g,
  "maxStockQty: '1000', pricePerKilo: '0' }"
);

fs.writeFileSync('src/app/page.tsx', text);
console.log('Done mapping.');
