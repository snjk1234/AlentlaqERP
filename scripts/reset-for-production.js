/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const odbc = require('odbc');
const reset = require('../src/lib/production-reset');

const usage = `الاستخدام:
  node scripts/reset-for-production.js --db <ملف.accdb> --template <opening.csv>
      يصدّر قالب الأرصدة الحالية (بنوك/موردون/عملاء/أصناف) لتعديله.
  node scripts/reset-for-production.js --db <ملف.accdb> --opening <opening.csv> [--allow-missing]
      معاينة فقط: يعرض ما سيُحذف وما سيُعاد ضبطه دون أي تغيير.
  node scripts/reset-for-production.js --db <ملف.accdb> --opening <opening.csv> --execute --confirm RESET
      ينفّذ التفريغ بعد إنشاء نسخة احتياطية تلقائية بجوار الملف.`;

function parseArguments(argv) {
  const options = { flags: new Set() };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (['--execute', '--allow-missing'].includes(arg)) options.flags.add(arg.slice(2));
    else if (['--db', '--template', '--opening', '--confirm'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`القيمة مفقودة للخيار ${arg}.`);
      options[arg.slice(2)] = value;
    } else throw new Error(`خيار غير معروف: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.db) { console.log(usage); process.exitCode = 1; return; }
  const dbPath = path.resolve(options.db);
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) throw new Error(`ملف قاعدة البيانات غير موجود: ${dbPath}`);
  const execute = options.flags.has('execute');
  if (execute && (!options.opening || options.confirm !== 'RESET')) {
    throw new Error('التنفيذ يتطلب --opening و--confirm RESET.');
  }
  const openingContent = options.opening ? fs.readFileSync(path.resolve(options.opening), 'utf8') : undefined;
  const backup = execute ? reset.backupDatabase(dbPath) : null;
  if (backup) console.log(`تم إنشاء نسخة احتياطية: ${backup}`);
  const connection = await odbc.connect(`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${dbPath};`);
  try {
    if (options.template) {
      if (fs.existsSync(options.template)) throw new Error('ملف القالب موجود مسبقًا. اختر اسمًا جديدًا.');
      fs.writeFileSync(options.template, await reset.exportTemplate(connection), 'utf8');
      console.log(`تم تصدير القالب: ${options.template}`);
      return;
    }
    const plan = await reset.buildPlan(connection, openingContent);
    console.log('\nالسجلات التي ستُحذف:');
    for (const [model, total] of Object.entries(plan.deletions)) console.log(`  ${model}: ${total}`);
    console.log('\nالأرصدة التي ستُضبط من الملف:');
    for (const [type, config] of Object.entries(reset.ENTITY_TYPES)) {
      console.log(`  ${type} (${config.label}): ${plan.opening.filter(row => row.type === type).length} من ${plan.entities[type].length}`);
    }
    if (plan.missing.length) {
      console.log(`\nتنبيه: ${plan.missing.length} سجلًا غير موجود في الملف، وستبقى قيمه الحالية (والموردون يُضبط رصيدهم على الافتتاحي):`);
      for (const row of plan.missing.slice(0, 20)) console.log(`  ${row.type}: ${row.name}`);
      if (plan.missing.length > 20) console.log(`  ... و${plan.missing.length - 20} آخرين`);
    }
    if (!execute) { console.log('\nمعاينة فقط؛ لم يتغير شيء.'); return; }
    await reset.execute(connection, plan, { allowMissing: options.flags.has('allow-missing') });
    for (const model of reset.TRANSACTION_MODELS) {
      if (await reset.count(connection, model) !== 0) throw new Error(`فشل التحقق: الجدول ${model} غير فارغ.`);
    }
    console.log('\nتم التفريغ والتحقق منه. النسخة الاحتياطية محفوظة كما هي.');
  } finally {
    await connection.close();
  }
}

main().catch(error => { console.error(`خطأ: ${error.message}`); process.exitCode = 1; });
