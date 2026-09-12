"""表格驱动的最低品质图谱；机制规则取自 rules.json，所有证据必须为原文片段。"""
from pathlib import Path
import json, hashlib, shutil
import openpyxl
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'网页版'
w=openpyxl.load_workbook(ROOT/'新数值.xlsx',data_only=True)
items=[]
source_rows={}
for s in w:
 for row_index,row in enumerate(s.values,1):
  source_rows[(s.title,row_index)]=' '.join(str(v) for v in row if v is not None)
 pet='宠物' in s.title
 if not pet and '技能' not in s.title:continue
 rows=list(s.values)
 for i,row in enumerate(rows[1:],2):
  col=1 if pet else 0
  if not row[col]:continue
  fields={str(h):v for h,v in zip(rows[0],row) if h is not None}
  tier_col=2 if pet else 1
  variants=[dict(tier=row[tier_col],fields=fields,source={'sheet':s.title,'row':i})]
  for j,upgrade in enumerate(rows[i:],i+1):
   if upgrade[col]:break
   if upgrade[tier_col] in ['青铜','白银','黄金','钻石']:
    upgrade_fields={str(h):v for h,v in zip(rows[0],upgrade) if h is not None}
    variants.append(dict(tier=upgrade[tier_col],fields=upgrade_fields,source={'sheet':s.title,'row':j}))
  items.append(dict(id=f'item-{len(items)+1}',name=str(row[col]),kind='灵兽' if pet else '技能',tier=row[tier_col],fields=fields,effect=row[7 if pet else 5],source={'sheet':s.title,'row':i},variants=variants))
byname={x['name']:x for x in items}
assert len(byname)==len(items)
mechanisms=json.loads((OUT/'scripts/rules.json').read_text(encoding='utf-8'))
for m in mechanisms:
 for i,r in enumerate(m['rules']):
  r['id']=f'{m["id"]}-{i}'
  if r.get('item'):
   item=byname[r['item']];r['itemId']=item['id']
   # Each condition and displayed outcome comes from the named item's base effect verbatim.
   for k in ['condition','result']:
    if r[k]:assert r[k] in item['effect'],(m['id'],item['name'],k,r[k])
   r['source']=item['source']
  else:
   r['itemId']=None
   source=r.get('source')
   assert source and (source['sheet'],source['row']) in source_rows,(m['id'],r['id'],'source')
   if r.get('sourceText'):assert r['sourceText'] in source_rows[(source['sheet'],source['row'])],(m['id'],r['id'],'sourceText')
 for item in items:
  text=' '.join(str(item['fields'].get(k) or '') for k in ['词条','效果','一句话效果','能力'])
  if any(k in text for k in m['keywords']) or any(r.get('itemId')==item['id'] for r in m['rules']):
   item.setdefault('mechanisms',[]).append(m['id'])
for item in items:item.setdefault('mechanisms',[])
examples=json.loads((OUT/'scripts/examples.json').read_text(encoding='utf-8'))
for ex in examples:
 for name in [ex['pet'],*ex['skills']]:assert name in byname
 for step in ex['steps']:
  assert step['quote'] in byname[step['source']]['effect']
  assert all(n in [ex['pet'],*ex['skills']] for n in step['active'])
meta={'itemCount':len(items),'petCount':sum(i['kind']=='灵兽' for i in items),'skillCount':sum(i['kind']=='技能' for i in items),'ruleCount':sum(len(m['rules']) for m in mechanisms),'mechanismCount':len(mechanisms),'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['新数值.xlsx','交互关系.pdf']}}
(OUT/'graph-data.js').write_text('window.ATLAS_DATA = '+json.dumps(dict(items=items,mechanisms=mechanisms,examples=examples,meta=meta),ensure_ascii=False)+';\n',encoding='utf-8')
(OUT/'source-audit.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
for f in meta['sourceHashes']:shutil.copy2(ROOT/f,OUT/'source'/f)
print(meta)
