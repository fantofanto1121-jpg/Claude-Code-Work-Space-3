/* ===========================================================
   stages.js  —  ステージ定義
   座標系: 画面の高さは 1024、横幅はステージごと（カメラが横に追従）
   =========================================================== */
'use strict';

const STAGES = [
  {
    no: '1-1',
    name: 'はじまりの森',
    seed: 20260417,
    width: 2960,
    deathY: 1160,
    spawn: { x: 300, y: 620 },
    platforms: [
      { x: -140, y: 700, w: 940, h: 460 },
      { x: 960, y: 556, w: 660, h: 604 },
      { x: 1740, y: 724, w: 470, h: 436 },
      { x: 2330, y: 516, w: 640, h: 644 },
      { x: 1560, y: 352, w: 190, h: 104 }
    ],
    enemies: [
      { type: 'goblin', x: 1150, y: 556, patrol: [1000, 1560] },
      { type: 'redslime', x: 1460, y: 556, patrol: [1010, 1590] },
      { type: 'goblin', x: 1880, y: 724, patrol: [1780, 2170] },
      { type: 'redslime', x: 2480, y: 516, patrol: [2370, 2920] },
      { type: 'goblin', x: 2760, y: 516, patrol: [2380, 2930] }
    ],
    decos: [
      { type: 'path', x: 40, y: 702, w: 430 },
      { type: 'banner', x: 110, y: 702, h: 250 },
      { type: 'lantern', x: 96, y: 646 },
      { type: 'fence', x: 250, y: 702, w: 300 },
      { type: 'bush', x: 620, y: 702, s: 52 },
      { type: 'bush', x: 1080, y: 558, s: 46 },
      { type: 'sign', x: 1020, y: 558, text: '1-1' },
      { type: 'crate', x: 2840, y: 518, s: 66 },
      { type: 'crate', x: 2778, y: 518, s: 56 },
      { type: 'bush', x: 2400, y: 518, s: 50 },
      { type: 'bush', x: 1800, y: 726, s: 44 }
    ],
    hint: 'スライムを引っ張って、はなす'
  },

  {
    no: '1-2',
    name: 'たきのかけ橋',
    seed: 71013,
    width: 3320,
    deathY: 1160,
    spawn: { x: 260, y: 560 },
    platforms: [
      { x: -140, y: 640, w: 720, h: 520 },
      { x: 720, y: 500, w: 330, h: 660 },
      { x: 1180, y: 700, w: 420, h: 460 },
      { x: 1500, y: 380, w: 220, h: 120 },
      { x: 1760, y: 586, w: 520, h: 574 },
      { x: 2400, y: 420, w: 300, h: 740 },
      { x: 2820, y: 660, w: 500, h: 500 }
    ],
    enemies: [
      { type: 'goblin', x: 860, y: 500, patrol: [740, 1030] },
      { type: 'bat', x: 1300, y: 520, path: { x0: 1150, x1: 1620, y: 470, amp: 78 } },
      { type: 'redslime', x: 1320, y: 700, patrol: [1200, 1580] },
      { type: 'goblin', x: 1960, y: 586, patrol: [1790, 2260] },
      { type: 'bat', x: 2260, y: 400, path: { x0: 2120, x1: 2560, y: 360, amp: 96 } },
      { type: 'redslime', x: 2520, y: 420, patrol: [2420, 2680] },
      { type: 'goblin', x: 3020, y: 660, patrol: [2850, 3290] }
    ],
    decos: [
      { type: 'path', x: 20, y: 642, w: 330 },
      { type: 'sign', x: 400, y: 642, text: '1-2' },
      { type: 'fence', x: 60, y: 642, w: 220 },
      { type: 'bush', x: 520, y: 642, s: 48 },
      { type: 'crate', x: 790, y: 502, s: 58 },
      { type: 'bush', x: 1240, y: 702, s: 44 },
      { type: 'banner', x: 1820, y: 588, h: 230 },
      { type: 'bush', x: 2460, y: 422, s: 50 },
      { type: 'crate', x: 3180, y: 662, s: 64 },
      { type: 'crate', x: 3120, y: 662, s: 52 },
      { type: 'lantern', x: 2860, y: 606 }
    ],
    hint: '空のこうもりは 空中でも当たる'
  },

  {
    no: '1-3',
    name: 'そらの城門',
    seed: 330055,
    width: 3480,
    deathY: 1160,
    spawn: { x: 280, y: 600 },
    platforms: [
      { x: -140, y: 680, w: 700, h: 480 },
      { x: 700, y: 560, w: 260, h: 600 },
      { x: 1080, y: 430, w: 240, h: 730 },
      { x: 1440, y: 620, w: 420, h: 540 },
      { x: 1960, y: 470, w: 260, h: 690 },
      { x: 2320, y: 330, w: 240, h: 830 },
      { x: 2660, y: 600, w: 820, h: 560 }
    ],
    enemies: [
      { type: 'goblin', x: 800, y: 560, patrol: [710, 940] },
      { type: 'bat', x: 1200, y: 360, path: { x0: 1020, x1: 1420, y: 330, amp: 86 } },
      { type: 'redslime', x: 1160, y: 430, patrol: [1090, 1300] },
      { type: 'goblin', x: 1600, y: 620, patrol: [1460, 1840] },
      { type: 'bat', x: 2100, y: 400, path: { x0: 1900, x1: 2380, y: 380, amp: 104 } },
      { type: 'redslime', x: 2400, y: 330, patrol: [2330, 2540] },
      { type: 'boss', x: 3060, y: 600, patrol: [2700, 3420] }
    ],
    decos: [
      { type: 'path', x: 20, y: 682, w: 300 },
      { type: 'fence', x: 70, y: 682, w: 240 },
      { type: 'sign', x: 420, y: 682, text: '1-3' },
      { type: 'bush', x: 540, y: 682, s: 46 },
      { type: 'crate', x: 760, y: 562, s: 54 },
      { type: 'bush', x: 1500, y: 622, s: 48 },
      { type: 'banner', x: 2720, y: 602, h: 268 },
      { type: 'banner', x: 3400, y: 602, h: 268 },
      { type: 'lantern', x: 2780, y: 540 },
      { type: 'crate', x: 3300, y: 602, s: 66 },
      { type: 'bush', x: 2960, y: 602, s: 52 }
    ],
    hint: 'ボスは かたい。スペシャルで ねらおう'
  }
];
