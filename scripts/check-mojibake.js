const fs = require('fs');
const path = require('path');

const roots = ['app', 'components', 'constants', 'docs', 'scripts', 'src', 'supabase'];
const extensions = new Set(['.js', '.json', '.md', '.mjs', '.mts', '.sql', '.ts', '.tsx']);
const suspicious = /\u00c3|\u00c2|\u00e2(?:[\u0080-\u00bf\u2010-\u203a])|\u00ef\u00bf\u00bd|\ufffd/u;
const failures = [];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(file);
    } else if (extensions.has(path.extname(file))) {
      const text = fs.readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, index) => {
        if (suspicious.test(line)) failures.push(`${file}:${index + 1}`);
      });
    }
  }
}

roots.filter(fs.existsSync).forEach(scan);

if (failures.length) {
  console.error(`Likely mojibake found:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log('No likely mojibake found.');
