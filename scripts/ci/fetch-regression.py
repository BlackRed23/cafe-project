"""Download same-repository release, verify pinned hash BEFORE extracting."""
import hashlib
import json
import argparse
import os
from pathlib import Path
import subprocess
import zipfile

lock = json.loads(Path(__file__).with_name('regression-release.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path, help='Verify local release candidate with the same pinned hash')
parser.add_argument('--destination', type=Path, default=Path('.ci-test-assets'))
args = parser.parse_args()
dest = args.destination
dest.mkdir(parents=True, exist_ok=True)
if args.archive is None:
    subprocess.run(['gh','release','download',lock['tag'],'--pattern',lock['asset'],'--dir',str(dest),'--clobber'],check=True)
archive = args.archive or dest / lock['asset']
if hashlib.sha256(archive.read_bytes()).hexdigest() != lock['sha256']:
    raise SystemExit('Release ZIP SHA256 mismatch')
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        target = (dest / item.filename).resolve()
        if not target.is_relative_to(dest.resolve()) or (item.external_attr >> 16) & 0o170000 == 0o120000:
            raise SystemExit('Unsafe ZIP member')
    z.extractall(dest)
for line in (dest/'MANIFEST.sha256').read_text().splitlines():
    digest, name = line.split('  ',1)
    target = (dest/name).resolve()
    if not target.is_relative_to(dest.resolve()) or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise SystemExit('Bundle member SHA256 mismatch: '+name)
print('Verified regression release '+lock['tag']+' sha256='+lock['sha256'])
source_sha = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
if os.environ.get('GITHUB_SHA') and source_sha != os.environ['GITHUB_SHA']:
    raise SystemExit('Source checkout does not match GITHUB_SHA')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('sha256='+lock['sha256']+'\n')
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
        output.write('### Reproducible source / regression pairing\n\n- Source: '+source_sha+'\n- Release: '+lock['tag']+'\n- ZIP SHA256: '+lock['sha256']+'\n')
