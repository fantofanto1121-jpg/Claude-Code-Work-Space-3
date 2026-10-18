/* ===========================================================
   assets.js — 素材の一覧と読み込み
   一覧は assets/metadata/asset_manifest.json から生成したもの
   =========================================================== */
'use strict';

const ASSET_FILES = {
  bg_castle:                 { src: 'assets/backgrounds/far/bg_castle.png', w: 768, h: 512 },
  bg_clouds_mid:             { src: 'assets/backgrounds/mid/bg_clouds_mid.png', w: 1536, h: 512 },
  bg_far_mountains:          { src: 'assets/backgrounds/far/bg_far_mountains.png', w: 1536, h: 512 },
  bg_floating_islands_far:   { src: 'assets/backgrounds/far/bg_floating_islands_far.png', w: 1536, h: 768 },
  bg_floating_islands_mid:   { src: 'assets/backgrounds/mid/bg_floating_islands_mid.png', w: 1536, h: 768 },
  bg_forest_decoration:      { src: 'assets/backgrounds/near/bg_forest_decoration.png', w: 1024, h: 384 },
  bg_ruins_decoration:       { src: 'assets/backgrounds/near/bg_ruins_decoration.png', w: 768, h: 384 },
  bg_sky:                    { src: 'assets/backgrounds/sky/bg_sky.png', w: 1024, h: 1024 },
  bg_vines:                  { src: 'assets/backgrounds/near/bg_vines.png', w: 512, h: 512 },
  bg_waterfall:              { src: 'assets/backgrounds/mid/bg_waterfall.png', w: 256, h: 768 },
  fx_checkpoint:             { src: 'assets/sprites/effects/fx_checkpoint.png', w: 192, h: 192 },
  fx_drag_line:              { src: 'assets/sprites/effects/fx_drag_line.png', w: 256, h: 32 },
  fx_fall:                   { src: 'assets/sprites/effects/fx_fall.png', w: 128, h: 128 },
  fx_land_dust:              { src: 'assets/sprites/effects/fx_land_dust.png', w: 256, h: 96 },
  fx_land_star:              { src: 'assets/sprites/effects/fx_land_star.png', w: 64, h: 64 },
  fx_launch_streak:          { src: 'assets/sprites/effects/fx_launch_streak.png', w: 256, h: 96 },
  fx_splash:                 { src: 'assets/sprites/effects/fx_splash.png', w: 256, h: 96 },
  fx_trajectory_dot:         { src: 'assets/sprites/effects/fx_trajectory_dot.png', w: 32, h: 32 },
  enemy_bat_down:            { src: 'assets/sprites/enemies/enemy_bat_down.png', w: 176, h: 128 },
  enemy_bat_up:              { src: 'assets/sprites/enemies/enemy_bat_up.png', w: 176, h: 128 },
  enemy_boss_idle:           { src: 'assets/sprites/enemies/enemy_boss_idle.png', w: 288, h: 288 },
  enemy_boss_squash:         { src: 'assets/sprites/enemies/enemy_boss_squash.png', w: 288, h: 288 },
  enemy_goblin_attack:       { src: 'assets/sprites/enemies/enemy_goblin_attack.png', w: 192, h: 192 },
  enemy_goblin_idle:         { src: 'assets/sprites/enemies/enemy_goblin_idle.png', w: 192, h: 192 },
  enemy_goblin_walk:         { src: 'assets/sprites/enemies/enemy_goblin_walk.png', w: 192, h: 192 },
  enemy_redslime_idle:       { src: 'assets/sprites/enemies/enemy_redslime_idle.png', w: 160, h: 160 },
  enemy_redslime_squash:     { src: 'assets/sprites/enemies/enemy_redslime_squash.png', w: 160, h: 160 },
  platform_broken_ruin:      { src: 'assets/sprites/platforms/platform_broken_ruin.png', w: 320, h: 156 },
  platform_checkpoint:       { src: 'assets/sprites/platforms/platform_checkpoint.png', w: 288, h: 184 },
  platform_floating_rock:    { src: 'assets/sprites/platforms/platform_floating_rock.png', w: 256, h: 208 },
  platform_grass_medium:     { src: 'assets/sprites/platforms/platform_grass_medium.png', w: 320, h: 148 },
  platform_grass_small:      { src: 'assets/sprites/platforms/platform_grass_small.png', w: 192, h: 128 },
  platform_grass_wide:       { src: 'assets/sprites/platforms/platform_grass_wide.png', w: 480, h: 164 },
  platform_moving:           { src: 'assets/sprites/platforms/platform_moving.png', w: 256, h: 120 },
  platform_mushroom:         { src: 'assets/sprites/platforms/platform_mushroom.png', w: 224, h: 168 },
  platform_stone:            { src: 'assets/sprites/platforms/platform_stone.png', w: 320, h: 140 },
  platform_wood:             { src: 'assets/sprites/platforms/platform_wood.png', w: 288, h: 104 },
  prop_bush:                 { src: 'assets/sprites/props/prop_bush.png', w: 160, h: 96 },
  prop_checkpoint_flag:      { src: 'assets/sprites/props/prop_checkpoint_flag.png', w: 128, h: 192 },
  prop_chest:                { src: 'assets/sprites/props/prop_chest.png', w: 160, h: 128 },
  prop_crystal:              { src: 'assets/sprites/props/prop_crystal.png', w: 96, h: 128 },
  prop_flag:                 { src: 'assets/sprites/props/prop_flag.png', w: 128, h: 192 },
  prop_flower:               { src: 'assets/sprites/props/prop_flower.png', w: 64, h: 64 },
  prop_lantern:              { src: 'assets/sprites/props/prop_lantern.png', w: 96, h: 160 },
  prop_rock:                 { src: 'assets/sprites/props/prop_rock.png', w: 96, h: 64 },
  prop_vine:                 { src: 'assets/sprites/props/prop_vine.png', w: 96, h: 256 },
  prop_wood_sign:            { src: 'assets/sprites/props/prop_wood_sign.png', w: 160, h: 160 },
  slime_blink:               { src: 'assets/sprites/slime/slime_blink.png', w: 192, h: 192 },
  slime_damage:              { src: 'assets/sprites/slime/slime_damage.png', w: 192, h: 192 },
  slime_drag:                { src: 'assets/sprites/slime/slime_drag.png', w: 192, h: 192 },
  slime_fall:                { src: 'assets/sprites/slime/slime_fall.png', w: 192, h: 192 },
  slime_fly:                 { src: 'assets/sprites/slime/slime_fly.png', w: 192, h: 192 },
  slime_icon:                { src: 'assets/sprites/slime/slime_icon.png', w: 96, h: 96 },
  slime_idle:                { src: 'assets/sprites/slime/slime_idle.png', w: 192, h: 192 },
  slime_land:                { src: 'assets/sprites/slime/slime_land.png', w: 192, h: 192 },
  slime_launch:              { src: 'assets/sprites/slime/slime_launch.png', w: 192, h: 192 },
  logo_slime_adventure:      { src: 'assets/sprites/title/logo_slime_adventure.png', w: 768, h: 256 },
  title_decoration:          { src: 'assets/sprites/title/title_decoration.png', w: 512, h: 256 },
  title_slime_pose:          { src: 'assets/sprites/title/title_slime_pose.png', w: 384, h: 384 },
  ui_button_normal:          { src: 'assets/sprites/ui/ui_button_normal.png', w: 256, h: 96 },
  ui_button_pressed:         { src: 'assets/sprites/ui/ui_button_pressed.png', w: 256, h: 96 },
  ui_checkpoint:             { src: 'assets/sprites/ui/ui_checkpoint.png', w: 64, h: 64 },
  ui_coin:                   { src: 'assets/sprites/ui/ui_coin.png', w: 64, h: 64 },
  ui_crystal:                { src: 'assets/sprites/ui/ui_crystal.png', w: 64, h: 64 },
  ui_energy_bar:             { src: 'assets/sprites/ui/ui_energy_bar.png', w: 320, h: 48 },
  ui_energy_fill:            { src: 'assets/sprites/ui/ui_energy_fill.png', w: 300, h: 32 },
  ui_heart_empty:            { src: 'assets/sprites/ui/ui_heart_empty.png', w: 64, h: 64 },
  ui_heart_full:             { src: 'assets/sprites/ui/ui_heart_full.png', w: 64, h: 64 },
  ui_height_marker:          { src: 'assets/sprites/ui/ui_height_marker.png', w: 64, h: 64 },
  ui_panel:                  { src: 'assets/sprites/ui/ui_panel.png', w: 512, h: 256 },
  ui_pause:                  { src: 'assets/sprites/ui/ui_pause.png', w: 64, h: 64 },
  ui_settings:               { src: 'assets/sprites/ui/ui_settings.png', w: 64, h: 64 },
};

const IMG = {};

function loadAssets(onProgress) {
  const names = Object.keys(ASSET_FILES);
  let done = 0;
  return Promise.all(names.map(function (name) {
    return new Promise(function (resolve) {
      const im = new Image();
      im.onload = im.onerror = function () {
        IMG[name] = im;
        done++;
        if (onProgress) onProgress(done / names.length);
        resolve();
      };
      im.src = ASSET_FILES[name].src;
    });
  })).then(function () { return IMG; });
}
