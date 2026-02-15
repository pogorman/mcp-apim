function parseCSVLine(line) {
  const fields = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '\\' && i + 1 < line.length && line[i + 1] === '"') {
        const afterQuote = i + 2 < line.length ? line[i + 2] : null;
        if (afterQuote === ',' || afterQuote === null) {
          current += '\\';
          i++;
          inQuotes = false;
        } else {
          current += '"'; i++;
        }
      } else if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return { fields, complete: !inQuotes };
}

// Test 1: \" followed by ) then closing " — should treat \" as escaped quote
const t1 = `"FAZAL TAWAB (FOOD COMMISSARY 'E\\")",169469`;
const r1 = parseCSVLine(t1);
console.log('Test 1 (escaped quote mid-field):');
console.log('  complete:', r1.complete);
console.log('  field 0:', r1.fields[0]);
console.log('  field 1:', r1.fields[1]);
console.log();

// Test 2: \" followed by , — should treat " as closing quote
const t2 = `"213188242","COOK SHAWN PATRICK, \\",,,,`;
const r2 = parseCSVLine(t2);
console.log('Test 2 (backslash at end of field):');
console.log('  complete:', r2.complete);
console.log('  field 0:', r2.fields[0]);
console.log('  field 1:', r2.fields[1]);
console.log('  field 2:', r2.fields[2]);
console.log('  total fields:', r2.fields.length);
console.log();

// Test 3: Normal quoted field with comma
const t3 = `"hello, world",next`;
const r3 = parseCSVLine(t3);
console.log('Test 3 (normal quoted field):');
console.log('  complete:', r3.complete);
console.log('  field 0:', r3.fields[0]);
console.log('  field 1:', r3.fields[1]);
console.log();

// Test 4: \" at end of line (multi-line field)
const t4 = `"some text \\"`;
const r4 = parseCSVLine(t4);
console.log('Test 4 (backslash-quote at end of line):');
console.log('  complete:', r4.complete, '(should be true)');
console.log('  field 0:', r4.fields[0]);
