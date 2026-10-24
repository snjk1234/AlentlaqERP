const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/bg-entlaq-red/g, 'bg-entlaq-primary');
content = content.replace(/border-entlaq-red/g, 'border-entlaq-primary');
content = content.replace(/text-entlaq-red/g, 'text-entlaq-primary');

content = content.replace(/hover:bg-red-600/g, 'hover:bg-teal-500');
content = content.replace(/shadow-red-500\/20/g, 'shadow-teal-500/20');
content = content.replace(/shadow-red-500\/30/g, 'shadow-teal-500/30');
content = content.replace(/shadow-red-500\/10/g, 'shadow-teal-500/10');
content = content.replace(/focus:border-red-500/g, 'focus:border-teal-500');
content = content.replace(/selection:bg-red-500/g, 'selection:bg-teal-500');

content = content.replace(/rounded-3xl/g, 'rounded');
content = content.replace(/rounded-2xl/g, 'rounded');
content = content.replace(/rounded-xl/g, 'rounded-sm');
content = content.replace(/rounded-lg/g, 'rounded-sm');
content = content.replace(/rounded-full/g, 'rounded-sm');

content = content.replace(/\bp-8\b/g, 'p-4');
content = content.replace(/\bp-6\b/g, 'p-3');
content = content.replace(/\bp-5\b/g, 'p-2');
content = content.replace(/\bp-4\b/g, 'p-2');
content = content.replace(/\bpx-8\b/g, 'px-4');
content = content.replace(/\bpx-6\b/g, 'px-3');
content = content.replace(/\bpy-6\b/g, 'py-3');
content = content.replace(/\bpy-4\b/g, 'py-2');
content = content.replace(/\bpy-3\.5\b/g, 'py-1.5');
content = content.replace(/\bpy-3\b/g, 'py-1.5');
content = content.replace(/\bpx-4\b/g, 'px-2');
content = content.replace(/\bpx-5\b/g, 'px-2.5');

content = content.replace(/\bgap-8\b/g, 'gap-4');
content = content.replace(/\bgap-6\b/g, 'gap-3');
content = content.replace(/\bgap-4\b/g, 'gap-2');
content = content.replace(/\bgap-3\b/g, 'gap-1.5');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Restyling completed successfully.');
