import unittest
from simulate import Battle,PRESETS
class CombatTests(unittest.TestCase):
 def test_first_crit_then_growth(self):
  b=Battle(PRESETS[2],PRESETS[1],1);a,v=b.units;b.act(a,v)
  self.assertEqual(v.hp,105) # (5+4)*2 - defense3
  self.assertEqual(a.growth,{'冲刺拳':5,'龙牙斩':5})
 def test_no_ammo_no_damage(self):
  b=Battle(PRESETS[1],PRESETS[2],1);a,v=b.units;a.action_index=1;a.ammo['袖箭']=0;hp=v.hp;b.act(a,v)
  self.assertEqual(v.hp,hp);self.assertEqual(a.ammo['袖箭'],0)
 def test_energy_gate_and_capacity(self):
  b=Battle(PRESETS[1],PRESETS[2],1);a,_=b.units;a.energy=5;b.turn_start(a);self.assertEqual(a.energy,5)
  a.energy=6;a.ammo['袖箭']=4;b.turn_start(a);self.assertEqual(a.energy,2);self.assertEqual(a.ammo['袖箭'],4)
 def test_self_poison_shield_random_growth(self):
  b=Battle(PRESETS[0],PRESETS[1],7);a,_=b.units;b.poison_apply(a,2,'test')
  self.assertEqual((a.poison,a.shield,a.regen),(2,25,2));self.assertEqual(sum(a.growth.values()),10)
  b.poison_apply(a,2,'test');self.assertEqual((a.hp,a.poison,a.shield,a.regen),(106,3,50,4));self.assertEqual(sum(a.growth.values()),20)
 def test_range_is_not_ignored(self):
  b=Battle(PRESETS[0],PRESETS[1],1);a,v=b.units;b.act(a,v)
  self.assertEqual(v.hp,v.maxhp);self.assertEqual(a.pos,2);self.assertEqual(a.poison,0)
 def test_death_ends_before_enemy_action(self):
  b=Battle(PRESETS[2],PRESETS[1],1);b.units[1].hp=1;result=b.run()
  death=next(i for i,e in enumerate(result['events']) if e['effect']=='生命归零，立即死亡')
  self.assertEqual(death,len(result['events'])-1);self.assertEqual(result['winner'],'暴击养武技')
 def test_identical_seed_identical_events(self):
  self.assertEqual(Battle(PRESETS[0],PRESETS[2],52).run(),Battle(PRESETS[0],PRESETS[2],52).run())
if __name__=='__main__':unittest.main()
