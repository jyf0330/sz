"""从原始 PDF 几何和 Excel 基础记录生成静态网页数据。"""
from pathlib import Path
import json, html, unicodedata, hashlib, shutil
import pymupdf
import openpyxl

OUT = Path(__file__).resolve().parents[1]
ROOT = OUT.parent
# 名称对照需作者确认；未确认时不猜测绑定。
ALIASES = {}
CANDIDATES = {'鲛人枪兵':'鲛人抢手','钩镰':'钩链','快速装弹':'快速换弹','寒蛇影':'蛇影寒'}
def norm(s):
    return unicodedata.normalize('NFKC', s).translate(str.maketrans({'⻆':'角','⻤':'鬼','⻥':'鱼','⻅':'见','⻛':'风','⻰':'龙','⻜':'飞','⻓':'长'}))
def val(v):
    return v.isoformat() if hasattr(v,'isoformat') else v

wb = openpyxl.load_workbook(ROOT/'新数值.xlsx', data_only=True)
catalog = {}
for sheet in wb:
    pet = '宠物' in sheet.title
    if not pet and '技能' not in sheet.title: continue
    rows=list(sheet.values); headers=rows[0]; namecol=1 if pet else 0
    for rowno,row in enumerate(rows[1:],2):
        if not row[namecol]:continue
        name=str(row[namecol]).strip()
        record={'name':name,'kind':'灵兽' if pet else '技能','tier':row[2 if pet else 1],
                'source':{'file':'新数值.xlsx','sheet':sheet.title,'row':rowno},
                'fields':{str(h):val(v) for h,v in zip(headers,row) if h is not None}}
        assert name not in catalog, f'duplicate base name: {name}'
        catalog[name]=record

pdf=pymupdf.open(ROOT/'交互关系.pdf');page=pdf[0];drawings=page.get_drawings()
spans=[]
for block in page.get_text('dict')['blocks']:
    if block['type']!=0:continue
    for line in block['lines']:
        if line['dir']!=(1.0,0.0):continue # PDF diagonal watermark, not relationship content
        for s in line['spans']:
            spans.append({**s,'text':norm(s['text'])})

def inside(rect,span):
    b=span['bbox'];return rect.contains(pymupdf.Point((b[0]+b[2])/2,(b[1]+b[3])/2))
def ordered_lines(parts):
    lines=[]
    for s in sorted(parts,key=lambda s:(round(s['origin'][1]/3),s['origin'][0])):
        if not lines or abs(lines[-1][0]-s['origin'][1])>3:lines.append((s['origin'][1],[s]))
        else:lines[-1][1].append(s)
    return [''.join(s['text'] for s in sorted(line,key=lambda s:s['origin'][0])) for y,line in lines]

nodes=[];assigned=set();node_drawings={}
for i,d in enumerate(drawings):
    if d['type']!='fs':continue
    parts=[(j,s) for j,s in enumerate(spans) if inside(d['rect'],s)]
    lines=ordered_lines([s for j,s in parts]); name=''.join(lines)
    assert name
    assigned.update(j for j,s in parts)
    record=catalog.get(ALIASES.get(name,name))
    node={'id':f'n{i}','name':name,'lines':lines,'bounds':list(d['rect']),
          'record':record,'candidate':CANDIDATES.get(name) if not record else None,
          'kind':record['kind'] if record else ('概念' if name=='中型技能' else ('灵兽' if len(d['items'])==6 else '技能'))}
    nodes.append(node);node_drawings[i]=node

# 保留原始路径控制点、箭头与虚实边界；只更换色彩。
palette={15:'#448d99',16:'#b68a34',17:'#a26079',22:'#ce785d',23:'#45927b',26:'#65a58c',31:'#6196b9',32:'#b68148',36:'#8871a0',92:'#6196b9'}
regions=[]
for i,color in palette.items():
    d=drawings[i];r=d['rect']
    names=ordered_lines([s for j,s in enumerate(spans) if j not in assigned and s['size']>=36 and inside(r,s)])
    # 标题由其原始颜色与区域索引对应，避免交叠矩形误认。
    title={15:'增减益',16:'护盾',17:'输出',22:'灼烧',23:'剧毒',26:'治疗',31:'充能',32:'弹药',36:'暴击',92:'充能'}[i]
    regions.append({'id':f'r{i}','name':title,'bounds':list(r),'color':color})
for n in nodes:
    x0,y0,x1,y1=n['bounds']; center=pymupdf.Point((x0+x1)/2,(y0+y1)/2)
    n['regions']=list(dict.fromkeys(r['name'] for r in regions if pymupdf.Rect(r['bounds']).contains(center)))

def point(p):return f'{p.x:.4f} {p.y:.4f}'
def path(d):
    out=[];prev=None
    for item in d['items']:
        op=item[0]
        if op=='re':
            r=item[1];out.append(f'M {r.x0:.4f} {r.y0:.4f} H {r.x1:.4f} V {r.y1:.4f} H {r.x0:.4f} Z');prev=None
        else:
            if prev!=item[1]:out.append('M '+point(item[1]))
            if op=='l':out.append('L '+point(item[2]));prev=item[2]
            else:out.append('C '+' '.join(point(p) for p in item[2:]));prev=item[-1]
    if d.get('closePath'):out.append('Z')
    return ' '.join(out)

svg=['<svg id="relation-map" xmlns="http://www.w3.org/2000/svg" viewBox="575 -30 3475 2660" aria-label="交互关系，保留 PDF 的位置、分区和箭头">']
# 分区背景严格沿原矩形，边界本身仍由原路径绘制。
for r in regions:
    x,y,x1,y1=r['bounds'];svg.append(f'<rect x="{x}" y="{y}" width="{x1-x}" height="{y1-y}" fill="{r["color"]}" opacity=".025"/>')
for i,d in enumerate(drawings):
    if i==0 or i in node_drawings:continue
    region=i in palette;color=palette[i] if region else '#77827e'
    fill=color if d['fill'] else 'none';stroke=color if d['color'] else 'none'
    svg.append(f'<path class="{"region-line" if region else "relation-line"}" data-source-drawing="{i}" d="{path(d)}" fill="{fill}" stroke="{stroke}" stroke-width="{d["width"] or 0}"/>')
# 每一行按原始位置输出；关系标注加纸色底，保证线条穿过时可读。
remaining=[s for j,s in enumerate(spans) if j not in assigned]
for s in remaining:
    x,y=s['origin'];size=s['size']; b=s['bbox']; text=html.escape(s['text'])
    rgb=f'#{s["color"]:06x}'
    if size<30:
        svg.append(f'<rect x="{b[0]-3}" y="{b[1]-2}" width="{b[2]-b[0]+6}" height="{b[3]-b[1]+4}" fill="#f7f8f2"/>')
    svg.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{rgb if size>=36 else "#52635c"}" class="map-label">{text}</text>')
for i,n in node_drawings.items():
    d=drawings[i];x0,y0,x1,y1=n['bounds'];x=(x0+x1)/2;y=(y0+y1)/2;count=len(n['lines']);id=n['id']
    cls='pet' if n['kind']=='灵兽' else 'skill'
    svg.append(f'<g class="map-node {cls}" data-node="{id}" role="button" tabindex="0" aria-label="{html.escape(n["name"])}，查看详情">')
    svg.append(f'<path class="node-shape" d="{path(d)}"/>')
    for j,line in enumerate(n['lines']):
        svg.append(f'<text x="{x}" y="{y+(j-(count-1)/2)*34}" text-anchor="middle" dominant-baseline="central" class="node-name">{html.escape(line)}</text>')
    svg.append('</g>')
svg.append('</svg>')
svg=''.join(svg)
meta={'pdfNodes':len(nodes),'boundItems':sum(bool(n['record']) for n in nodes),
      'pending':[{'name':n['name'],'candidate':n['candidate']} for n in nodes if n['candidate']],
      'relationshipDrawings':len(drawings)-1-len(nodes)-len(regions),
      'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['交互关系.pdf','新数值.xlsx']}}
payload={'nodes':nodes,'regions':regions,'meta':meta,'svg':svg}
(OUT/'graph-data.js').write_text('window.GRAPH_DATA = '+json.dumps(payload,ensure_ascii=False)+';\n')
(OUT/'source-audit.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
for f in ['交互关系.pdf','新数值.xlsx']:shutil.copy2(ROOT/f,OUT/'source'/f)
print(json.dumps(meta,ensure_ascii=False,indent=2))
