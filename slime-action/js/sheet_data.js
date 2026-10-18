/* sheet_data.js — tools/build_assets.py が自動生成。手で編集しない */
'use strict';

const PLATFORM_METRICS = {
  "island_wide": {
    "surface": 13,
    "left": 6,
    "right": 247
  },
  "island_fence": {
    "surface": 8,
    "left": 1,
    "right": 123
  },
  "island_medium": {
    "surface": 3,
    "left": 1,
    "right": 125
  },
  "island_small": {
    "surface": 4,
    "left": 1,
    "right": 95
  },
  "island_tiny": {
    "surface": 6,
    "left": 3,
    "right": 63
  },
  "island_rock": {
    "surface": 11,
    "left": 1,
    "right": 58
  },
  "island_mini": {
    "surface": 7,
    "left": 14,
    "right": 57
  }
};

const UI_ANCHORS = {
  "status_panel": {
    "hearts": [
      81,
      17,
      180,
      36
    ],
    "bar": [
      79,
      48,
      137,
      60
    ],
    "w": 230,
    "h": 80
  }
};

const SPRITE_ANCHORS = {"slime_drag": {"head": [25, 35], "w": 279, "h": 60, "facing": "left"}, "slime_stretch": {"head": [47, 48], "w": 221, "h": 78, "facing": "left"}, "slime_launch": {"head": [264, 29], "w": 295, "h": 88, "facing": "right"}, "slime_fly": {"head": [74, 22], "w": 102, "h": 54, "facing": "right"}, "slime_fly_long": {"head": [123, 19], "w": 149, "h": 74, "facing": "right"}, "slime_fall": {"head": [38, 24], "w": 70, "h": 51, "facing": "right"}, "fx_swoosh": {"head": [74, 19], "w": 84, "h": 57, "facing": "right"}, "fx_swoosh_s": {"head": [13, 39], "w": 41, "h": 67, "facing": "left"}, "fx_comet": {"head": [118, 12], "w": 133, "h": 64, "facing": "right"}};

const SKY_COLORS = ["#538ed1", "#71a5d9", "#85adce", "#6797bb"];

const BAR_STYLE = {"fill": "#118ddc", "track": "#121c2b", "rect": [79, 48, 222, 60]};
