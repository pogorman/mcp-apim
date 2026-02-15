const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('data/dbo.philly_business_licenses.csv', 'utf-8'),
    crlfDelay: Infinity,
  });
  let lineNum = 0;
  let inMultiLine = false;
  let multiLineStart = 0;
  let lineBuffer = '';

  for await (const line of rl) {
    lineNum++;
    lineBuffer += (lineBuffer ? '\n' : '') + line;
    const qc = (lineBuffer.match(/"/g) || []).length;
    if (qc % 2 !== 0) {
      if (!inMultiLine) {
        multiLineStart = lineNum;
        inMultiLine = true;
      }
      if (lineNum - multiLineStart > 10) {
        console.log('STUCK multi-line field starting at line ' + multiLineStart + ', now at line ' + lineNum);
        console.log('lineBuffer length: ' + lineBuffer.length);
        console.log('First 300 chars: ' + lineBuffer.substring(0, 300));
        break;
      }
      continue;
    }

    if (inMultiLine && lineNum - multiLineStart > 1) {
      console.log('Multi-line field from lines ' + multiLineStart + '-' + lineNum + ' (span: ' + (lineNum - multiLineStart) + ' lines)');
    }
    inMultiLine = false;
    lineBuffer = '';

    if (lineNum > 50000) {
      console.log('No issues found through line 50000');
      break;
    }
  }
  console.log('Processed ' + lineNum + ' lines');
}

main();
