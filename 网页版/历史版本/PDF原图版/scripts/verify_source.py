"""核对源文件、最低品质数据、文字内容和每条原图几何路径。"""
from pathlib import Path
from collections import Counter
import json, re, runpy, xml.etree.ElementTree as ET
ns=runpy.run_path(str(Path(__file__).with_name('build.py')))
svg=ET.fromstring(ns['svg']); tag=lambda s:'{http://www.w3.org/2000/svg}'+s
original=Counter(''.join(s['text'] for s in ns['spans']))
rendered=Counter(''.join((s.text or '') for s in svg.iter(tag('text'))))
assert original==rendered, (original-rendered,rendered-original)
paths={int(p.attrib['data-source-drawing']):p.attrib['d'] for p in svg.iter(tag('path')) if 'data-source-drawing' in p.attrib}
for i,d in enumerate(ns['drawings']):
 if i==0:continue
 if i in ns['node_drawings']:
  node=next(g for g in svg.iter(tag('g')) if g.attrib.get('data-node')==ns['node_drawings'][i]['id'])
  assert node.find(tag('path')).attrib['d']==ns['path'](d)
 else:assert paths[i]==ns['path'](d)
rank={'青铜':0,'白银':1,'黄金':2,'钻石':3}
for n in ns['nodes']:
 r=n['record']
 if not r:continue
 source=r['source'];sheet=ns['wb'][source['sheet']];row=list(sheet.values)[source['row']-1]
 idx=1 if r['kind']=='灵兽' else 0
 assert row[idx]==r['name']
 assert r['tier'] in rank
 # named base rows are at the minimum available tier of their following upgrade sequence.
 for following in list(sheet.values)[source['row']:]:
  if following[idx]:break
  next_tier=following[2 if idx==1 else 1]
  if next_tier in rank:assert rank[next_tier]>=rank[r['tier']]
 for k,v in r['fields'].items():
  header=list(sheet.values)[0];assert row[header.index(k)]==v
result={'status':'PASS','textCharacters':sum(original.values()),'drawingGeometryPreserved':len(ns['drawings'])-1,'boundBaseRecords':ns['meta']['boundItems'],'originalFilesUnmodified':all((ns['ROOT']/f).read_bytes()==(ns['OUT']/'source'/f).read_bytes() for f in ns['meta']['sourceHashes'])}
assert result['originalFilesUnmodified']
(ns['OUT']/'verification').mkdir(exist_ok=True)
(ns['OUT']/'verification'/'source-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(result)
