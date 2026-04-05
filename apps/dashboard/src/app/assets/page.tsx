'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── Asset taxonomy from architecture 09-asset-pipeline.md ──────────

interface AssetSpec {
  asset_id: string;
  category: string;
  subcategory: string;
  name: string;
  type: string;
  spec: string; // human-readable spec summary
  status: 'planned' | 'placeholder' | 'replaced' | 'final';
  milestone: string; // when this asset is first needed
  priority: 'high' | 'medium' | 'low';
}

const CATEGORIES = [
  {
    id: 'sprite',
    label: '精灵/图片',
    en: 'Sprites',
    icon: '🎨',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    subcategories: ['characters', 'items', 'buildings', 'environment'],
  },
  {
    id: 'tilemap',
    label: '地图瓦片',
    en: 'Tilemaps',
    icon: '🗺️',
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    subcategories: ['farm', 'dungeon', 'world'],
  },
  {
    id: 'ui',
    label: '界面素材',
    en: 'UI',
    icon: '🖥️',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    subcategories: ['icons', 'panels', 'buttons', 'fonts', 'themes'],
  },
  {
    id: 'animation',
    label: '动画',
    en: 'Animations',
    icon: '🎬',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    subcategories: ['spriteframes', 'sheets'],
  },
  {
    id: 'vfx',
    label: '视觉特效',
    en: 'VFX',
    icon: '✨',
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    subcategories: ['particles', 'shaders'],
  },
  {
    id: 'audio_sfx',
    label: '音效',
    en: 'SFX',
    icon: '🔊',
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    subcategories: ['combat', 'farming', 'ui', 'ambient'],
  },
  {
    id: 'audio_bgm',
    label: '背景音乐',
    en: 'BGM',
    icon: '🎵',
    color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    subcategories: ['scenes', 'combat'],
  },
];

// Full planned asset inventory from PRD + architecture docs
const PLANNED_ASSETS: AssetSpec[] = [
  // ─── M0: Movement ─────────────────
  { asset_id: 'sprite.characters.player', category: 'sprite', subcategory: 'characters', name: 'player', type: 'texture', spec: '32×32, 4 hframes (walk)', status: 'planned', milestone: 'M0', priority: 'high' },
  { asset_id: 'tilemap.farm_ground', category: 'tilemap', subcategory: 'farm', name: 'farm_ground', type: 'texture', spec: '16×16 tileset, seamless', status: 'planned', milestone: 'M0', priority: 'high' },

  // ─── M1: Planting ─────────────────
  { asset_id: 'sprite.environment.soil_plot', category: 'sprite', subcategory: 'environment', name: 'soil_plot', type: 'texture', spec: '32×32, 3 states (empty/planted/ready)', status: 'planned', milestone: 'M1', priority: 'high' },
  { asset_id: 'sprite.items.seed_generic', category: 'sprite', subcategory: 'items', name: 'seed_generic', type: 'texture', spec: '16×16', status: 'planned', milestone: 'M1', priority: 'high' },
  { asset_id: 'animation.zombie_grow', category: 'animation', subcategory: 'spriteframes', name: 'zombie_grow', type: 'spriteframes', spec: '5 stages, 32×32 each', status: 'planned', milestone: 'M1', priority: 'high' },
  { asset_id: 'audio_sfx.plant', category: 'audio_sfx', subcategory: 'farming', name: 'plant', type: 'audio', spec: 'WAV, <0.5s, dirt sound', status: 'planned', milestone: 'M1', priority: 'medium' },
  { asset_id: 'audio_sfx.water', category: 'audio_sfx', subcategory: 'farming', name: 'water', type: 'audio', spec: 'WAV, <0.5s, splash', status: 'planned', milestone: 'M1', priority: 'medium' },
  { asset_id: 'audio_sfx.harvest', category: 'audio_sfx', subcategory: 'farming', name: 'harvest', type: 'audio', spec: 'WAV, <1s, ascending scale', status: 'planned', milestone: 'M1', priority: 'high' },

  // ─── M2: Zombie Life ──────────────
  { asset_id: 'sprite.characters.zombie_base', category: 'sprite', subcategory: 'characters', name: 'zombie_base', type: 'texture', spec: '32×32, 4 hframes (idle walk)', status: 'planned', milestone: 'M2', priority: 'high' },
  { asset_id: 'ui.panels.stats_panel', category: 'ui', subcategory: 'panels', name: 'stats_panel', type: 'texture', spec: '200×300, semi-transparent', status: 'planned', milestone: 'M2', priority: 'medium' },
  { asset_id: 'audio_sfx.pet', category: 'audio_sfx', subcategory: 'farming', name: 'pet', type: 'audio', spec: 'WAV, <0.5s, happy sound', status: 'planned', milestone: 'M2', priority: 'low' },

  // ─── M3: Types & Seeds ────────────
  { asset_id: 'sprite.characters.zombie_shambler', category: 'sprite', subcategory: 'characters', name: 'zombie_shambler', type: 'texture', spec: '32×32, 4 hframes, blue tint', status: 'planned', milestone: 'M3', priority: 'high' },
  { asset_id: 'sprite.characters.zombie_runner', category: 'sprite', subcategory: 'characters', name: 'zombie_runner', type: 'texture', spec: '32×32, 4 hframes, green tint', status: 'planned', milestone: 'M3', priority: 'high' },
  { asset_id: 'sprite.characters.zombie_brute', category: 'sprite', subcategory: 'characters', name: 'zombie_brute', type: 'texture', spec: '32×48, 4 hframes, large', status: 'planned', milestone: 'M3', priority: 'high' },
  { asset_id: 'sprite.characters.zombie_spitter', category: 'sprite', subcategory: 'characters', name: 'zombie_spitter', type: 'texture', spec: '32×32, 4 hframes, purple tint', status: 'planned', milestone: 'M3', priority: 'high' },
  { asset_id: 'sprite.items.seed_shambler', category: 'sprite', subcategory: 'items', name: 'seed_shambler', type: 'texture', spec: '16×16, blue', status: 'planned', milestone: 'M3', priority: 'medium' },
  { asset_id: 'sprite.items.seed_runner', category: 'sprite', subcategory: 'items', name: 'seed_runner', type: 'texture', spec: '16×16, green', status: 'planned', milestone: 'M3', priority: 'medium' },
  { asset_id: 'sprite.items.seed_brute', category: 'sprite', subcategory: 'items', name: 'seed_brute', type: 'texture', spec: '16×16, red', status: 'planned', milestone: 'M3', priority: 'medium' },
  { asset_id: 'sprite.items.seed_spitter', category: 'sprite', subcategory: 'items', name: 'seed_spitter', type: 'texture', spec: '16×16, purple', status: 'planned', milestone: 'M3', priority: 'medium' },
  { asset_id: 'ui.panels.seed_inventory', category: 'ui', subcategory: 'panels', name: 'seed_inventory', type: 'texture', spec: '300×400 grid panel', status: 'planned', milestone: 'M3', priority: 'high' },

  // ─── M4: Combat ────────────────────
  { asset_id: 'sprite.characters.enemy_villager', category: 'sprite', subcategory: 'characters', name: 'enemy_villager', type: 'texture', spec: '32×32, 4 hframes, human', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'sprite.characters.enemy_soldier', category: 'sprite', subcategory: 'characters', name: 'enemy_soldier', type: 'texture', spec: '32×32, 4 hframes, armored', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'sprite.characters.enemy_archer', category: 'sprite', subcategory: 'characters', name: 'enemy_archer', type: 'texture', spec: '32×32, 4 hframes, ranged', status: 'planned', milestone: 'M4', priority: 'medium' },
  { asset_id: 'ui.panels.squad_builder', category: 'ui', subcategory: 'panels', name: 'squad_builder', type: 'texture', spec: '400×300 drag-drop panel', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'audio_sfx.attack_melee', category: 'audio_sfx', subcategory: 'combat', name: 'attack_melee', type: 'audio', spec: 'WAV, <0.3s, short high-freq', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'audio_sfx.attack_ranged', category: 'audio_sfx', subcategory: 'combat', name: 'attack_ranged', type: 'audio', spec: 'WAV, <0.5s, whoosh', status: 'planned', milestone: 'M4', priority: 'medium' },
  { asset_id: 'audio_sfx.zombie_death', category: 'audio_sfx', subcategory: 'combat', name: 'zombie_death', type: 'audio', spec: 'WAV, <1s, thud+fade', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'audio_bgm.battle', category: 'audio_bgm', subcategory: 'combat', name: 'battle', type: 'audio', spec: 'OGG, loop, 60-120s, intense chiptune', status: 'planned', milestone: 'M4', priority: 'high' },
  { asset_id: 'audio_bgm.farm', category: 'audio_bgm', subcategory: 'scenes', name: 'farm', type: 'audio', spec: 'OGG, loop, 60-180s, calm chiptune', status: 'planned', milestone: 'M0', priority: 'medium' },

  // ─── M5: Economy & Buildings ───────
  { asset_id: 'sprite.buildings.grave_plot', category: 'sprite', subcategory: 'buildings', name: 'grave_plot', type: 'texture', spec: '64×96', status: 'planned', milestone: 'M5', priority: 'high' },
  { asset_id: 'sprite.buildings.blood_well', category: 'sprite', subcategory: 'buildings', name: 'blood_well', type: 'texture', spec: '64×96', status: 'planned', milestone: 'M5', priority: 'high' },
  { asset_id: 'sprite.buildings.bone_mill', category: 'sprite', subcategory: 'buildings', name: 'bone_mill', type: 'texture', spec: '64×96', status: 'planned', milestone: 'M5', priority: 'high' },
  { asset_id: 'sprite.buildings.mausoleum', category: 'sprite', subcategory: 'buildings', name: 'mausoleum', type: 'texture', spec: '64×96', status: 'planned', milestone: 'M5', priority: 'medium' },
  { asset_id: 'ui.icons.resource_dark_coins', category: 'ui', subcategory: 'icons', name: 'resource_dark_coins', type: 'texture', spec: '16×16', status: 'planned', milestone: 'M5', priority: 'high' },
  { asset_id: 'ui.icons.resource_bones', category: 'ui', subcategory: 'icons', name: 'resource_bones', type: 'texture', spec: '16×16', status: 'planned', milestone: 'M5', priority: 'high' },
  { asset_id: 'ui.icons.resource_rotten_wood', category: 'ui', subcategory: 'icons', name: 'resource_rotten_wood', type: 'texture', spec: '16×16', status: 'planned', milestone: 'M5', priority: 'medium' },
  { asset_id: 'ui.icons.resource_blood_water', category: 'ui', subcategory: 'icons', name: 'resource_blood_water', type: 'texture', spec: '16×16', status: 'planned', milestone: 'M5', priority: 'medium' },
  { asset_id: 'audio_sfx.build', category: 'audio_sfx', subcategory: 'farming', name: 'build', type: 'audio', spec: 'WAV, <1s, hammer', status: 'planned', milestone: 'M5', priority: 'medium' },
  { asset_id: 'audio_sfx.coin', category: 'audio_sfx', subcategory: 'ui', name: 'coin', type: 'audio', spec: 'WAV, <0.3s, ching', status: 'planned', milestone: 'M5', priority: 'medium' },

  // ─── M6: Quality ───────────────────
  { asset_id: 'vfx.particles.quality_bronze', category: 'vfx', subcategory: 'particles', name: 'quality_bronze', type: 'texture', spec: '8×8, brown glow', status: 'planned', milestone: 'M6', priority: 'low' },
  { asset_id: 'vfx.particles.quality_silver', category: 'vfx', subcategory: 'particles', name: 'quality_silver', type: 'texture', spec: '8×8, silver shimmer', status: 'planned', milestone: 'M6', priority: 'low' },
  { asset_id: 'vfx.particles.quality_gold', category: 'vfx', subcategory: 'particles', name: 'quality_gold', type: 'texture', spec: '8×8, gold sparkle', status: 'planned', milestone: 'M6', priority: 'medium' },
  { asset_id: 'vfx.particles.quality_iridium', category: 'vfx', subcategory: 'particles', name: 'quality_iridium', type: 'texture', spec: '8×8, rainbow glow', status: 'planned', milestone: 'M6', priority: 'medium' },

  // ─── M8: Mutations ─────────────────
  { asset_id: 'sprite.buildings.mutation_lab', category: 'sprite', subcategory: 'buildings', name: 'mutation_lab', type: 'texture', spec: '64×96', status: 'planned', milestone: 'M8', priority: 'high' },
  { asset_id: 'vfx.particles.mutation_glow', category: 'vfx', subcategory: 'particles', name: 'mutation_glow', type: 'texture', spec: '16×16, green pulse', status: 'planned', milestone: 'M8', priority: 'medium' },
  { asset_id: 'audio_sfx.mutation_success', category: 'audio_sfx', subcategory: 'farming', name: 'mutation_success', type: 'audio', spec: 'WAV, <1s, magical ascend', status: 'planned', milestone: 'M8', priority: 'medium' },
  { asset_id: 'audio_sfx.mutation_fail', category: 'audio_sfx', subcategory: 'farming', name: 'mutation_fail', type: 'audio', spec: 'WAV, <0.5s, fizzle', status: 'planned', milestone: 'M8', priority: 'low' },

  // ─── M15: Polish (UI theme) ────────
  { asset_id: 'ui.fonts.main', category: 'ui', subcategory: 'fonts', name: 'main', type: 'font', spec: 'Pixel font, sizes [12,16,24,32]', status: 'planned', milestone: 'M15', priority: 'high' },
  { asset_id: 'ui.themes.default', category: 'ui', subcategory: 'themes', name: 'default', type: 'theme', spec: 'Dark theme, Chinese xianxia style', status: 'planned', milestone: 'M15', priority: 'high' },
  { asset_id: 'audio_sfx.ui_click', category: 'audio_sfx', subcategory: 'ui', name: 'ui_click', type: 'audio', spec: 'WAV, <0.1s, soft tap', status: 'planned', milestone: 'M15', priority: 'low' },
  { asset_id: 'audio_sfx.ui_hover', category: 'audio_sfx', subcategory: 'ui', name: 'ui_hover', type: 'audio', spec: 'WAV, <0.1s, subtle', status: 'planned', milestone: 'M15', priority: 'low' },
];

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-muted text-muted-foreground',
  placeholder: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  replaced: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  final: 'bg-success/10 text-success border-success/20',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-destructive',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

export default function AssetsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);

  const filteredAssets = PLANNED_ASSETS.filter((a) => {
    if (selectedCategory && a.category !== selectedCategory) return false;
    if (selectedMilestone && a.milestone !== selectedMilestone) return false;
    return true;
  });

  // Stats
  const totalAssets = PLANNED_ASSETS.length;
  const byStatus = PLANNED_ASSETS.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );
  const byCategory = PLANNED_ASSETS.reduce(
    (acc, a) => { acc[a.category] = (acc[a.category] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const milestones = [...new Set(PLANNED_ASSETS.map((a) => a.milestone))].sort();

  return (
    <div className="pt-4 font-mono">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Assets</h1>
        <p className="text-xs text-muted-foreground">
          Asset Pipeline — Registry 映射 + ID 引用，未来美术替换零改代码
        </p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Assets</p>
            <span className="text-2xl font-bold">{totalAssets}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Planned</p>
            <span className="text-2xl font-bold text-muted-foreground">{byStatus['planned'] || 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Placeholder</p>
            <span className="text-2xl font-bold text-yellow-400">{byStatus['placeholder'] || 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Replaced</p>
            <span className="text-2xl font-bold text-blue-400">{byStatus['replaced'] || 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Final</p>
            <span className="text-2xl font-bold text-success">{byStatus['final'] || 0}</span>
          </CardContent>
        </Card>
      </div>

      {/* Category filter cards */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {CATEGORIES.map((cat) => {
          const count = byCategory[cat.id] || 0;
          const isSelected = selectedCategory === cat.id;
          return (
            <Card
              key={cat.id}
              className={`cursor-pointer transition-all ${isSelected ? 'ring-1 ring-primary' : ''}`}
              onClick={() => setSelectedCategory(isSelected ? null : cat.id)}
            >
              <CardContent className="pt-2 pb-2 text-center">
                <span className="text-lg">{cat.icon}</span>
                <p className="text-[10px] font-semibold mt-0.5">{cat.label}</p>
                <p className="text-[9px] text-muted-foreground">{cat.en}</p>
                <Badge variant="outline" className={`text-[9px] mt-1 ${cat.color}`}>{count}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Milestone filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        <button
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${!selectedMilestone ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          onClick={() => setSelectedMilestone(null)}
        >
          All
        </button>
        {milestones.map((m) => (
          <button
            key={m}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${selectedMilestone === m ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            onClick={() => setSelectedMilestone(selectedMilestone === m ? null : m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Asset list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {selectedCategory
              ? `${CATEGORIES.find((c) => c.id === selectedCategory)?.icon} ${CATEGORIES.find((c) => c.id === selectedCategory)?.label}`
              : 'All Assets'
            }
            {selectedMilestone ? ` · ${selectedMilestone}` : ''}
            <span className="text-muted-foreground font-normal ml-2">({filteredAssets.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {filteredAssets.map((asset) => {
              const cat = CATEGORIES.find((c) => c.id === asset.category);
              return (
                <div
                  key={asset.asset_id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded text-xs hover:bg-muted/50 border-b border-border/50"
                >
                  <span className="w-5 text-center shrink-0">{cat?.icon}</span>
                  <code className="text-primary shrink-0 text-[11px]">{asset.asset_id}</code>
                  <span className="text-muted-foreground truncate flex-1">{asset.spec}</span>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${STATUS_COLORS[asset.status]}`}>
                    {asset.status}
                  </Badge>
                  <span className={`text-[9px] shrink-0 ${PRIORITY_COLORS[asset.priority]}`}>
                    {asset.priority === 'high' ? '●' : asset.priority === 'medium' ? '○' : '·'}
                  </span>
                  <span className="text-[9px] text-muted-foreground shrink-0 w-8">{asset.milestone}</span>
                </div>
              );
            })}
            {filteredAssets.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No assets match filter</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reference info */}
      <Card className="mt-4">
        <CardContent className="pt-3 pb-3">
          <p className="text-[10px] text-muted-foreground">
            <strong>Asset Pipeline 状态：</strong> Phase 5 (未实现)。
            当前展示的是从 PRD + 架构文档提取的计划资源清单。
            Phase 5 实现后，此页面将从 <code>registry/*.json</code> 读取实时数据，展示占位→替换进度。
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            <strong>引用方式：</strong> <code>AssetManager.get_texture(&quot;sprite.characters.player&quot;)</code> — 代码永远不直接写路径
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
