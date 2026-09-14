"""对照原始 Excel 验证最低品质记录及关系证据，仅读取，不重建产物。"""
from pathlib import Path
import json,hashlib
import openpyxl
root=Path(__file__).resolve().parents[2];out=root/'网页版'
d=json.loads((out/'graph-data.js').read_text(encoding='utf-8').removeprefix('window.ATLAS_DATA = ').rstrip(';\n'))
editor_patch=json.loads((out/'scripts'/'editor-patch.json').read_text(encoding='utf-8')) if (out/'scripts'/'editor-patch.json').exists() else {'custom':[],'overrides':{}}
override_ids=set((editor_patch.get('overrides') or {}).keys())
custom_by_id={i['id']:i for i in editor_patch.get('custom') or []}
w=openpyxl.load_workbook(root/'新数值.xlsx',data_only=True)
rank={'青铜':0,'白银':1,'黄金':2,'钻石':3}
expected=[]
for s in w:
 p='宠物' in s.title
 if not p and '技能' not in s.title:continue
 for i,r in enumerate(s.values):
  if i and r[1 if p else 0]:expected.append((s.title,i+1,r[1 if p else 0]))
base_items=[i for i in d['items'] if not i.get('custom')]
actual=[(i['source']['sheet'],i['source']['row'],i['name']) for i in base_items]
assert expected==actual
for i in base_items:
 if i['id'] in override_ids:
  expected_override=editor_patch['overrides'][i['id']]
  assert i['name']==expected_override['name'] and i['kind']==expected_override['kind']
  assert i['tier']==expected_override['tier'] and i['fields']==expected_override['fields']
  assert i['effect']==expected_override['effect'] and i['source']==expected_override['source']
  assert i['variants']==expected_override['variants']
  continue
 s=w[i['source']['sheet']];rows=list(s.values);r=rows[i['source']['row']-1];pet=i['kind']=='灵兽'
 assert i['fields']=={str(h):v for h,v in zip(rows[0],r) if h is not None}
 assert i['tier']==r[2 if pet else 1]
 for upgrade in rows[i['source']['row']:]:
  if upgrade[1 if pet else 0]:break
  t=upgrade[2 if pet else 1]
  if t in rank:assert rank[t]>=rank[i['tier']]
for i in d['items']:
 if i.get('custom'):
  expected_custom=custom_by_id[i['id']]
  assert i['name']==expected_custom['name'] and i['kind']==expected_custom['kind']
  assert i['tier']==expected_custom['tier'] and i['fields']==expected_custom['fields']
  assert i['effect']==expected_custom['effect'] and i['source']==expected_custom['source']
  assert i['variants']==expected_custom['variants']
lookup={i['id']:i for i in d['items']}
source_rows={(s.title,row_index):' '.join(str(v) for v in row if v is not None) for s in w for row_index,row in enumerate(s.values,1)}
for m in d['mechanisms']:
 for r in m['rules']:
  if r.get('itemId'):
   i=lookup[r['itemId']]
   assert r['item']==i['name'] and r['source']==i['source']
   assert r['condition'] in i['effect'] and r['result'] in i['effect']
  else:
   source=r.get('source')
   assert source and (source['sheet'],source['row']) in source_rows
   assert r.get('sourceText') and r['sourceText'] in source_rows[(source['sheet'],source['row'])]
for ex in d['examples']:
 names=[ex['pet'],*ex['skills']]
 assert all(any(i['name']==n for i in d['items']) for n in names)
 for step in ex['steps']:
  i=next(i for i in d['items'] if i['name']==step['source'])
  assert step['quote'] in i['effect']
  assert all(n in names for n in step['active'])
for f,h in d['meta']['sourceHashes'].items():
 assert hashlib.sha256((root/f).read_bytes()).hexdigest()==h
 source_copy=out/'source'/(Path(f).name if '/' in f or '\\' in f else f)
 assert (root/f).read_bytes()==source_copy.read_bytes()
result={'status':'PASS','baseItems':len(base_items),'mergedItems':len(d['items']),'exactSourceRules':sum(len(m['rules']) for m in d['mechanisms']),'checks':['所有命名基础行完整收录','所有字段逐格等于原表或编辑器补丁','各物品最低品质','每条条件与效果均为该物品原文片段','来源工作表和行号','原始文件哈希与附件一致']}
(out/'verification'/'source-results-v2.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(result)
