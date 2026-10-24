const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');
const oldArr = "['مواسير', 'خراطيم', 'بواط', 'سسته', 'أكواع', 'علب', 'أفيز', 'جلب', 'اسلاك']";
const newArr = "['مواسير', 'خراطيم', 'بواط', 'سسته', 'أكواع', 'علب', 'أفيز', 'جلب', 'اسلاك', 'خيط دبارة']";
content = content.split(oldArr).join(newArr);
fs.writeFileSync('src/app/page.tsx', content);
