"""Release helper: bump the service-worker cache name and the ?v= tag on every
module asset referenced by index.html, so browsers never serve a stale module
after a deploy (GitHub Pages caches files for 10 minutes).
Usage: python bump.py   (then commit + push)"""
import io,re
sw=io.open('sw.js',encoding='utf-8').read()
m=re.search(r"yggdrasil-cache-v(\d+)",sw);n=int(m.group(1))+1
sw=sw.replace(m.group(0),f"yggdrasil-cache-v{n}")
io.open('sw.js','w',encoding='utf-8',newline='\n').write(sw)
h=io.open('index.html',encoding='utf-8').read()
h=re.sub(r'(href|src)="([a-z]+\.(?:css|js))(?:\?v=\d+)?"',lambda mm:f'{mm.group(1)}="{mm.group(2)}?v={n}"',h)
io.open('index.html','w',encoding='utf-8',newline='\n').write(h)
print(f"cache v{n}; {len(re.findall(r'[?]v='+str(n),h))} asset refs tagged")
