const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appCode = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
const appUiCode = fs.readFileSync(path.join(__dirname, '..', 'mobile-app.js'), 'utf8');

const requiredFragments = [
  'Naziv, e-mail i lozinka su obavezni.',
  'Lozinka mora imati najmanje 6 znakova.',
  'Neispravan format e-mail adrese.',
  'Neispravan e-mail ili lozinka.',
  'Stavka inventara nije pronađena.',
  'Naziv recepta je obavezan.',
  'Instalacija nije dostupna u ovom pregledniku.'
];

for (const fragment of requiredFragments) {
  assert.ok(appCode.includes(fragment) || appUiCode.includes(fragment), `${fragment} should be present in Croatian.`);
}

console.log('PASS: Croatian user-facing error messages are present.');
