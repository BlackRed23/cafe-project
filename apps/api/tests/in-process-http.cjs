// Runs real Express middleware with Node HTTP request/response objects, without sockets.
const { Duplex } = require('node:stream');
const { IncomingMessage, ServerResponse } = require('node:http');

exports.request = (app, route, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
        const req = new IncomingMessage(socket);
        Object.assign(req, { method, url: route, headers: { host: 'localhost', ...headers }, httpVersionMajor: 1, httpVersionMinor: 1 });
        const payload = body === undefined ? undefined : Buffer.from(body);
        if (payload) req.headers['content-length'] = String(payload.length);
        const res = new ServerResponse(req);
        res.assignSocket(socket);
        res.useChunkedEncodingByDefault = false;
        const timeout = setTimeout(() => reject(new Error('In-process request timed out')), 5000);
        res.on('error', reject);
        res.on('finish', () => {
            clearTimeout(timeout);
            const raw = Buffer.concat(chunks).toString('utf8');
            const text = raw.slice(raw.indexOf('\r\n\r\n') + 4);
            resolve({ status: res.statusCode, text: async () => text, json: async () => JSON.parse(text) });
            socket.destroy();
        });
        app(req, res);
        if (payload) req.push(payload);
        req.complete = true;
        req.push(null);
    });
