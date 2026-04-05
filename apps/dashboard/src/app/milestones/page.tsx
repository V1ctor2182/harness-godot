'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';

const MILESTONES = [
  {
    id: 'M0', name: '移动与农场场景', en: 'Player Movement & Farm Scene', weeks: '1w',
    goals: ['WASD 移动', '摄像机跟随', '碰撞检测', '边界检测', '60fps 稳定'],
    features: ['CharacterBody2D Player', 'Camera2D smoothing', 'Farm scene'],
  },
  {
    id: 'M1', name: '种植核心循环', en: 'Core Planting Cycle', weeks: '2w',
    goals: ['种植僵尸种子', '5 阶段视觉生长', '浇水机制', '收获系统', '6 个地块'],
    features: ['SoilPlot scene', 'GrowthManager', 'WateringSystem', 'HarvestManager'],
  },
  {
    id: 'M2', name: '僵尸生活与管理', en: 'Zombie Life & Management', weeks: '2w',
    goals: ['僵尸自由漫游', '随机命名', '个体属性', '玩家互动(F键)', '抚摸机制', 'HUD 显示'],
    features: ['ZombieEntity scene', 'NameGenerator', 'StatsPanel UI', 'PettingSystem'],
  },
  {
    id: 'M3', name: '多种僵尸与种子系统', en: 'Zombie Types & Seed System', weeks: '2w',
    goals: ['4 类僵尸(行尸/飞僵/力士/吐客)', '种子背包 UI', '种植前选种', '类型特化属性'],
    features: ['SeedInventory autoload', 'SeedSelectionUI', 'ZombieType enum'],
  },
  {
    id: 'M4', name: '自动战斗系统', en: 'Auto Combat System', weeks: '3w',
    goals: ['世界地图(3 目标)', '编队界面', '自动战斗', '永久死亡', '胜利奖励'],
    features: ['WorldMap scene', 'SquadBuilder UI', 'BattleScene', 'CombatManager'],
  },
  {
    id: 'M5', name: '资源经济与建造系统', en: 'Resources & Building', weeks: '2-3w',
    goals: ['4 种资源', '可采集资源点', '建造模式', '4 初始建筑', '种子商店'],
    features: ['ResourceManager', 'BuildMode', 'ShopUI', 'Buildings system'],
  },
  {
    id: 'M6', name: '收获品质与肥料系统', en: 'Harvest Quality & Fertilizer', weeks: '1-2w',
    goals: ['4 品质(铜/银/金/虹)', '品质影响属性', '骨粉肥料', '品质视觉效果'],
    features: ['QualitySystem', 'FertilizerCrafting', 'QualityVFX'],
  },
  {
    id: 'M7', name: '玩家等级与技能树', en: 'Player Level & Skill Tree', weeks: '2w',
    goals: ['经验值系统', '建筑解锁', '3 分支技能树(战斗/经济/死灵)', '9 技能'],
    features: ['PlayerProgression autoload', 'SkillTreeUI', 'XPManager'],
  },
  {
    id: 'M8', name: '突变与僵尸进化', en: 'Mutations & Evolution', weeks: '2-3w',
    goals: ['突变实验室', '4 种突变', '催化剂系统', '僵尸融合', '隐藏基因'],
    features: ['MutationLab scene', 'MutationManager', 'FusionSystem', 'GeneSystem'],
  },
  {
    id: 'M9', name: '养护与羁绊', en: 'Nurture & Bonds', weeks: '2-2.5w',
    goals: ['心情系统', '喂食机制', '衰变系统', '地窖存储', '7 种羁绊'],
    features: ['MoodSystem', 'FeedingSystem', 'DecayManager', 'BondSystem'],
  },
  {
    id: 'M10', name: '天气与日夜循环', en: 'Weather & Day/Night', weeks: '1w',
    goals: ['30 分钟日夜', '5 种天气', '夜间加速', '日夜 UI 时钟', '睡眠跳过'],
    features: ['TimeManager', 'WeatherSystem', 'DayNightCycle'],
  },
  {
    id: 'M11', name: '世界地图与PvE探索', en: 'World Map & PvE Exploration', weeks: '3-4w',
    goals: ['3 个探索区域', '副本(3-5 房间)', 'NPC 系统', '被动资源生成', '征服追踪'],
    features: ['ExplorationScene', 'DungeonGenerator', 'NPCSystem', 'TerritoryManager'],
  },
  {
    id: 'M12', name: '战斗系统深化', en: 'Advanced Combat', weeks: '4-5w',
    goals: ['障碍物/陷阱', '3 车道战斗', '状态效果', '风险评估面板', '死灵法师主动技能', '波次系统'],
    features: ['AdvancedBattleScene', 'StatusEffects', 'RiskPanel', 'NecromancerSkills'],
  },
  {
    id: 'M13', name: '基地防御与入侵', en: 'Base Defense & Raids', weeks: '2w',
    goals: ['人类反攻事件', '防御建筑', '实时农场战斗', '战略布局'],
    features: ['RaidManager', 'DefenseBuildings', 'FarmBattleMode'],
  },
  {
    id: 'M14', name: '存档与完整游戏循环', en: 'Save System & Game Loop', weeks: '2w',
    goals: ['存档/读档', '主菜单', '教程系统', '完整日循环验证', '统计面板'],
    features: ['SaveManager', 'MainMenu scene', 'TutorialSystem', 'StatsPanel'],
  },
  {
    id: 'M15', name: '美术替换与打磨', en: 'Art & Polish', weeks: '4-6w',
    goals: ['像素风精灵(32x32)', '移动动画(4 帧)', '攻击动画', '音效/BGM', '粒子特效', 'UI 主题'],
    features: ['SpriteSheets', 'AnimationFrames', 'AudioManager', 'ParticleVFX'],
  },
];

interface CycleData {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  metrics?: { totalCostUsd: number; tasksCompleted: number; tasksFailed: number };
  startedAt: string;
  completedAt?: string;
}

interface TaskData {
  _id: string;
  status: string;
  title: string;
  type: string;
  cycleId: number;
}

export default function MilestonesPage() {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);

  useEffect(() => {
    api.listCycles().then((c) => setCycles(c as CycleData[]));
    api.listTasks({}).then((t) => setTasks(t as TaskData[]));
  }, []);

  // Map cycles to milestones by matching M{N} in goal
  function getCyclesForMilestone(milestoneId: string): CycleData[] {
    return cycles.filter((c) => c.goal?.includes(milestoneId));
  }

  function getMilestoneStatus(idx: number): 'done' | 'in-progress' | 'pending' {
    const m = MILESTONES[idx];
    const mCycles = getCyclesForMilestone(m.id);
    if (mCycles.some((c) => c.status === 'active')) return 'in-progress';
    if (mCycles.some((c) => c.status === 'completed')) return 'done';
    // Check if any earlier milestone is still in progress
    for (let i = 0; i < idx; i++) {
      const earlier = getCyclesForMilestone(MILESTONES[i].id);
      if (earlier.some((c) => c.status === 'active') || earlier.length === 0) return 'pending';
    }
    return 'pending';
  }

  function getMilestoneCost(milestoneId: string): number {
    return getCyclesForMilestone(milestoneId)
      .filter((c) => c.metrics?.totalCostUsd)
      .reduce((sum, c) => sum + (c.metrics?.totalCostUsd ?? 0), 0);
  }

  function getTasksForMilestone(milestoneId: string): TaskData[] {
    const mileCycles = getCyclesForMilestone(milestoneId).map((c) => c._id);
    return tasks.filter((t) => mileCycles.includes(t.cycleId));
  }

  const totalCost = cycles.reduce((sum, c) => sum + (c.metrics?.totalCostUsd ?? 0), 0);
  const doneMilestones = MILESTONES.filter((_, i) => getMilestoneStatus(i) === 'done').length;

  return (
    <div className="pt-4 font-mono">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Milestones</h1>
          <p className="text-xs text-muted-foreground">
            M0–M15 · {doneMilestones}/{MILESTONES.length} done · ${totalCost.toFixed(2)} total spend
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 flex gap-0.5">
        {MILESTONES.map((m, i) => {
          const status = getMilestoneStatus(i);
          return (
            <div
              key={m.id}
              className={`h-3 flex-1 rounded-sm cursor-pointer transition-colors ${
                status === 'done' ? 'bg-success' : status === 'in-progress' ? 'bg-primary animate-pulse' : 'bg-muted'
              }`}
              title={`${m.id}: ${m.name}`}
              onClick={() => setExpandedMilestone(expandedMilestone === m.id ? null : m.id)}
            />
          );
        })}
      </div>

      {/* Milestone list */}
      <div className="space-y-2">
        {MILESTONES.map((m, i) => {
          const status = getMilestoneStatus(i);
          const mCycles = getCyclesForMilestone(m.id);
          const mTasks = getTasksForMilestone(m.id);
          const cost = getMilestoneCost(m.id);
          const isExpanded = expandedMilestone === m.id;
          const tasksDone = mTasks.filter((t) => t.status === 'done').length;
          const tasksFailed = mTasks.filter((t) => t.status === 'failed').length;

          return (
            <Card
              key={m.id}
              className={`cursor-pointer transition-colors ${
                status === 'done' ? 'border-success/20' : status === 'in-progress' ? 'border-primary/30' : ''
              }`}
              onClick={() => setExpandedMilestone(isExpanded ? null : m.id)}
            >
              <CardContent className="pt-3 pb-3">
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${
                    status === 'done' ? 'text-success' : status === 'in-progress' ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {m.id}
                  </span>
                  <span className="text-sm font-medium text-foreground">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground">{m.en}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{m.weeks}</span>
                  {status === 'done' && <Badge variant="outline" className="text-[9px] border-success/30 text-success">✓ Done</Badge>}
                  {status === 'in-progress' && <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">● Active</Badge>}
                  {status === 'pending' && <Badge variant="outline" className="text-[9px]">Pending</Badge>}
                  {cost > 0 && <span className="text-[10px] text-muted-foreground">${cost.toFixed(2)}</span>}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Goals */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Goals</p>
                        <div className="space-y-0.5">
                          {m.goals.map((g, gi) => (
                            <div key={gi} className="flex items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">
                                {status === 'done' ? '✅' : '⬜'}
                              </span>
                              <span className={status === 'done' ? 'text-foreground' : 'text-muted-foreground'}>{g}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Features to implement */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Key Features</p>
                        <div className="flex flex-wrap gap-1">
                          {m.features.map((f) => (
                            <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Cycles for this milestone */}
                    {mCycles.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          Cycles ({mCycles.length}) · Tasks: {tasksDone} done, {tasksFailed} failed, {mTasks.length} total
                        </p>
                        <div className="space-y-1">
                          {mCycles.map((c) => (
                            <div key={c._id} className="flex items-center gap-2 text-xs">
                              <Link href={`/cycles/${c._id}`} className="text-primary hover:underline">#{c._id}</Link>
                              <StatusBadge status={c.status} className="text-[9px]" />
                              <StatusBadge status={c.phase} className="text-[9px]" />
                              <span className="text-foreground truncate">{c.goal}</span>
                              {c.metrics?.totalCostUsd && (
                                <span className="ml-auto text-muted-foreground">${c.metrics.totalCostUsd.toFixed(2)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {mCycles.length === 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">No cycles yet for this milestone.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
