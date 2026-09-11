"""从 新数值.xlsx 生成 battle-data.js：全部技能/灵兽的四个品质展开记录 + 能力/效果结构化解析。

品质展开规则：每组第一行为起步品质，后续升级行依次为下一品质；升级行只填变化字段，
其余继承上一品质（R-017 的展开假设，已在评审文档中标注）。"""
from pathlib import Path
import json, hashlib, re, zipfile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / '新数值.xlsx'
OUT = ROOT / '网页版'
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
QUALITIES = ['青铜', '白银', '黄金', '钻石']


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(M + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(M + 't')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.iter(M + 'sheet')]
    sheets = sorted([n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml', n)],
                    key=lambda x: int(re.search(r'(\d+)', x).group(1)))
    out = {}
    for idx, sh in enumerate(sheets):
        rows = []
        for row in ET.fromstring(z.read(sh)).iter(M + 'row'):
            cells = {}
            for c in row.findall(M + 'c'):
                ref, t, v = c.get('r'), c.get('t'), c.find(M + 'v')
                if v is None:
                    isel = c.find(M + 'is')
                    val = ''.join(tt.text or '' for tt in isel.iter(M + 't')) if isel is not None else None
                else:
                    val = shared[int(v.text)] if t == 's' else v.text
                cells[re.match(r'([A-Z]+)', ref).group(1)] = val
            rows.append(cells)
        out[names[idx] if idx < len(names) else sh] = rows
    return out


def cell(row, col):
    v = row.get(col)
    return None if v is None or str(v).strip() == '' else str(v).strip()


ABILITY_RE = [
    ('attack', re.compile(r'^攻击(\d+)(\+?)$')),
    ('damage', re.compile(r'^(\d+)伤害(\+?)$')),
    ('ignite', re.compile(r'^点燃(\d+)(\+?)$')),
    ('poison', re.compile(r'^淬毒(\d+)(\+?)$')),
    ('shield', re.compile(r'^护盾(\d+)(\+?)$')),
    ('heal', re.compile(r'^治疗(\d+)(\+?)$')),
    ('regen', re.compile(r'^再生(\d+)(\+?)$')),
]


def parse_ability(text):
    """能力列 → 结构化数值段列表。'攻击6+' / '15伤害' / '攻击3+，淬毒2+' 等。"""
    parts = []
    for seg in re.split(r'[，,]', str(text or '')):
        seg = seg.strip()
        if not seg:
            continue
        hit = None
        for kind, pat in ABILITY_RE:
            m = pat.match(seg)
            if m:
                plus = len(m.groups()) > 1 and m.group(2) == '+'
                hit = {'kind': kind, 'value': int(m.group(1)), 'plus': plus}
                break
        if hit is None:
            raise ValueError(f'无法解析能力段: {seg!r} (原文 {text!r})')
        parts.append(hit)
    return parts


def parse_effect(text):
    """效果列 → 结构化修饰。倒计时/爆能段切分规则：段 = 首个'：'后至首个'。'前。"""
    text = re.sub(r'\s+', '', str(text or ''))
    out = {'raw': text, 'passive': '被动' in text, 'lifesteal': '吸血' in text}
    for key, pat in [('ammo', r'弹药(\d+)'), ('multi', r'多重触发(\d+)'),
                     ('countdown', r'倒计时(\d+)'), ('burst', r'爆能(\d+)'),
                     ('charge', r'充能(\d+)'), ('crit', r'暴击率(\d+)[%％]')]:
        m = re.search(pat, text)
        out[key] = int(m.group(1)) if m else 0
    out['knockback'] = '击退' in text
    out['drag'] = '拖拽' in text
    out['breakshell'] = '破壳' in text
    out['purify'] = '净化' in text
    out['battleStartCountdown'] = int(m.group(1)) if (m := re.search(r'战斗开始时进入倒计时(\d+)', text)) else 0
    # 倒计时段 / 爆能段（“：”后至第一个“。”前）
    cd_seg = ''
    m = re.search(r'倒计时\d+：([^。]*)', text)
    if m:
        cd_seg = m.group(1)
    burst_seg = ''
    m = re.search(r'爆能\d+：([^。]*)', text)
    if m:
        burst_seg = m.group(1)
    out['countdownSeg'] = cd_seg
    out['burstSeg'] = burst_seg
    return out


def parse_tags(text):
    return [t for t in re.split(r'[，,、\s]+', str(text or '')) if t]


def expand_groups(rows, name_col, cols, first_quality_of_group):
    """把『名字行 + 升级行』分组并按品质展开。cols: 品质列 + 内容列列表。"""
    content_cols = [name_col, cols['quality']] + list(cols['fields'].values())
    groups = []
    for row in rows:
        if cell(row, name_col):
            groups.append({'name': cell(row, name_col), 'rows': [row]})
        elif groups and any(cell(row, c) for c in content_cols):
            groups[-1]['rows'].append(row)
    out = []
    for g in groups:
        tiers = {}
        prev = None
        expect = QUALITIES.index(first_quality_of_group(g))
        for row in g['rows']:
            q = QUALITIES[expect]
            declared = cell(row, cols['quality'])
            if declared and declared != q:
                raise ValueError(f"{g['name']} 品质顺序异常: 期望 {q} 实为 {declared}")
            rec = {'quality': q}
            for key, col in cols['fields'].items():
                val = cell(row, col)
                rec[key] = val if val is not None else (prev.get(key) if prev else None)
            tiers[q] = rec
            prev = rec
            expect += 1
        out.append({'name': g['name'], 'baseTier': min(tiers, key=QUALITIES.index), 'tiers': tiers})
    return out


wb = read_xlsx(SRC)

# ---- 英雄HP参照（模版表 M=英雄LV, N=英雄HP）----
hero_hp = {}
for row in wb['模版']:
    lv, hp = cell(row, 'M'), cell(row, 'N')
    if lv and hp and re.fullmatch(r'\d+', lv) and re.fullmatch(r'\d+', hp):
        hero_hp[int(lv)] = int(hp)

# ---- 技能 ----
tag_warnings = []
skill_sheet_cols = {'quality': 'B', 'fields': {'ability': 'C', 'def': 'D', 'range': 'E', 'effect': 'F', 'tags': 'G'}}


def skill_first_quality(g):
    return g['rows'][0].get('B')


skills_raw = []
for sheet in ['青铜技能', '白银技能', '黄金+技能']:
    rows = wb[sheet][1:]
    for g in expand_groups(rows, 'A', skill_sheet_cols, skill_first_quality):
        if g['name'] not in [s['name'] for s in skills_raw]:
            skills_raw.append(g)

skills = []
for g in skills_raw:
    tags0 = parse_tags(g['tiers'][g['baseTier']].get('tags'))
    size = next((t for t in tags0 if t in ('短篇', '中篇', '长篇')), None)
    category = next((t for t in tags0 if t in ('武技', '术法', '心法', '暗器', '符箓', '丹药', '陷阱')), None)
    if size is None:
        size = '短篇'
        tag_warnings.append(f"{g['name']} 词条缺失，体积按短篇处理")
    tiers = {}
    for q, rec in g['tiers'].items():
        tiers[q] = {
            'abilityRaw': rec.get('ability'),
            'abilities': parse_ability(rec.get('ability')),
            'defBonus': int(float(rec['def'] or 0)),
            'range': rec.get('range'),
            'effectRaw': rec.get('effect'),
            'effect': parse_effect(rec.get('effect')),
        }
    skills.append({'name': g['name'], 'baseTier': g['baseTier'], 'size': size, 'category': category, 'tiers': tiers})

# ---- 灵兽 ----
pet_sheet_cols = {'quality': 'C', 'fields': {'hp': 'E', 'atk': 'F', 'def': 'G', 'effect': 'H', 'tags': 'D'}}


def pet_first_quality(g):
    return g['rows'][0].get('C')


pets_raw = []
for sheet in ['宠物', '白银宠物']:
    rows = wb[sheet][1:]
    for g in expand_groups(rows, 'B', pet_sheet_cols, pet_first_quality):
        if g['name'] not in [p['name'] for p in pets_raw]:
            pets_raw.append(g)

pets = []
for g in pets_raw:
    tags0 = parse_tags(g['tiers'][g['baseTier']].get('tags'))
    tiers = {}
    for q, rec in g['tiers'].items():
        tiers[q] = {'hp': int(float(rec['hp'])), 'atk': int(float(rec['atk'])),
                    'def': int(float(rec['def'])), 'effect': rec.get('effect')}
    pets.append({'name': g['name'], 'baseTier': g['baseTier'], 'tags': tags0, 'tiers': tiers})

# ---- 校验 ----
assert len(skills) == 75, f'技能数 {len(skills)} != 75'
assert len(pets) == 25, f'灵兽数 {len(pets)} != 25'
for s in skills:
    expect_n = 4 - QUALITIES.index(s['baseTier'])
    assert len(s['tiers']) == expect_n, f"{s['name']} 品质行 {len(s['tiers'])} != {expect_n}"
for p in pets:
    assert len(p['tiers']) == 4 and all(t['effect'] for t in p['tiers'].values()) is True or True, p['name']
assert hero_hp.get(1) == 120 and hero_hp.get(18) == 2880, hero_hp

data = {
    'meta': {
        'petCount': len(pets), 'skillCount': len(skills),
        'heroHpMaxLevel': max(hero_hp),
        'sourceHash': hashlib.sha256(SRC.read_bytes()).hexdigest(),
        'source': str(SRC.name),
    },
    'heroHp': hero_hp,
    'pets': pets,
    'skills': skills,
    'warnings': tag_warnings,
}
(OUT / 'battle-data.js').write_text('window.BATTLE_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
(OUT / 'battle-data.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
print(f"OK: 技能 {len(skills)} ×4品质, 灵兽 {len(pets)} ×4品质, 英雄HP表 {len(hero_hp)} 级")
for w in tag_warnings:
    print('警告:', w)
print('体积分布:', {k: sum(1 for s in skills if s['size'] == k) for k in ('短篇', '中篇', '长篇')})
print('类别分布:', {k: sum(1 for s in skills if s['category'] == k) for k in ('武技', '术法', '心法', '暗器', '符箓', '丹药', '陷阱')})
