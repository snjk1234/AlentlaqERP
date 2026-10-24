const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');
content = content.replace(/type: 'PIPE'/g, "type: 'مواسير'");
fs.writeFileSync('src/app/page.tsx', content);
