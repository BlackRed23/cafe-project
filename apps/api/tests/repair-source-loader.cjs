const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const generated = require('@prisma/client');

// Inject persistence and remote boundaries. Never instantiate PrismaClient.
exports.sourceLoader = (prisma = {}, stubs = {}) => {
    const cache = new Map();
    function load(file) {
        file = path.resolve(file);
        if (cache.has(file)) return cache.get(file).exports;
        const m = new Module(file); cache.set(file, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
        m.require = request => {
            if (request === '@cafe-project/database') return { ...generated, prisma };
            if (Object.hasOwn(stubs, request)) return stubs[request];
            if (request.startsWith('.')) return load(path.resolve(path.dirname(file), request + '.ts'));
            return Module.prototype.require.call(m, request);
        };
        m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
        return m.exports;
    }
    return file => load(path.resolve(__dirname, '../src', file));
};
