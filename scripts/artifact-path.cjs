const path = require('node:path');

// Host default is a sibling of repository; containers must set an absolute mounted path.
function artifactPath(relativePath, env = process.env) {
    const root = env.CAFE_ARTIFACT_ROOT || path.resolve(__dirname, '../../cafe-project-artifacts');
    if (!path.isAbsolute(root)) throw new Error('CAFE_ARTIFACT_ROOT_MUST_BE_ABSOLUTE');
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error('ARTIFACT_PATH_OUTSIDE_ROOT');
    }
    return target;
}

module.exports = { artifactPath };
