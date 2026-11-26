# Recursively vendor three.js files from jsDelivr, following relative imports.
import os, re, sys, subprocess
VER = sys.argv[1]; OUT = sys.argv[2]
BASE = f"https://cdn.jsdelivr.net/npm/three@{VER}/"
entries = [l.strip() for l in open(sys.argv[3]) if l.strip() and not l.startswith('#')]
IMP = re.compile(r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]""")
seen, queue, fails = set(), list(entries), []
def fetch(p):
    dst = os.path.join(OUT, p)
    if os.path.exists(dst): return open(dst,'rb').read()
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    r = subprocess.run(['curl','-sfL','--retry','3',BASE+p,'-o',dst])
    if r.returncode: fails.append(p); return None
    return open(dst,'rb').read()
while queue:
    p = queue.pop()
    if p in seen: continue
    seen.add(p)
    data = fetch(p)
    if data is None or not p.endswith('.js'): continue
    for m in IMP.finditer(data.decode('utf8','replace')):
        s = next(g for g in m.groups() if g)
        if s.startswith('three/addons/'): t = 'examples/jsm/' + s[len('three/addons/'):]
        elif s.startswith('.'): t = os.path.normpath(os.path.join(os.path.dirname(p), s))
        else: continue
        if t not in seen: queue.append(t)
print(len(seen), 'files;', 'fails:', fails)
