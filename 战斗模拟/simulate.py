"""三套已有小组合的可复现原型对战。只使用公开配置和显式暂定规则。"""
from pathlib import Path
from dataclasses import dataclass, field
import json, random, hashlib
ROOT=Path(__file__).resolve().parent
DATA=json.loads((ROOT.parent/'网页版/graph-data.js').read_text().removeprefix('window.ATLAS_DATA = ').rstrip(';\n'))
CAT={x['name']:x for x in DATA['items']}
RULES=[
 '本次是1只灵兽携带2个技能的最小阵容对战，不代表正式阵容规模或已验证的槽位配置；全部采用各物品最低可用品质。',
 '一维7格棋盘，双方初始在第2/5格，始终朝向对手。每回合每方尝试一个主动技能；奇数回合A方先手，偶数回合B方先手。主动技能按展示顺序轮换；蜷缩只作为获得剧毒后的被动响应。',
 '尝试攻击前，若距离不符则向满足射程方向移动1格；仍不符合则本次不出招，下回合尝试下一个主动技能。不重叠、不绕过射程；自身技能不要求敌方距离。',
 '武技原始伤害=表内技能攻击基础数值+灵兽攻击+该技能累积伤害提升。攻击后的“+”按词条中技能攻击加灵兽攻击处理；淬毒2+本次只取基础2，不增加未定义的附加量。',
 '暂定装备技能的防御加到灵兽防御；普通伤害先扣防御(最低0)，再扣护盾，最后扣生命。剧毒暂定绕过防御和护盾直接扣生命。这些减伤规则不是原表已冻结的规则。',
 '灼烧不涉及本次阵容。剧毒可叠加：已有剧毒时再次淬毒，先增加层数再立即结算一次剧毒并减1层；该先后顺序为暂定。回合结束再结算剧毒并减1层。',
 '获得剧毒事件触发蜷缩：护盾+25、再生+2；护盾和再生暂定叠加，护盾无上限。每次实际获得护盾再触发鲛人抢手，等概率选一个自身技能伤害+10；抽到蜷缩不会把伤害加成转为护盾。',
 '每次伤害结算后立即检查死亡，死亡不能继续触发或回血。存活者在回合结束依次结算剧毒、再生治疗、回合结束特性；过量治疗截断到最大生命。',
 '袖箭初始4枚弹药，使用消耗1枚；装填上限暂定为4。蓄能与袖箭按主动技能顺序交替使用。玄铁龟回合开始有至少6能量才消耗6并给存活己方(含自身)能量+2、所有可装填技能弹药+1；不足6不发动，也不额外补偿能量。回合结束能量+1。',
 '巨鳄蚁两件武技暴击率均为35%；冲刺拳本场首次实际出招必暴。暴击使该次伤害与元素施加量翻倍，暴击事件在该次攻击和效果完成后处理；龙牙斩据此给己方所有武技伤害+5，影响后续攻击。',
 '固定随机种子，记录随机技能目标和暴击掷值。事件按先产生先处理、同步调用完成后再进入下一动作；最多100回合，超时记平局，不用剩余血量强行判胜。'
]
PRESETS=[('自毒换盾','鲛人抢手',['蜈蚣锁','蜷缩']),('能量回充','玄铁龟',['蓄能','袖箭']),('暴击养武技','巨鳄蚁',['冲刺拳','龙牙斩'])]
@dataclass
class Unit:
 side:str; build:str; name:str; skills:list; pos:int
 hp:int=0; maxhp:int=0; atk:int=0; defense:int=0; shield:int=0; poison:int=0; regen:int=0; energy:int=0
 ammo:dict=field(default_factory=dict); growth:dict=field(default_factory=dict); used:dict=field(default_factory=dict); action_index:int=0
 def __post_init__(self):
  f=CAT[self.name]['fields'];self.hp=self.maxhp=f['hp'];self.atk=f['攻击'];self.defense=f['防御']+sum(CAT[s]['fields']['防御'] or 0 for s in self.skills)
  self.growth={s:0 for s in self.skills};self.used={s:0 for s in self.skills}
  if '袖箭' in self.skills:self.ammo['袖箭']=4
 def snap(self):return dict(生命=self.hp,护盾=self.shield,剧毒=self.poison,再生=self.regen,能量=self.energy,弹药=self.ammo.copy(),技能增伤=self.growth.copy(),位置=self.pos+1)
class Battle:
 def __init__(self,a,b,seed):
  self.seed=seed;self.rng=random.Random(seed);self.units=[Unit('A',*a,1),Unit('B',*b,4)];self.events=[];self.round=0;self.phase='准备';self.event=0
 def log(self,source,target,effect,before=None,after=None,trigger=''):
  self.event+=1;self.events.append(dict(seq=self.event,round=self.round,phase=self.phase,source=source,target=target,effect=effect,before=before,after=after,trigger=trigger))
 def who(self,u):return f'{u.side}方 {u.name}'
 def change(self,u,source,fn,effect,trigger=''):
  before=u.snap();fn();self.log(source,self.who(u),effect,before,u.snap(),trigger)
 def dead(self):return any(u.hp<=0 for u in self.units)
 def damage(self,u,raw,source,poison=False):
  before=u.snap();dmg=raw if poison else max(0,raw-u.defense);blocked=0 if poison else min(u.shield,dmg);u.shield-=blocked;hpdamage=min(u.hp,dmg-blocked);u.hp-=hpdamage
  self.log(source,self.who(u),f'{"剧毒" if poison else "普通"}伤害：原始{raw}，防御抵扣{0 if poison else min(raw,u.defense)}，护盾吸收{blocked}，生命损失{hpdamage}',before,u.snap())
  if u.hp==0:self.log(self.who(u),self.who(u),'生命归零，立即死亡')
 def poison_tick(self,u,source):
  if u.poison<=0 or u.hp<=0:return
  amount=u.poison;self.damage(u,amount,source,True)
  self.change(u,source,lambda:setattr(u,'poison',max(0,u.poison-1)),'剧毒结算后层数-1')
 def poison_apply(self,u,amount,source):
  if u.hp<=0:return
  had=u.poison>0;self.change(u,source,lambda:setattr(u,'poison',u.poison+amount),f'施加剧毒+{amount}')
  # This ordering is explicit prototype rule: obtain event -> shield trigger -> preexisting poison tick.
  if '蜷缩' in u.skills:
   self.change(u,f'{self.who(u)} / 蜷缩',lambda:(setattr(u,'shield',u.shield+25),setattr(u,'regen',u.regen+2)),'护盾+25，再生+2',f'获得剧毒，来源：{source}')
   if u.name=='鲛人抢手':
    skill=self.rng.choice(u.skills);self.change(u,f'{self.who(u)} / 特性',lambda:u.growth.__setitem__(skill,u.growth[skill]+10),f'随机选中{skill}：技能伤害+10'+('；本技能无直伤，不改变护盾/再生数值' if skill=='蜷缩' else ''),'蜷缩实际获得护盾')
  if had:self.poison_tick(u,source+' / 已有剧毒时淬毒立即结算')
 def turn_start(self,u):
  if u.name!='玄铁龟':return
  if u.energy<6:self.log(self.who(u)+' / 特性',self.who(u),f'能量{u.energy}<6，本回合开始不发动装填');return
  self.change(u,self.who(u)+' / 特性',lambda:setattr(u,'energy',u.energy-6),'消耗6点能量','回合开始，能量达到门槛')
  self.change(u,self.who(u)+' / 特性',lambda:setattr(u,'energy',u.energy+2),'所有己方灵兽获得2能量：当前存活己方仅自身')
  for sk in u.ammo:
   before=u.ammo[sk];self.change(u,self.who(u)+' / 特性',lambda:u.ammo.__setitem__(sk,min(4,u.ammo[sk]+1)),f'{sk}装填1枚，实际+{min(4,before+1)-before}，容量上限4')
 def act(self,u,v):
  active=[s for s in u.skills if s!='蜷缩'];skill=active[u.action_index%len(active)];u.action_index+=1;source=f'{self.who(u)} / {skill}'
  if skill=='蓄能':self.change(u,source,lambda:setattr(u,'energy',u.energy+2),'充能2');u.used[skill]+=1;return
  distance=abs(u.pos-v.pos);low,high=(1,1) if skill=='蜈蚣锁' else ((2,2) if skill=='龙牙斩' else (1,6))
  if not low<=distance<=high:
   direction=1 if v.pos>u.pos else -1;new=u.pos+(direction if distance>high else -direction)
   if 0<=new<=6 and new!=v.pos:self.change(u,source,lambda:setattr(u,'pos',new),'为满足射程移动1格')
   distance=abs(u.pos-v.pos)
  if not low<=distance<=high:self.log(source,self.who(v),f'距离{distance}格，不满足射程{low}～{high}格；本次不出招');return
  if skill in u.ammo:
   if u.ammo[skill]<=0:self.log(source,self.who(v),'弹药为0，本次不触发');return
   self.change(u,source,lambda:u.ammo.__setitem__(skill,u.ammo[skill]-1),'使用技能，弹药-1')
  forced=skill=='冲刺拳' and u.used[skill]==0;rate=.35 if u.name=='巨鳄蚁' else 0
  roll=None if forced or rate==0 else self.rng.random();crit=forced or (roll is not None and roll<rate);u.used[skill]+=1
  base={'蜈蚣锁':3,'袖箭':10,'冲刺拳':5,'龙牙斩':5}[skill];raw=(base+u.atk+u.growth[skill])*(2 if crit else 1)
  self.log(source,self.who(v),f'第{u.used[skill]}次出招；距离{distance}格；伤害=({base}+攻击{u.atk}+成长{u.growth[skill]})×{2 if crit else 1}={raw}；'+('首次冲刺拳必暴' if forced else (f'暴击35%，掷值{roll:.6f}，'+('暴击' if crit else '未暴击') if roll is not None else '暴击率0%')))
  self.damage(v,raw,source)
  if self.dead():return
  if skill=='蜈蚣锁':
   amount=2*(2 if crit else 1);self.poison_apply(v,amount,source)
   if self.dead():return
   self.poison_apply(u,amount,source)
  if self.dead():return
  if crit and '龙牙斩' in u.skills:
   for s in u.skills:
    if '武技' in CAT[s]['fields']['词条']:self.change(u,self.who(u)+' / 龙牙斩',lambda:u.growth.__setitem__(s,u.growth[s]+5),f'{s}伤害+5（下次攻击起生效）',f'{skill}触发暴击')
 def run(self):
  for u in self.units:self.log('阵容初始化',self.who(u),f'{u.build}；技能：'+'、'.join(u.skills)+f'；攻击{u.atk}，含装备总防御{u.defense}',None,u.snap())
  for r in range(1,101):
   self.round=r;order=self.units if r%2 else self.units[::-1];self.phase='回合开始'
   self.log('回合时序','双方','本回合行动顺序：'+' → '.join(self.who(u) for u in order))
   for u in order:self.turn_start(u)
   self.phase='行动'
   for u in order:
    self.act(u,next(v for v in self.units if v is not u))
    if self.dead():break
   if self.dead():break
   self.phase='回合结束'
   for u in order:
    self.poison_tick(u,self.who(u)+' / 回合结束剧毒')
    if self.dead():break
    if u.regen:
     healed=min(u.regen,u.maxhp-u.hp);self.change(u,self.who(u)+' / 再生',lambda:setattr(u,'hp',u.hp+healed),f'再生{u.regen}，实际治疗{healed}')
    if u.name=='玄铁龟':self.change(u,self.who(u)+' / 特性',lambda:setattr(u,'energy',u.energy+1),'回合结束能量+1')
   if self.dead():break
  alive=[u for u in self.units if u.hp>0];winner=alive[0].build if len(alive)==1 else '平局'
  return dict(seed=self.seed,rounds=self.round,winner=winner,teams=[dict(side=u.side,build=u.build,pet=u.name,skills=u.skills,final=u.snap()) for u in self.units],events=self.events)

def delta(e):
 if e['before'] is None:return json.dumps(e['after'],ensure_ascii=False) if e['after'] else ''
 return '；'.join(f'{k}：{e["before"][k]} → {v}' for k,v in e['after'].items() if e['before'][k]!=v) or '状态不变'

def main():
 battles=[Battle(PRESETS[a],PRESETS[b],seed).run() for a,b,seed in [(0,1,2026090901),(1,2,2026090902),(2,0,2026090903)]]
 # Same inputs must reproduce all events, not just the winner.
 again=[Battle(PRESETS[a],PRESETS[b],seed).run() for a,b,seed in [(0,1,2026090901),(1,2,2026090902),(2,0,2026090903)]]
 assert battles==again
 for b in battles:
  for e in b['events']:
   if e['after']:
    assert all(e['after'][k]>=0 for k in ['生命','护盾','剧毒','再生','能量'])
    assert all(0<=v<=4 for v in e['after']['弹药'].values())
 (ROOT/'三场战斗.json').write_text(json.dumps(dict(rules=RULES,battles=battles,sourceHashes=DATA['meta']['sourceHashes']),ensure_ascii=False,indent=2))
 (ROOT/'模拟规则.md').write_text('# 本次对战的暂定规则\n\n原型模拟，非正式平衡结论。输入来自 `新数值.xlsx` 最低品质记录。\n\n'+'\n\n'.join(f'{i+1}. {r}' for i,r in enumerate(RULES)))
 for i,b in enumerate(battles,1):
  lines=[f'# 第{i}场：{b["teams"][0]["build"]} vs {b["teams"][1]["build"]}',f'\n结果：{b["winner"]}；{b["rounds"]}回合；随机种子 {b["seed"]}。\n\n这是按《模拟规则.md》暂定规则运行的原型对战。\n']
  current=None
  for e in b['events']:
   group=(e['round'],e['phase'])
   if group!=current:lines.append(f'\n## 回合{e["round"]} · {e["phase"]}\n');current=group
   lines.append(f'**#{e["seq"]} {e["source"]} → {e["target"]}**  \n{e["effect"]}'+(f'  \n触发原因：{e["trigger"]}' if e['trigger'] else '')+(f'  \n{delta(e)}' if delta(e) else '')+'\n')
  (ROOT/f'第{i}场_完整日志.md').write_text('\n'.join(lines))
 print(json.dumps([dict(match=i+1,winner=b['winner'],rounds=b['rounds'],events=len(b['events']),teams=b['teams']) for i,b in enumerate(battles)],ensure_ascii=False,indent=2))
 return battles
if __name__=='__main__':main()
