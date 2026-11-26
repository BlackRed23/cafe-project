'use strict';
// Inventory metadata only: original tests and assertions remain external.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(process.argv[2]);
const smoke = new Set(['auth-registration', 'product-validation', 'inventory-core', 'order-submission', 'purchase-receipt-validation', 'principal-guards', 'security-auth-approval', 'act-01-act-10-read-execution']);
const critical = /auth|security|principal|product-validation|recipe|inventory-core|inventory-consistency|lot-expiry|order-|purchase|purchasing|mock-phase3|mock-workflows|mock-http|mock-recovery|mock-agent-workflow|checkpoint|recovery|retry|act-01|act-real|live-authority|evidence-policy|perception-graph-safety|backend-risk-safety|anomaly-obs-handoff|observation-act-handoff|replanning-existing|p1-tool|p15-integration|dynamic-agent-executor|ai18-backend-proposal/;
const rules = {
  auth: /auth|security|principal|guard/,
  catalog: /product|recipe|ingredient|menu/,
  inventory: /inventory|stock|lot|fefo|expiry|ingredient/,
  sales: /order|payment|sales|storefront|mock-phase3|mock-workflows|mock-http|mock-recovery/,
  purchasing: /purchas|supplier|replenish|reorder|receipt|mock-phase3/,
  agent: /agent|planning|perception|observation|anomaly|explain|tool|act-|memory|session|llm|gemini|ai-|d4-/,
  recovery: /recovery|retry|checkpoint|replay|idempoten|after-commit|mock-phase3|mock-workflows|mock-http/,
  ui: /apps\/web\//,
};
const suites = [];
for (const app of ['api','agent','web']) {
  const dir = path.join(root, 'apps', app, 'tests');
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.test.cjs')).sort()) {
    const file = `apps/${app}/tests/${name}`, bytes = fs.readFileSync(path.join(root,file));
    const source = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const cases = [];
    function visit(node) {
      if (ts.isCallExpression(node) && /^(test|it|test\.(skip|todo|only)|t\.test)$/.test(node.expression.getText(source))) {
        const arg = node.arguments[0];
        cases.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          title: arg && ts.isStringLiteralLike(arg) ? arg.text : arg?.getText(source),
          dynamic: !arg || !ts.isStringLiteralLike(arg) });
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
    const base = name.replace('.test.cjs','');
    const isSmoke = smoke.has(base), core = isSmoke || critical.test(base);
    const modules = Object.entries(rules).filter(([,r]) => r.test(file)).map(([k]) => k);
    if (/mock-(phase3|workflows|http|recovery|agent-workflow)|p15-integration/.test(base)) {
      for (const m of ['auth','catalog','inventory','sales','purchasing','agent','recovery']) if (!modules.includes(m)) modules.push(m);
    }
    if (!modules.length) modules.push(app==='web'?'ui':'agent');
    suites.push({file, sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      tiers: [...(isSmoke ? ['smoke'] : []), ...(core ? ['core'] : []), 'module','full'], modules,
      reason: (core ? 'Critical boundary: ' : 'Affected-module coverage: ') + modules.join(', ') + '. Preserve complete setup and all listed assertions.', cases});
  }
}
const result = {version:'2026.11.26.1', policy:'Overlapping cumulative tiers; suite-level execution; no assertion edits. Static declarations are not runtime case counts.', suites};
fs.mkdirSync(path.join(root,'manifests'),{recursive:true});
fs.writeFileSync(path.join(root,'manifests/regression.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({suites:suites.length, declarations:suites.reduce((n,s)=>n+s.cases.length,0), dynamic:suites.flatMap(s=>s.cases).filter(c=>c.dynamic).length}));
