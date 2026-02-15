const fs = require('fs');
const readline = require('readline');

function parseCSVLine(line) {
  const fields = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = i + 1 < line.length ? line[i + 1] : null;
        if (next === '"') { current += '"'; i++; }
        else if (next === ',' || next === null || next === '\n' || next === '\r') { inQuotes = false; }
        else { current += '"'; }
      } else if (ch === '\\' && i + 1 < line.length && line[i + 1] === '"') {
        const afterQuote = i + 2 < line.length ? line[i + 2] : null;
        if (afterQuote === ',' || afterQuote === null || afterQuote === '\n' || afterQuote === '\r') {
          current += '\\'; i++; inQuotes = false;
        } else { current += '"'; i++; }
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

async function main() {
  const csvFile = process.argv[2] || 'data/dbo.philly_business_licenses.csv';
  console.log('Scanning ' + csvFile + '...');
  const rl = readline.createInterface({
    input: fs.createReadStream(csvFile, 'utf-8'),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let rowNum = 0;
  let lineBuffer = '';
  let multiLineStart = 0;
  let maxBufferLen = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue;

    lineBuffer += (lineBuffer ? '\n' : '') + line;
    const parsed = parseCSVLine(lineBuffer);

    if (!parsed.complete) {
      if (!multiLineStart) multiLineStart = lineNum;
      if (lineBuffer.length > 100000) {
        console.log('STUCK at line ' + multiLineStart + ' (buffer: ' + lineBuffer.length + ')');
        console.log('First 300 chars: ' + lineBuffer.substring(0, 300));
        break;
      }
      continue;
    }

    if (multiLineStart) {
      if (lineNum - multiLineStart > 2) {
        console.log('Multi-line row: lines ' + multiLineStart + '-' + lineNum + ' (span: ' + (lineNum - multiLineStart + 1) + ')');
      }
      multiLineStart = 0;
    }

    if (lineBuffer.length > maxBufferLen) maxBufferLen = lineBuffer.length;
    lineBuffer = '';
    rowNum++;
  }

  console.log('Done: ' + lineNum + ' file lines, ' + rowNum + ' data rows');
  console.log('Max line buffer: ' + maxBufferLen + ' chars');
}

main();
