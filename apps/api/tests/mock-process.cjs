// Isolated child for process-loss acceptance. No snapshot restoration or external providers.
const { fixture } = require('./phase3-harness.cjs');
const runtime = fixture();
const server = runtime.app.listen(0, '127.0.0.1', () => {
  process.send({ origin: 'http://127.0.0.1:' + server.address().port, token: runtime.token('admin') });
});
process.on('message', message => {
  if (message === 'stop') server.close(() => process.exit(0));
});
