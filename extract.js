const fs = require('fs');
const readline = require('readline');
const path = 'C:/Users/Admin/.gemini/antigravity-ide/brain/c6c08023-573d-4409-926f-f4bb6ebbae2a/.system_generated/logs/transcript.jsonl';

async function processLineByLine() {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const linesByNumber = new Map();

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.content && obj.content.includes('AdminInventoryPage.tsx')) {
        const text = obj.content;
        const matchLines = text.match(/^(\d+):\s(.*)$/gm);
        if (matchLines) {
          for (const ml of matchLines) {
            const firstColon = ml.indexOf(':');
            const lineNum = parseInt(ml.substring(0, firstColon));
            const lineContent = ml.substring(firstColon + 2);
            linesByNumber.set(lineNum, lineContent);
          }
        }
      }
    } catch (e) {}
  }
  
  const sortedKeys = Array.from(linesByNumber.keys()).sort((a, b) => a - b);
  let result = '';
  for (const k of sortedKeys) {
    result += linesByNumber.get(k) + '\n';
  }
  
  fs.writeFileSync('extracted_AdminInventoryPage.tsx', result);
  console.log(`Extracted ${sortedKeys.length} lines. Max line: ${sortedKeys[sortedKeys.length - 1]}`);
}
processLineByLine();
