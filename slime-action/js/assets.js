/* ===========================================================
   assets.js — 素材の一覧と読み込み
   assets/metadata/asset_manifest.json から自動生成（tools/build_assets.py）
   =========================================================== */
'use strict';

const ASSET_FILES = {
  castle_island:       { src: 'assets/sheet/bg/castle_island.png', w: 296, h: 338 },
  island_far_1:        { src: 'assets/sheet/bg/island_far_1.png', w: 45, h: 65 },
  island_far_2:        { src: 'assets/sheet/bg/island_far_2.png', w: 19, h: 26 },
  island_far_3:        { src: 'assets/sheet/bg/island_far_3.png', w: 19, h: 26 },
  island_far_4:        { src: 'assets/sheet/bg/island_far_4.png', w: 51, h: 43 },
  sky_strip:           { src: 'assets/sheet/bg/sky_strip.png', w: 349, h: 120 },
  waterfall_big:       { src: 'assets/sheet/bg/waterfall_big.png', w: 73, h: 129 },
  waterfall_mid:       { src: 'assets/sheet/bg/waterfall_mid.png', w: 63, h: 109 },
  waterfall_small:     { src: 'assets/sheet/bg/waterfall_small.png', w: 48, h: 104 },
  goblin_1:            { src: 'assets/sheet/enemies/goblin_1.png', w: 85, h: 70 },
  goblin_2:            { src: 'assets/sheet/enemies/goblin_2.png', w: 58, h: 70 },
  goblin_3:            { src: 'assets/sheet/enemies/goblin_3.png', w: 71, h: 70 },
  goblin_4:            { src: 'assets/sheet/enemies/goblin_4.png', w: 75, h: 73 },
  purple_1:            { src: 'assets/sheet/enemies/purple_1.png', w: 65, h: 67 },
  purple_2:            { src: 'assets/sheet/enemies/purple_2.png', w: 67, h: 65 },
  purple_3:            { src: 'assets/sheet/enemies/purple_3.png', w: 76, h: 73 },
  purple_4:            { src: 'assets/sheet/enemies/purple_4.png', w: 75, h: 73 },
  redslime_1:          { src: 'assets/sheet/enemies/redslime_1.png', w: 68, h: 63 },
  redslime_2:          { src: 'assets/sheet/enemies/redslime_2.png', w: 74, h: 66 },
  redslime_3:          { src: 'assets/sheet/enemies/redslime_3.png', w: 64, h: 67 },
  redslime_4:          { src: 'assets/sheet/enemies/redslime_4.png', w: 73, h: 69 },
  fx_arrow:            { src: 'assets/sheet/fx/fx_arrow.png', w: 46, h: 21 },
  fx_comet:            { src: 'assets/sheet/fx/fx_comet.png', w: 133, h: 64 },
  fx_dash:             { src: 'assets/sheet/fx/fx_dash.png', w: 17, h: 12 },
  fx_ripple:           { src: 'assets/sheet/fx/fx_ripple.png', w: 117, h: 31 },
  fx_ripple_s:         { src: 'assets/sheet/fx/fx_ripple_s.png', w: 49, h: 17 },
  fx_splash:           { src: 'assets/sheet/fx/fx_splash.png', w: 90, h: 70 },
  fx_star:             { src: 'assets/sheet/fx/fx_star.png', w: 42, h: 51 },
  fx_swoosh:           { src: 'assets/sheet/fx/fx_swoosh.png', w: 84, h: 57 },
  fx_swoosh_s:         { src: 'assets/sheet/fx/fx_swoosh_s.png', w: 41, h: 67 },
  fx_water:            { src: 'assets/sheet/fx/fx_water.png', w: 133, h: 80 },
  island_fence:        { src: 'assets/sheet/platforms/island_fence.png', w: 139, h: 148 },
  island_medium:       { src: 'assets/sheet/platforms/island_medium.png', w: 125, h: 100 },
  island_mini:         { src: 'assets/sheet/platforms/island_mini.png', w: 63, h: 77 },
  island_rock:         { src: 'assets/sheet/platforms/island_rock.png', w: 59, h: 72 },
  island_small:        { src: 'assets/sheet/platforms/island_small.png', w: 96, h: 75 },
  island_tiny:         { src: 'assets/sheet/platforms/island_tiny.png', w: 65, h: 85 },
  island_wide:         { src: 'assets/sheet/platforms/island_wide.png', w: 251, h: 150 },
  banner:              { src: 'assets/sheet/props/banner.png', w: 51, h: 82 },
  barrel:              { src: 'assets/sheet/props/barrel.png', w: 40, h: 53 },
  bush_big:            { src: 'assets/sheet/props/bush_big.png', w: 152, h: 58 },
  bush_small:          { src: 'assets/sheet/props/bush_small.png', w: 71, h: 31 },
  chest:               { src: 'assets/sheet/props/chest.png', w: 53, h: 43 },
  fence:               { src: 'assets/sheet/props/fence.png', w: 74, h: 83 },
  flagpole:            { src: 'assets/sheet/props/flagpole.png', w: 32, h: 188 },
  lantern:             { src: 'assets/sheet/props/lantern.png', w: 66, h: 135 },
  log:                 { src: 'assets/sheet/props/log.png', w: 97, h: 53 },
  plant:               { src: 'assets/sheet/props/plant.png', w: 68, h: 58 },
  rock_grass:          { src: 'assets/sheet/props/rock_grass.png', w: 72, h: 49 },
  rock_small:          { src: 'assets/sheet/props/rock_small.png', w: 56, h: 21 },
  rocks:               { src: 'assets/sheet/props/rocks.png', w: 101, h: 47 },
  sign:                { src: 'assets/sheet/props/sign.png', w: 61, h: 48 },
  slime_blink:         { src: 'assets/sheet/slime/slime_blink.png', w: 60, h: 56 },
  slime_drag:          { src: 'assets/sheet/slime/slime_drag.png', w: 279, h: 60 },
  slime_fall:          { src: 'assets/sheet/slime/slime_fall.png', w: 70, h: 51 },
  slime_fly:           { src: 'assets/sheet/slime/slime_fly.png', w: 102, h: 54 },
  slime_fly_long:      { src: 'assets/sheet/slime/slime_fly_long.png', w: 149, h: 74 },
  slime_happy:         { src: 'assets/sheet/slime/slime_happy.png', w: 59, h: 56 },
  slime_idle:          { src: 'assets/sheet/slime/slime_idle.png', w: 68, h: 65 },
  slime_laugh:         { src: 'assets/sheet/slime/slime_laugh.png', w: 64, h: 55 },
  slime_launch:        { src: 'assets/sheet/slime/slime_launch.png', w: 295, h: 88 },
  slime_smile:         { src: 'assets/sheet/slime/slime_smile.png', w: 64, h: 57 },
  slime_stretch:       { src: 'assets/sheet/slime/slime_stretch.png', w: 221, h: 78 },
  ui_btn_potion:       { src: 'assets/sheet/ui/ui_btn_potion.png', w: 65, h: 65 },
  ui_btn_slime:        { src: 'assets/sheet/ui/ui_btn_slime.png', w: 90, h: 93 },
  ui_btn_special:      { src: 'assets/sheet/ui/ui_btn_special.png', w: 72, h: 86 },
  ui_chest:            { src: 'assets/sheet/ui/ui_chest.png', w: 42, h: 33 },
  ui_coin:             { src: 'assets/sheet/ui/ui_coin.png', w: 27, h: 31 },
  ui_compass:          { src: 'assets/sheet/ui/ui_compass.png', w: 86, h: 90 },
  ui_diamond:          { src: 'assets/sheet/ui/ui_diamond.png', w: 18, h: 18 },
  ui_exclaim:          { src: 'assets/sheet/ui/ui_exclaim.png', w: 28, h: 29 },
  ui_gem:              { src: 'assets/sheet/ui/ui_gem.png', w: 23, h: 31 },
  ui_heart:            { src: 'assets/sheet/ui/ui_heart.png', w: 24, h: 23 },
  ui_height_panel:     { src: 'assets/sheet/ui/ui_height_panel.png', w: 92, h: 53 },
  ui_key:              { src: 'assets/sheet/ui/ui_key.png', w: 35, h: 38 },
  ui_pin:              { src: 'assets/sheet/ui/ui_pin.png', w: 18, h: 36 },
  ui_potion:           { src: 'assets/sheet/ui/ui_potion.png', w: 28, h: 39 },
  ui_quest_banner:     { src: 'assets/sheet/ui/ui_quest_banner.png', w: 203, h: 66 },
  ui_slime_row:        { src: 'assets/sheet/ui/ui_slime_row.png', w: 206, h: 53 },
  ui_status_panel:     { src: 'assets/sheet/ui/ui_status_panel.png', w: 230, h: 80 },
  ui_tutorial:         { src: 'assets/sheet/ui/ui_tutorial.png', w: 241, h: 97 },
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
