"""Deterministic release ZIP; never follows workspace links or includes reports/secrets."""
import hashlib
import json
import os
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
version = json.loads((root / 'manifests/regression.json').read_text())['version']
files = {}
for rel in ['run-tests.cjs', 'bootstrap-links.sh', 'bootstrap-links.ps1']:
    files['testing/' + rel] = (root / rel).read_bytes()
for rel in ['manifests', 'ci'] + [f'apps/{app}/{kind}' for app in ['api', 'agent', 'web'] for kind in ['tests', 'fixtures']]:
    for directory, dirs, names in os.walk(root / rel, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in ['node_modules', 'dist', 'reports', '.vite', 'test-results'] and not os.path.islink(Path(directory)/d) and not os.path.isjunction(Path(directory)/d))
        for name in sorted(names):
            p = Path(directory) / name
            if p.is_symlink() or name.startswith('.env') or p.suffix not in ['.cjs','.js','.mjs','.ts','.tsx','.json','.html','.css','.svg','.md']:
                continue
            files['testing/' + p.relative_to(root).as_posix()] = p.read_bytes()
manifest = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(files.items()))
files['MANIFEST.sha256'] = manifest.encode()
asset = f'cafe-regression-{version}.zip'
target = out / asset
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (2026,11,26,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info,data)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(out / (asset + '.sha256')).write_text(digest + '  ' + asset + '\n')
lock = {'version':version, 'tag':'regression-v'+version,'asset':asset,'sha256':digest,'files':len(files)}
Path(__file__).with_name('regression-release.json').write_text(json.dumps(lock,indent=2)+'\n')
print(json.dumps({'path':str(target), **lock}))
