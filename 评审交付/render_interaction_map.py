from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent / "交互关系_重绘版.png"
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
W, H = 2000, 1300
img = Image.new("RGB", (W, H), "#f7fafc")
d = ImageDraw.Draw(img)

def font(size):
    return ImageFont.truetype(FONT, size)

def center_text(box, text, size, color="#17324d"):
    x1, y1, x2, y2 = box
    f = font(size)
    bb = d.multiline_textbbox((0, 0), text, font=f, spacing=6, align="center")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.multiline_text(((x1+x2-tw)/2, (y1+y2-th)/2), text, font=f, fill=color, spacing=6, align="center")

def box(rect, label, outline, fill="#ffffff", radius=14, size=22):
    d.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=3)
    center_text(rect, label, size)

def arrow(a, b, color="#71879a", width=4):
    d.line([a, b], fill=color, width=width)
    x, y = b
    d.polygon([(x, y), (x-10, y-20), (x+10, y-20)], fill=color)

d.text((70, 35), "灵兽构筑系统｜可读交互关系", font=font(38), fill="#17324d")
d.text((70, 88), "资源与状态 → 触发事件 → 构筑转换 → 战斗结果", font=font(20), fill="#526777")

lanes = [
    (140, 335, "① 资源与状态层", "#eaf4ff", "#86b4d9"),
    (370, 570, "② 触发事件层", "#eff8ee", "#86bd82"),
    (605, 885, "③ 构筑转换层", "#fff8e9", "#ddb154"),
    (920, 1135, "④ 战斗结果层", "#f7f0fb", "#a986c1"),
]
for y1, y2, title, fill, outline in lanes:
    d.rounded_rectangle((55, y1, 1945, y2), radius=20, fill=fill, outline=outline, width=3)
    d.text((82, y1+20), title, font=font(25), fill="#17324d")

resources = ["弹药", "能量", "倒计时", "护盾/护甲?", "灼烧/剧毒", "亢奋/衰弱", "暴击率"]
r_centers = []
for i, label in enumerate(resources):
    x1 = 105 + i*265
    rect = (x1, 220, x1+205, 285)
    box(rect, label, "#4389bd")
    r_centers.append(((x1+x1+205)//2, 285))

events = ["使用武技/术法", "攻击命中/暴击", "获得护盾/治疗", "施加元素状态", "获得增益/减益", "回合/死亡事件"]
e_centers = []
for i, label in enumerate(events):
    x1 = 95 + i*305
    rect = (x1, 450, x1+245, 515)
    box(rect, label, "#4d9c58", radius=30, size=20)
    e_centers.append(((x1+x1+245)//2, 450))

builds = [
    "多武器/暴击\n高频→暴击→成长",
    "弹药\n消耗→爆发→装填",
    "充能\n积累→爆能→大效果",
    "灼烧/剧毒\n施加→留存/引爆",
    "护盾/增减益\n获得→分发→成长",
]
b_centers = []
for i, label in enumerate(builds):
    x1 = 95 + i*370
    rect = (x1, 690, x1+305, 815)
    box(rect, label, "#d7941f", size=20)
    b_centers.append(((x1+x1+305)//2, 690))

results = ["直接/持续伤害", "治疗/护盾/再生", "技能与属性成长", "控制/阵型破坏", "胜负"]
o_centers = []
for i, label in enumerate(results):
    x1 = 105 + i*370
    rect = (x1, 1005, x1+285, 1080)
    box(rect, label, "#8e68aa", size=20)
    o_centers.append(((x1+x1+285)//2, 1005))

# 主要关系只画关键链，避免再次变成线团。
for src, dst in [(0,0),(1,1),(2,5),(3,2),(4,3),(5,4),(6,1)]:
    arrow(r_centers[src], e_centers[dst])
for src, dst in [(0,0),(1,0),(1,1),(2,4),(3,3),(4,4),(5,2)]:
    arrow((e_centers[src][0], 515), b_centers[dst])
for src, dst in [(0,0),(1,0),(2,2),(3,0),(3,1),(4,1),(4,2)]:
    arrow((b_centers[src][0], 815), o_centers[dst])
for i in range(len(o_centers)-1):
    arrow((o_centers[i][0]+143, 1042), (o_centers[i+1][0]-143, 1042))

# 用红色回路明确表示风险，不假装这是已经闭合的正式规则。
d.arc((930, 535, 1620, 925), start=35, end=330, fill="#c53d34", width=6)
d.polygon([(1070, 585), (1050, 566), (1077, 558)], fill="#c53d34")
d.text((1040, 850), "治疗 ↔ 施毒等组合可能循环", font=font(20), fill="#c53d34")
d.text((1040, 878), "需要事件ID与重入保护", font=font(18), fill="#c53d34")

d.text((70, 1175), "阅读结论", font=font(26), fill="#17324d")
d.text((70, 1212), "内容已形成构筑网络；当前真正阻塞制作的是行动时序、触发重入、目标确定性与数值预算仍未闭合。", font=font(18), fill="#526777")
d.text((70, 1245), "原创化优先级：强化棋盘站位 → 强化灵兽与技能绑定 → 把充能/爆能和双层元素做成核心决策。", font=font(18), fill="#526777")

img.save(OUT, optimize=True)
print(OUT)
