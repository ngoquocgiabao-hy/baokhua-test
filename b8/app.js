import * as THREE from 'three';
/* B8: addons/GLTF lazy-loaded after first playable frame */
let Water, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, FXAAShader, GLTFLoader, MeshoptDecoder;
async function loadAddons() {
  const [
    waterMod, ecMod, rpMod, bloomMod, outMod, spMod, fxaaMod, gltfMod, meshoptMod
  ] = await Promise.all([
    import('three/addons/objects/Water.js'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/shaders/FXAAShader.js'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  Water = waterMod.Water;
  EffectComposer = ecMod.EffectComposer;
  RenderPass = rpMod.RenderPass;
  UnrealBloomPass = bloomMod.UnrealBloomPass;
  OutputPass = outMod.OutputPass;
  ShaderPass = spMod.ShaderPass;
  FXAAShader = fxaaMod.FXAAShader;
  GLTFLoader = gltfMod.GLTFLoader;
  MeshoptDecoder = meshoptMod.MeshoptDecoder;
  window.__PROTO3D.addonsReady = true;
}

/* Palette moodboard */
const C = {
  waterNear: 0x2AB8B0, waterDeep: 0x0E6A78,
  rockA: 0x9AA4A0, rockB: 0x7A8580, grass: 0x3D9A48,
  sun: 0xFFC878, fog: 0xD0E4F0, brand: 0xFFD91F, ink: 0x16171B,
  sky: 0x6BA8D4, ground: 0x6B7A68,
  hero: 0x4A6FA5, skin: 0xffdbac, hat: 0xFFD91F,
  foam: 0xF5FFFF, wood: 0xE8B06A, islet: 0xB0B8A8
};

const CFG = {
  pixelRatioMax: 1.5, /* hard cap */
  fogNear: 40, fogFar: 160,
  camDistMin: 7.0, camDistMax: 10.5, camDist: 8.4,
  camPolarMin: THREE.MathUtils.degToRad(68),
  camPolarMax: THREE.MathUtils.degToRad(86),
  camHeight: 3.9,
  camShoulder: 1.2,
  camLookY: 2.2,
  fov: 56,
  moveSpeed: 5.4, joyRadius: 60, joyDead: 0.10,
  lowFpsMs: 800, lowFpsThresh: 26, /* target MID p5>=24 */
  bloomStrength: 0.38, bloomRadius: 0.5, bloomThresh: 0.82,
  heroTargetH: 1.7
};

/* B2 assets — Quaternius CC0 via jsDelivr (trebeljahr/quaternius-showcase mirror) */
const ASSET = {
  /* Offline vendor /workspace/game/b7 — Quaternius CC0 + three.js MIT */
  hero: 'b8/glb/hero_knight.glb',
  heroAlt: 'b8/glb/hero_knight.glb',
  sword: 'b8/glb/knight_katana.glb',
  boss: 'b8/glb/boss_enemy_large.glb',
  boat: 'b8/glb/boat.glb',
  heroLocal: 'b8/glb/hero_knight.glb',
  swordLocal: 'b8/glb/knight_katana.glb',
  bossLocal: 'b8/glb/boss_enemy_large.glb',
  boatLocal: 'b8/glb/boat.glb',
  waterNormals: 'b8/textures/waternormals.jpg',
  audio: {
    bgm: 'b8/audio/bgm_loop.ogg',
    hit: 'b8/audio/hit.ogg',
    slash: 'b8/audio/crit.ogg',
    hurt: 'b8/audio/hurt.ogg',
    ui: 'b8/audio/ui.ogg',
    win: 'b8/audio/win.ogg'
  },
  license: 'CC0-1.0 Quaternius · three.js MIT · offline b8/'
};

/* B3 combat balance (v7 §6, màn1 boss 450 GIẢ ĐỊNH) */
const BAL = {
  bossMax: 420, tutorialBoss: 180, heroMax: 100,
  manaMax: 100, manaSkillWrong: 12, manaSkillCorrect: 100,
  dmgCorrect: 40, dmgWrong: 12, fastBonus: 10, fastSec: 3,
  qSec: 12, bossAtkEvery: 5.5, bossAtkDmg: 14, telegraph: 1.15,
  bossRange: 2.8, bossSpeed: 1.55, bossHitRadius: 2.6,
  combo3: 1.4, combo5: 1.8,
  basic: { dmg: 14, cd: 0.48, range: 3.1 },
  skills: [
    { id: 's1', name: 'Kiếm khí', cost: 25, cd: 4.0, dmg: 32, range: 4.2 },
    { id: 's2', name: 'Lốc kiếm', cost: 35, cd: 7.0, dmg: 48, range: 4.8 },
    { id: 's3', name: 'Trảm', cost: 45, cd: 10.0, dmg: 62, range: 3.6 }
  ],
  ult: { dmg: 150, name: 'Tuyệt kỹ' }
};
const SAVE_KEY = 'halong_proto_b8';
const SAVE_SCHEMA = 1;


const NAV_START = (typeof window !== "undefined" && window.__B8_NAV) ? window.__B8_NAV : performance.now();
const _qs = new URLSearchParams(location.search);
const REC_MODE = _qs.get('rec') === '1';
const FPS_DBG = _qs.get('fps') === '1';
if (REC_MODE) document.body.classList.add('rec');
if (FPS_DBG) document.body.classList.add('fpsdbg');
const canvas = document.getElementById('c');
const fpsEl = document.getElementById('fps');
const fpsDbgEl = FPS_DBG ? document.getElementById('fpsDbg') : null;
/* Timed samples only when ?fps=1 (avg 5s / p5 10s) — zero alloc otherwise */
const fpsTimed = FPS_DBG ? [] : null;
const errEl = document.getElementById('err');
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');
const qualBtn = document.getElementById('qual');

let renderer, scene, camera, clock, composer, bloomPass, fxaaPass, water, sunLight, rimLight;
let shakeAmp = 0, shakeT = 0;
let hero, bossMesh, boatMesh, layers = { near: null, mid: null, far: null };
let mixerHero = null, mixerBoss = null, heroClips = {}, bossClips = {};
let glbReady = false, usingProceduralHero = true;
const combat = {
  boss: BAL.bossMax, bossMax: BAL.bossMax,
  hero: BAL.heroMax, heroMax: BAL.heroMax,
  mana: BAL.manaMax, manaMax: BAL.manaMax,
  streak: 0, locked: false, qStart: 0,
  bossTimer: 0, telegraphOn: false, ended: false,
  classId: 'kiem_khach',
  paused: false, timeScale: 1,
  qMode: null, /* 'mana' | 'ult' | 'riddle' | 'talk' */
  ultArmed: false,
  stage: 'combat' /* combat | road */
};
const cds = { atk: 0, s1: 0, s2: 0, s3: 0, ult: 0 };
let bossAI = { state: 'idle', t: 0, telegraphMesh: null, home: null };
let cinematic = { on: false, t: 0, dur: 0, camFrom: null, camTo: null };
let gameTimeScale = 1;
const clockAnims = { last: 0 };

let toonGrad;
const quality = {
  level: 1, // default MID (mobile)
  locked: false, /* when true, auto-drop disabled (QA / setQuality lock) */
  pixelRatio: Math.min(devicePixelRatio || 1, 1.25),
  bloom: false, waterReflect: true, fog: true, fxaa: false, shadows: false, outlines: false
};
const orbit = { theta: 0.0, phi: THREE.MathUtils.degToRad(80), dist: 8.2 };
const look = { active: false, id: null, lx: 0, ly: 0 };
const joy = { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 };
const keys = Object.create(null);
const move = new THREE.Vector3();
const fpsHist = [];
let lowFpsAcc = 0;
let inputLockUntil = 0;
let questions = [];
let qIndex = 0;

window.__PROTO3D = {
  fps: 0, avgFps: 0, p5: 0, ready: false, quality, questions, combat, glbReady: false, ASSET, cds,
  injectMove(x, y) { window.__PROTO3D.combatArmed = true; joy.x = x; joy.y = y; },
  setQuality(l, lock) { if (lock) quality.locked = true; applyQuality(l); },
  lockQuality(on) { quality.locked = !!on; },
  forceAudioQuestion() {
    questions = CAU_HOI_V7.filter(q => q.type === 'audio').map(normalizeV7);
    qIndex = 0;
    openQuestion('talk');
  },
  /** QA/test: inject zh voice object or null; forces refresh on next speakZh */
  setZhVoiceOverride(v) { zhVoice = v || null; zhVoiceReady = true; },
  injectOrbit(dt, dp) {
    orbit.theta += dt;
    orbit.phi = THREE.MathUtils.clamp(orbit.phi + dp, CFG.camPolarMin, CFG.camPolarMax);
  },
  setOrbit(t, p, d) {
    if (t != null) orbit.theta = t;
    if (p != null) orbit.phi = p;
    if (d != null) orbit.dist = d;
  },
  openQuestion: (mode='talk') => openQuestion(mode),
  playHeroAnim: (st) => playHeroAnim(st),
  castBasic: () => castBasic(),
  castSkill: (i) => castSkill(i),
  castUlt: () => requestUltimate(),
  setMana: (n) => { combat.mana = Math.max(0, Math.min(combat.manaMax, n)); syncHpHud(); },
  forceUltCinematic: () => playUltimateCinematic(),
  saveGame: () => saveGame(),
  loadGame: () => loadGame(),
  REC_MODE, navStart: NAV_START, playableAt: 0,
  getState: () => ({
    orbit: { ...orbit },
    hero: hero ? hero.position.toArray() : null,
    heroRotY: hero ? hero.rotation.y : null,
    cam: camera ? camera.position.toArray() : null,
    boss: bossMesh ? bossMesh.position.toArray() : null,
    mana: combat.mana, cds: { ...cds },
    look: camera && hero ? [hero.position.x + Math.sin(hero.rotation.y)*8, hero.position.y+CFG.camLookY, hero.position.z + Math.cos(hero.rotation.y)*8] : null
  })
};

function showErr(m) { if (errEl) { errEl.style.display = 'block'; errEl.textContent = m; } console.error(m); }

function makeToonGradient() {
  const c = document.createElement('canvas'); c.width = 3; c.height = 1;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(3, 1);
  const px = [0,0,0,255, 140,140,140,255, 255,255,255,255];
  img.data.set(px); ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color, gradientMap: toonGrad,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
    ...opts
  });
}

/** Inverted-hull outline (anime) */
function addOutline(mesh, scale = 1.04, color = C.ink) {
  if (quality.level < 2) return null; /* no outlines MID/LOW */
  const o = mesh.clone();
  o.material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  o.scale.multiplyScalar(scale);
  o.renderOrder = -1;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

function makeSky() {
  const g = new THREE.SphereGeometry(340, 28, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3A78B8) },
      mid: { value: new THREE.Color(0xFF9A5C) },
      hor: { value: new THREE.Color(0xFFE8C8) },
      bot: { value: new THREE.Color(0xA8D0E0) },
      time: { value: 0 }
    },
    vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform vec3 top,mid,hor,bot; uniform float time; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
        vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+ (c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
      void main(){
        float h = vP.y;
        vec3 c = mix(bot, hor, smoothstep(-0.12, 0.06, h));
        c = mix(c, mid, smoothstep(0.04, 0.32, h));
        c = mix(c, top, smoothstep(0.28, 0.92, h));
        /* soft sun glow ahead (-Z) */
        vec3 sunDir = normalize(vec3(0.38, 0.28, -0.88));
        float sun = pow(max(0., dot(normalize(vP), sunDir)), 28.0);
        float halo = pow(max(0., dot(normalize(vP), sunDir)), 4.0);
        c += vec3(1.0, 0.82, 0.45) * sun * 1.8;
        c += vec3(1.0, 0.55, 0.25) * halo * 0.35;
        /* soft cloud bands */
        float cl = noise(vP.xz * 2.8 + time * 0.015) * noise(vP.xz * 5.0 - time * 0.01);
        cl = smoothstep(0.42, 0.72, cl) * smoothstep(0.05, 0.45, h) * smoothstep(0.85, 0.35, h);
        c = mix(c, vec3(1.0, 0.96, 0.92), cl * 0.55);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.skyMat = m;
  return mesh;
}

function makeSeaBed() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x0E5A62 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.35;
  return m;
}
function makeFlatWater() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420, 1, 1),
    new THREE.MeshLambertMaterial({ color: C.waterNear })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0;
  m.userData.flat = true;
  return m;
}
function makeWater() {
  if (!Water) return makeFlatWater();
  const geo = new THREE.PlaneGeometry(420, 420, 1, 1);
  const w = new Water(geo, {
    textureWidth: quality.level >= 2 ? 256 : (quality.level >= 1 ? 128 : 64),
    textureHeight: quality.level >= 2 ? 256 : (quality.level >= 1 ? 128 : 64),
    waterNormals: new THREE.TextureLoader().load(
      ASSET.waterNormals,
      t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    ),
    sunDirection: new THREE.Vector3(0.45, 0.35, -0.8).normalize(),
    sunColor: C.sun,
    waterColor: C.waterDeep,
    distortionScale: quality.level >= 1 ? 2.2 : 0.9,
    fog: true,
    alpha: 0.95
  });
  w.rotation.x = -Math.PI / 2;
  w.position.y = 0;
  if (w.material && w.material.uniforms) {
    if (w.material.uniforms.waterColor) w.material.uniforms.waterColor.value.set(C.waterNear);
    if (w.material.uniforms.size) w.material.uniforms.size.value = 2.8;
    if (w.material.uniforms.distortionScale) w.material.uniforms.distortionScale.value = quality.level >= 1 ? 1.6 : 0.7;
  }
  return w;
}
async function upgradeWater() {
  if (!Water || !scene) return;
  const fancy = makeWater();
  if (water && water.parent) scene.remove(water);
  water = fancy;
  scene.add(water);
  if (flatWater) { flatWater.visible = false; }
  setWaterMode(quality.waterReflect);
}

/** Displace vertices for limestone / islet look */
function displaceGeo(geo, amp = 0.35, seed = 1.7) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 1.7 + seed) * Math.cos(v.z * 1.3 + seed * 0.7)
            + Math.sin(v.y * 2.1 + seed * 1.3) * 0.55
            + Math.sin((v.x + v.z) * 0.9 + seed) * 0.4;
    const radial = Math.sqrt(v.x * v.x + v.z * v.z) || 0.001;
    const push = 1 + (n * amp) / Math.max(1, radial * 0.15 + v.y * 0.08 + 1);
    v.x *= push; v.z *= push;
    v.y += n * amp * 0.35;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Tall Hạ Long limestone tower: steep grey body + green crown + vertex noise */
function karstMesh(h, r, color, grassTop, withOutline = true, detail = 1) {
  const g = new THREE.Group();
  const segs = withOutline ? (5 + Math.min(detail, 1)) : (4 + Math.min(detail, 1));
  const bodyGeo = new THREE.CylinderGeometry(r * 0.38, r * 1.08, h, segs, 4);
  displaceGeo(bodyGeo, 0.55 * Math.max(0.6, r * 0.45), h * 0.13 + r);
  const body = new THREE.Mesh(bodyGeo, toonMat(color));
  body.position.y = h * 0.5;
  body.rotation.y = Math.random() * 1.2;
  body.castShadow = true; body.receiveShadow = true;
  if (withOutline) addOutline(body, 1.025);
  g.add(body);
  /* mid ledge */
  const midGeo = new THREE.CylinderGeometry(r * 0.48, r * 0.62, h * 0.16, segs, 2);
  displaceGeo(midGeo, 0.22, h + 3);
  const mid = new THREE.Mesh(midGeo, toonMat(color));
  mid.position.y = h * 0.55;
  mid.castShadow = true;
  g.add(mid);
  const tipGeo = new THREE.ConeGeometry(r * 0.45, h * 0.32, segs);
  displaceGeo(tipGeo, 0.18, h + 7);
  const tip = new THREE.Mesh(tipGeo, toonMat(grassTop ? C.grass : color));
  tip.position.y = h + h * 0.1;
  tip.castShadow = true;
  if (withOutline) addOutline(tip, 1.03);
  g.add(tip);
  if (grassTop) {
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.5, 6, 4),
      toonMat(0x3A9A44)
    );
    canopy.position.set(0, h + h * 0.2, 0);
    canopy.scale.set(1.35, 0.55, 1.35);
    canopy.castShadow = quality.level >= 2;
    g.add(canopy);
  }
  return g;
}

function makeRockyIslet() {
  const g = new THREE.Group();
  const rockGeo = new THREE.CylinderGeometry(2.8, 3.5, 0.9, 10, 3);
  displaceGeo(rockGeo, 0.35, 2.2);
  const rock = new THREE.Mesh(rockGeo, toonMat(C.islet));
  rock.position.y = 0.38;
  rock.castShadow = true; rock.receiveShadow = true;
  g.add(rock);
  const topGeo = new THREE.CylinderGeometry(2.4, 2.7, 0.28, 10, 1);
  displaceGeo(topGeo, 0.12, 4);
  const top = new THREE.Mesh(topGeo, toonMat(0x8A9480));
  top.position.y = 0.85;
  top.receiveShadow = true;
  g.add(top);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.14, 2.4),
    new THREE.MeshToonMaterial({ color: C.wood, gradientMap: toonGrad, emissive: 0x5a3010, emissiveIntensity: 0.28 })
  );
  deck.position.set(0.15, 1.0, 0.1);
  deck.castShadow = true; deck.receiveShadow = true;
  g.add(deck);
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.04, 0.35),
      new THREE.MeshToonMaterial({ color: i % 2 ? 0xD49850 : 0xC07838, gradientMap: toonGrad, emissive: 0x4a2810, emissiveIntensity: 0.25 })
    );
    plank.position.set(0.15, 1.08, -0.85 + i * 0.55);
    plank.receiveShadow = true;
    g.add(plank);
  }
  /* soft foam ring */
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(3.1, 4.4, 36),
    new THREE.MeshBasicMaterial({ color: C.foam, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.05;
  g.add(foam);
  /* secondary soft foam */
  const foam2 = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 5.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xD8F8F8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  foam2.rotation.x = -Math.PI / 2;
  foam2.position.y = 0.04;
  g.add(foam2);
  g.userData.deckY = 1.08;
  return g;
}

/** Open Hạ Long bay — sparse towers framing corridor, layered fog depth */
function makeKarstLayers() {
  const near = new THREE.Group();
  const mid = new THREE.Group();
  const far = new THREE.Group();

  /* OPEN BAY: leave wide center corridor toward -Z; towers as islet flanks */
  const nearSpec = [
    { p: [-11, -7], h: 10, r: 2.3 },
    { p: [12, -6.5], h: 9.5, r: 2.1 },
    { p: [-14, -16], h: 13, r: 2.7 },
    { p: [15, -15], h: 12, r: 2.5 },
    { p: [-9, 7], h: 7.5, r: 1.7 },
    { p: [10, 8], h: 7, r: 1.6 }
  ];
  nearSpec.forEach((sp, i) => {
    const m = karstMesh(sp.h, sp.r, i % 2 ? C.rockA : C.rockB, true, true, 1);
    m.position.set(sp.p[0], 0, sp.p[1]);
    m.rotation.y = i * 0.5;
    near.add(m);
  });

  const midSpec = [
    { p: [-20, -24], h: 22, r: 3.8 },
    { p: [22, -22], h: 20, r: 3.5 },
    { p: [-26, -36], h: 26, r: 4.2 },
    { p: [28, -38], h: 28, r: 4.5 },
    { p: [-32, -14], h: 16, r: 3.0 },
    { p: [34, -16], h: 17, r: 3.2 },
    { p: [-14, -48], h: 30, r: 4.6 },
    { p: [16, -50], h: 32, r: 4.8 }
  ];
  midSpec.forEach((sp, i) => {
    const m = karstMesh(sp.h, sp.r, C.rockB, i % 2 === 0, false, 0);
    m.position.set(sp.p[0], -0.3, sp.p[1]);
    mid.add(m);
  });

  for (let i = 0; i < 5; i++) {
    const t = (i / 15) * 2 - 1;
    const rad = 55 + (i % 5) * 12;
    const x = t * (36 + (i % 3) * 10);
    const z = -rad - Math.abs(t) * 8;
    const m = karstMesh(30 + (i % 5) * 7, 5.5 + (i % 3), 0x4a5560, i % 3 === 0, false, 0);
    m.position.set(x, -2.0, z);
    m.scale.set(1.6, 1.3 + (i % 3) * 0.25, 1.6);
    far.add(m);
  }

  /* scattered small limestone islets in open water (bay feel) */
  const isletSpots = [[-4.5, -22], [5.2, -26], [0, -34]];
  isletSpots.forEach((p, i) => {
    const m = karstMesh(5 + i, 1.4 + i * 0.15, C.rockA, true, false, 0);
    m.position.set(p[0], -0.1, p[1]);
    m.scale.set(0.85, 0.7, 0.85);
    mid.add(m);
  });

  const islet = makeRockyIslet();
  islet.name = 'heroIslet';
  near.add(islet);

  /* foam around a few mid islets */
  isletSpots.slice(0, 3).forEach(p => {
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.6, 20),
      new THREE.MeshBasicMaterial({ color: C.foam, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(p[0], 0.05, p[1]);
    mid.add(foam);
  });

  return { near, mid, far, islet };
}

function toonifyObject(root, tint = null) {
  root.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map(m => {
      if (!m) return toonMat(0xffffff);
      const col = (m.color ? m.color.clone() : new THREE.Color(0xffffff));
      /* never wipe textures with flat hero tint — only subtle lerp if untextured */
      if (tint && !m.map && !m.vertexColors) col.lerp(tint, 0.12);
      const tm = new THREE.MeshToonMaterial({
        color: col,
        map: m.map || null,
        gradientMap: toonGrad,
        side: m.side != null ? m.side : THREE.FrontSide,
        transparent: !!m.transparent,
        opacity: m.opacity != null ? m.opacity : 1,
        alphaTest: m.alphaTest || 0,
        vertexColors: !!m.vertexColors
      });
      if (m.emissive) tm.emissive = m.emissive.clone();
      return tm;
    });
    obj.material = next.length === 1 ? next[0] : next;
    obj.castShadow = !!quality.shadows; obj.receiveShadow = !!quality.shadows;
    obj.frustumCulled = false;
    if (obj.isSkinnedMesh) {
      const mm = Array.isArray(obj.material) ? obj.material : [obj.material];
      mm.forEach(m => { if (m) { m.skinning = true; m.needsUpdate = true; } });
    }
  });
}

let heroActions = {}, heroAction = null, heroAnimState = '';
function findClip(clips, keys) {
  const names = Object.keys(clips);
  for (const k of keys) {
    const hit = names.find(n => n === k || n.endsWith('|' + k) || n.toLowerCase().includes(k.toLowerCase()));
    if (hit) return clips[hit];
  }
  return null;
}
function playHeroAnim(state, fade = 0.18) {
  if (!mixerHero || !heroActions) return;
  if (heroAnimState === state && heroAction && heroAction.isRunning()) return;
  const map = {
    idle: ['Idle_swordRight', 'Idle_swordLeft', 'Idle', 'Idle_Neutral'],
    run: ['Run_swordRight', 'Run', 'Walking', 'Walk'],
    attack: ['Run_swordAttack', 'swordAttackJump', 'Punch', 'Punch_Right']
  };
  let clip = null;
  for (const key of (map[state] || [state])) {
    clip = findClip(heroClips, [key]);
    if (clip) break;
  }
  if (!clip) {
    const first = Object.values(heroClips)[0];
    if (!first) return;
    clip = first;
  }
  const next = mixerHero.clipAction(clip);
  next.reset();
  if (state === 'attack') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  else { next.setLoop(THREE.LoopRepeat, Infinity); }
  next.enabled = true;
  if (heroAction && heroAction !== next) heroAction.fadeOut(fade);
  next.reset().fadeIn(fade).play();
  heroAction = next;
  heroAnimState = state;
  heroActions[state] = next;
}

const AUDIO = { unlocked: false, bgm: null, muted: false };
function loadAudio() {
  try {
    AUDIO.bgm = new Audio(ASSET.audio.bgm); AUDIO.bgm.loop = true; AUDIO.bgm.volume = 0.28;
    AUDIO.hit = new Audio(ASSET.audio.hit); AUDIO.hit.volume = 0.55;
    AUDIO.slash = new Audio(ASSET.audio.slash); AUDIO.slash.volume = 0.5;
    AUDIO.hurt = new Audio(ASSET.audio.hurt); AUDIO.hurt.volume = 0.5;
    AUDIO.ui = new Audio(ASSET.audio.ui); AUDIO.ui.volume = 0.4;
    AUDIO.win = new Audio(ASSET.audio.win); AUDIO.win.volume = 0.55;
  } catch (_) {}
}
function sfx(name) {
  if (AUDIO.muted) return;
  const a = AUDIO[name];
  if (!a) return;
  try { const c = a.cloneNode(); c.volume = a.volume; c.play().catch(() => {}); } catch (_) {}
}
function unlockAudio() {
  if (AUDIO.unlocked) return;
  AUDIO.unlocked = true;
  if (AUDIO.bgm) AUDIO.bgm.play().catch(() => {});
}
loadAudio();
['pointerdown','keydown','touchstart'].forEach(ev => addEventListener(ev, unlockAudio, { once: true, passive: true }));

let colliders = [];
const _camFrom = new THREE.Vector3();
const _camTo = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camRay = new THREE.Raycaster();
function rebuildColliders() {
  colliders = [];
  if (!layers) return;
  [layers.near, layers.mid].forEach(g => {
    if (!g) return;
    g.traverse(o => { if (o.isMesh) colliders.push(o); });
  });
}
function setLoadProgress(pct, _label) {
  const bar = document.getElementById('loadBar');
  if (bar) bar.style.width = Math.max(4, Math.min(100, pct)) + '%';
}
function hideLoader() {
  document.body.classList.add('ready');
  const banner = document.getElementById('loadBanner');
  if (!banner) return;
  banner.classList.add('hide');
  setTimeout(() => { banner.style.display = 'none'; }, 650);
}

function loadGLB(url, local) {
  return new Promise(async (resolve, reject) => {
    if (!GLTFLoader) { reject(new Error('GLTFLoader not ready')); return; }
    const loader = new GLTFLoader();
    try {
      if (MeshoptDecoder && MeshoptDecoder.ready) await MeshoptDecoder.ready;
      if (MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
    } catch (_) {}
    const tryUrl = (u, next) => {
      loader.load(u, gltf => resolve(gltf), undefined, () => {
        if (next) tryUrl(next, null); else reject(new Error('GLB fail ' + u));
      });
    };
    if (local && local !== url) tryUrl(local, url); else tryUrl(url, null);
  });
}
async function verifyCdnAssets() {
  window.__PROTO3D.cdnOk = { offline: true };
  window.__PROTO3D.cdnAllOk = true;
  return window.__PROTO3D.cdnOk;
}
window.__PROTO3D.verifyCdnAssets = verifyCdnAssets;

async function loadCharacters() {
  const banner = document.getElementById('loadBanner');
  try {
    const [heroGltf, bossGltf, boatGltf] = await Promise.all([
      loadGLB(ASSET.hero, ASSET.heroLocal),
      loadGLB(ASSET.boss, ASSET.bossLocal),
      loadGLB(ASSET.boat, ASSET.boatLocal)
    ]);
    // Replace procedural hero
    setLoadProgress(40);
    if (hero && hero.parent) scene.remove(hero);
    hero = heroGltf.scene;
    /* normalize height to ~1.7m */
    hero.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(hero);
    let size = new THREE.Vector3(); box.getSize(size);
    const h0 = Math.max(0.01, size.y);
    const sHero = CFG.heroTargetH / h0;
    hero.scale.setScalar(sHero);
    const deckY = (layers && layers.islet && layers.islet.userData.deckY) || 1.06;
    hero.position.set(0, 0, 0.35);
    hero.rotation.y = Math.PI; // face -Z toward boss
    hero.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(hero);
    hero.position.y = deckY - box.min.y;
    toonifyObject(hero, null);
    scene.add(hero);
    usingProceduralHero = false;
    heroClips = {};
    if (heroGltf.animations && heroGltf.animations.length) {
      mixerHero = new THREE.AnimationMixer(hero);
      heroGltf.animations.forEach(a => { heroClips[a.name] = a; });
      playHeroAnim('idle', 0);
      mixerHero.update(0.016);
      mixerHero.addEventListener('finished', () => {
        if (heroAnimState === 'attack') playHeroAnim('idle', 0.12);
      });
    }
    hero.userData.bob = 0;
    hero.userData.deckY = deckY;
    setLoadProgress(65);
    window.__PROTO3D.heroClips = Object.keys(heroClips);
    window.__PROTO3D.heroHeight = CFG.heroTargetH;
    playHeroAnim('idle');


    /* Attach Katana to Palm.R — world-normalized length ~0.95m */
    try {
      const swordGltf = await loadGLB(ASSET.sword, ASSET.swordLocal);
      const sword = swordGltf.scene;
      toonifyObject(sword, null);
      let palm = null;
      const boneNames = [];
      hero.traverse(o => {
        if (o.isBone || o.type === 'Bone') boneNames.push(o.name);
        if (!palm && (o.name === 'PalmR' || o.name === 'Palm.R' || o.name === 'palm.R')) palm = o;
        if (o.isSkinnedMesh && o.skeleton) {
          o.skeleton.bones.forEach(b => {
            boneNames.push('sk:' + b.name);
            if (!palm && (b.name === 'PalmR' || b.name === 'Palm.R')) palm = b;
          });
        }
      });
      window.__PROTO3D.heroBones = boneNames;
      sword.updateMatrixWorld(true);
      const sb0 = new THREE.Box3().setFromObject(sword);
      const ss0 = new THREE.Vector3(); sb0.getSize(ss0);
      const cur0 = Math.max(ss0.x, ss0.y, ss0.z, 0.001);
      const targetLen = 1.15;
      if (palm) {
        /* measure unparented world size, then compensate PalmR world scale */
        scene.add(sword);
        sword.scale.setScalar(1);
        sword.updateMatrixWorld(true);
        const sb = new THREE.Box3().setFromObject(sword);
        const ss = new THREE.Vector3(); sb.getSize(ss);
        const cur = Math.max(ss.x, ss.y, ss.z, 0.001);
        const worldS = targetLen / cur;
        scene.remove(sword);
        palm.updateMatrixWorld(true);
        const pWS = new THREE.Vector3();
        palm.getWorldScale(pWS);
        const localS = worldS / Math.max(0.0001, (pWS.x + pWS.y + pWS.z) / 3);
        palm.add(sword);
        sword.scale.setScalar(localS);
        sword.position.set(0.04, 0.08, 0.0);
        sword.rotation.set(Math.PI * 0.08, 0.15, Math.PI * 0.55);
        window.__PROTO3D.swordParent = palm.name;
        window.__PROTO3D.swordScale = localS;
      } else {
        sword.scale.setScalar(targetLen / cur0);
        sword.position.set(0.35, 0.9, 0.12);
        sword.rotation.set(0.2, 0.5, -1.0);
        hero.add(sword);
        window.__PROTO3D.swordParent = 'hero_fallback';
        window.__PROTO3D.swordScale = targetLen / cur0;
      }
      window.__PROTO3D.swordAttached = true;
    } catch (se) {
      console.warn('[B6] sword attach fail', se);
      window.__PROTO3D.swordAttached = false;
    }

    /* Full-body Quaternius Enemy_Large (CC0) on limestone ledge */
    const bossRockGeo = new THREE.CylinderGeometry(2.0, 2.6, 1.4, 8, 3);
    displaceGeo(bossRockGeo, 0.28, 9.1);
    const bossRock = new THREE.Mesh(bossRockGeo, toonMat(C.rockB));
    bossRock.position.set(0.5, 0.55, -11.5);
    bossRock.castShadow = true; bossRock.receiveShadow = true;
    addOutline(bossRock, 1.025);
    scene.add(bossRock);
    if (bossMesh && bossMesh.parent) scene.remove(bossMesh);
    bossMesh = bossGltf.scene;
    bossMesh.updateMatrixWorld(true);
    let bb = new THREE.Box3().setFromObject(bossMesh);
    let bsz = new THREE.Vector3(); bb.getSize(bsz);
    const bossTargetH = 2.6;
    const bScale = bossTargetH / Math.max(0.01, bsz.y);
    bossMesh.scale.setScalar(bScale);
    bossMesh.position.set(0.5, 1.25, -11.5);
    bossMesh.rotation.y = 0; /* face +Z toward hero (hero at origin looking -Z) */
    toonifyObject(bossMesh, null);
    bossMesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    scene.add(bossMesh);
    if (bossGltf.animations && bossGltf.animations.length) {
      mixerBoss = new THREE.AnimationMixer(bossMesh);
      bossClips = {};
      bossGltf.animations.forEach(a => { bossClips[a.name] = mixerBoss.clipAction(a); });
      const idle = bossClips['CharacterArmature|Idle'] || bossClips['MonsterArmature|Idle'] || Object.values(bossClips)[0];
      if (idle) { idle.reset().play(); }
      window.__PROTO3D.bossClips = Object.keys(bossClips);
    }

    boatMesh = boatGltf.scene;
    boatMesh.scale.setScalar(0.95);
    boatMesh.position.set(5.5, 0.05, 3.8);
    boatMesh.rotation.y = -0.85;
    toonifyObject(boatMesh, null);
    scene.add(boatMesh);

    glbReady = true;
    window.__PROTO3D.glbReady = true;
    window.__PROTO3D.combatArmed = false;
    setLoadProgress(92);
    try {
      renderer.compile(scene, camera);
      /* warm a skill-like burst once offscreen */
      if (hero) spawnHitBurst(hero.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xFFD91F, 12);
    } catch (ce) { console.warn('[B8] compile', ce); }
    setLoadProgress(100);
    console.info('[B8] GLB loaded offline', ASSET.license, Object.keys(heroClips));
    window.__PROTO3D.cdnAllOk = true;
    window.__PROTO3D.cdnOk = { offline: true };
  } catch (e) {
    console.warn('[B2] GLB fallback procedural', e);
    hideLoader();
    // ensure procedural hero exists
    if (!hero) { hero = makeHero(); scene.add(hero); }
    // simple boss capsule
    bossMesh = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.0, 4, 8), toonMat(0x8B3A3A));
    b.position.y = 1.1; addOutline(b, 1.05); bossMesh.add(b);
    bossMesh.position.set(0.5, 1.2, -11.5); scene.add(bossMesh);
    glbReady = false;
    if (banner) setTimeout(() => banner.style.display = 'none', 1200);
  }
}


/* ===== B7 pools / save / speech / combat ===== */
const PARTICLE_POOL_N = 3;
const PARTICLE_COUNT = 24;
const particlePool = [];
const dmgPool = [];
const DMG_POOL_N = 12;
const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
let zhVoice = null;
let zhVoiceReady = false;

function initPools() {
  if (!scene) return;
  for (let i = 0; i < PARTICLE_POOL_N; i++) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xFFD91F, size: 0.2, transparent: true, opacity: 1, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    particlePool.push({ pts, geo, mat, vel, life: 0.65, age: 0, active: false });
  }
  const layer = document.getElementById('dmgLayer');
  for (let i = 0; i < DMG_POOL_N; i++) {
    const el = document.createElement('div');
    el.className = 'dmg-float';
    el.style.display = 'none';
    layer.appendChild(el);
    dmgPool.push({ el, busy: false });
  }
}

function floatDmg(text, color, xPct = 50, yPct = 40) {
  let slot = dmgPool.find(d => !d.busy);
  if (!slot) {
    slot = dmgPool[0];
    slot.el.style.animation = 'none';
  }
  slot.busy = true;
  const el = slot.el;
  el.style.display = 'block';
  el.textContent = text;
  el.style.color = color;
  el.style.left = xPct + '%';
  el.style.top = yPct + '%';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  setTimeout(() => { el.style.display = 'none'; slot.busy = false; }, 920);
  triggerShake(0.12);
}

function triggerShake(amp = 0.15) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeT = 0.28;
}

function spawnHitBurst(worldPos, color = 0xFFD91F, n = 36) {
  if (!scene || quality.level < 1) return;
  const p = particlePool.find(x => !x.active);
  if (!p) return;
  p.active = true; p.age = 0; p.life = 0.65;
  p.mat.color.setHex(color); p.mat.opacity = 1;
  p.pts.position.copy(worldPos); p.pts.visible = true;
  const a = p.geo.attributes.position.array;
  const count = Math.min(n, PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    a[i * 3] = 0; a[i * 3 + 1] = 0; a[i * 3 + 2] = 0;
    if (i < count) {
      p.vel[i * 3] = (Math.random() - 0.5) * 6;
      p.vel[i * 3 + 1] = Math.random() * 5 + 1;
      p.vel[i * 3 + 2] = (Math.random() - 0.5) * 6;
    } else {
      p.vel[i * 3] = p.vel[i * 3 + 1] = p.vel[i * 3 + 2] = 0;
    }
  }
  p.geo.attributes.position.needsUpdate = true;
  if (bloomPass && quality.bloom) bloomPass.strength = CFG.bloomStrength + 0.35;
  setTimeout(() => { if (bloomPass) bloomPass.strength = quality.bloom ? CFG.bloomStrength : 0; }, 350);
}

function updateParticles(dt) {
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    p.age += dt;
    const a = p.geo.attributes.position.array;
    for (let j = 0; j < PARTICLE_COUNT; j++) {
      p.vel[j * 3 + 1] -= 9 * dt;
      a[j * 3] += p.vel[j * 3] * dt;
      a[j * 3 + 1] += p.vel[j * 3 + 1] * dt;
      a[j * 3 + 2] += p.vel[j * 3 + 2] * dt;
    }
    p.geo.attributes.position.needsUpdate = true;
    p.mat.opacity = Math.max(0, 1 - p.age / p.life);
    if (p.age >= p.life) { p.active = false; p.pts.visible = false; }
  }
}

function syncHpHud() {
  const bp = Math.max(0, combat.boss / combat.bossMax * 100);
  const hp = Math.max(0, combat.hero / combat.heroMax * 100);
  const mp = Math.max(0, combat.mana / combat.manaMax * 100);
  const bb = document.getElementById('bossHpBar'); if (bb) bb.style.width = bp + '%';
  const hb = document.getElementById('heroHpBar'); if (hb) hb.style.width = hp + '%';
  const mb = document.getElementById('manaBar'); if (mb) mb.style.width = mp + '%';
  const bt = document.getElementById('bossHpTxt'); if (bt) bt.textContent = Math.ceil(combat.boss) + '/' + combat.bossMax;
  const ht = document.getElementById('heroHpTxt'); if (ht) ht.textContent = Math.ceil(combat.hero) + '/' + combat.heroMax;
  const mt = document.getElementById('manaTxt'); if (mt) mt.textContent = Math.ceil(combat.mana) + '/' + combat.manaMax;
  const cl = document.getElementById('comboLab');
  if (cl) cl.textContent = combat.streak >= 5 ? '🔥 COMBO ×1.8' : combat.streak >= 3 ? '🔥 COMBO ×1.4' : (combat.streak > 0 ? '🔥 x' + combat.streak : '');
  syncCdUI();
}

function syncCdUI() {
  const set = (id, cd, max) => {
    const el = document.getElementById(id);
    if (!el) return;
    const p = max > 0 ? Math.max(0, Math.min(1, cd / max)) * 100 : 0;
    el.style.setProperty('--p', p + '%');
  };
  set('atkCd', cds.atk, BAL.basic.cd);
  set('sk1Cd', cds.s1, BAL.skills[0].cd);
  set('sk2Cd', cds.s2, BAL.skills[1].cd);
  set('sk3Cd', cds.s3, BAL.skills[2].cd);
  const ultCd = document.getElementById('ultCd');
  if (ultCd) ultCd.style.setProperty('--p', combat.ultArmed ? '0%' : '100%');
  const ultBtn = document.getElementById('ultBtn');
  if (ultBtn) ultBtn.classList.toggle('disabled', !combat.ultArmed && cds.ult > 0);
}

function saveGame() {
  try {
    const data = {
      schema: SAVE_SCHEMA,
      mana: combat.mana, hero: combat.hero, boss: combat.boss,
      streak: combat.streak, qIndex, ultArmed: !!combat.ultArmed,
      quality: quality.level, ts: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return data;
  } catch (_) { return null; }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.schema !== SAVE_SCHEMA) return null;
    if (data.mana != null) combat.mana = data.mana;
    if (data.hero != null) combat.hero = data.hero;
    if (data.boss != null) combat.boss = data.boss;
    if (data.streak != null) combat.streak = data.streak;
    if (data.qIndex != null) qIndex = data.qIndex;
    if (data.ultArmed != null) combat.ultArmed = data.ultArmed;
    if (data.quality != null) applyQuality(data.quality);
    syncHpHud();
    return data;
  } catch (_) { return null; }
}

function refreshZhVoice() {
  try {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    zhVoice = voices.find(v => /^zh(-|_)/i.test(v.lang) || /chinese|中文|普通话|国语/i.test(v.name)) || null;
    zhVoiceReady = true;
  } catch (_) { zhVoice = null; zhVoiceReady = true; }
}
if (typeof speechSynthesis !== 'undefined') {
  refreshZhVoice();
  speechSynthesis.addEventListener?.('voiceschanged', refreshZhVoice);
}

function speakZh(text, pinyinFallbackEl) {
  if (!text || typeof speechSynthesis === 'undefined') {
    if (pinyinFallbackEl) pinyinFallbackEl.style.display = '';
    return false;
  }
  refreshZhVoice();
  /* Hide pinyin iff a zh-* voice is listed — even if speak() is a no-op (headless). */
  if (!zhVoice) {
    if (pinyinFallbackEl) pinyinFallbackEl.style.display = '';
    return false;
  }
  try {
    try { speechSynthesis.cancel(); } catch (_) {}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = zhVoice.lang || 'zh-CN';
    try { u.voice = zhVoice; } catch (_) {}
    try { speechSynthesis.speak(u); } catch (_) {}
    if (pinyinFallbackEl) { pinyinFallbackEl.style.display = 'none'; pinyinFallbackEl.textContent = ''; }
    return true;
  } catch (_) {
    /* Voice exists: still treat as TTS-capable for UI (do not leak pinyin). */
    if (pinyinFallbackEl) { pinyinFallbackEl.style.display = 'none'; pinyinFallbackEl.textContent = ''; }
    return true;
  }
}

function setPaused(on) {
  combat.paused = !!on;
  gameTimeScale = on ? 0.05 : 1;
  const veil = document.getElementById('pauseVeil');
  if (veil) veil.classList.toggle('on', !!on);
}

function ensureBossTelegraphMesh() {
  if (bossAI.telegraphMesh || !scene) return;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 2.5, 48),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  bossAI.telegraphMesh = ring;
}

function bossPlay(nameKeys) {
  if (!mixerBoss || !bossClips) return;
  const names = Object.keys(bossClips);
  let act = null;
  for (const k of nameKeys) {
    const hit = names.find(n => n === k || n.toLowerCase().includes(k.toLowerCase()));
    if (hit) { act = bossClips[hit]; break; }
  }
  if (!act) return;
  Object.values(bossClips).forEach(a => { if (a.isRunning && a.isRunning()) a.fadeOut(0.12); });
  act.reset();
  if (/attack|bite/i.test(nameKeys.join(','))) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
  else act.setLoop(THREE.LoopRepeat, Infinity);
  act.fadeIn(0.12).play();
}

function updateBossAI(dt) {
  if (!bossMesh || !hero || combat.ended || combat.paused || cinematic.on) return;
  if (!window.__PROTO3D.combatArmed) return;
  ensureBossTelegraphMesh();
  if (!bossAI.home) bossAI.home = bossMesh.position.clone();
  const dx = hero.position.x - bossMesh.position.x;
  const dz = hero.position.z - bossMesh.position.z;
  const dist = Math.hypot(dx, dz);
  bossMesh.rotation.y = Math.atan2(dx, dz);
  bossAI.t += dt;

  if (bossAI.state === 'idle' || bossAI.state === 'chase') {
    if (dist > BAL.bossRange + 0.4) {
      bossAI.state = 'chase';
      const sp = BAL.bossSpeed * dt;
      bossMesh.position.x += (dx / dist) * sp;
      bossMesh.position.z += (dz / dist) * sp;
      bossPlay(['Walk', 'Run', 'Idle']);
    } else {
      bossAI.state = 'idle';
      bossPlay(['Idle']);
    }
    if (bossAI.t >= BAL.bossAtkEvery) {
      bossAI.t = 0;
      bossAI.state = 'telegraph';
      const tg = bossAI.telegraphMesh;
      if (tg) {
        tg.visible = true;
        tg.position.set(hero.position.x, 0.06, hero.position.z);
        tg.scale.setScalar(0.35);
      }
      bossPlay(['Attack', 'Bite', 'Attack.001']);
    }
  } else if (bossAI.state === 'telegraph') {
    const tg = bossAI.telegraphMesh;
    if (tg) {
      const k = Math.min(1, bossAI.t / BAL.telegraph);
      tg.scale.setScalar(0.35 + k * 0.9);
      tg.material.opacity = 0.35 + (1 - k) * 0.4;
    }
    if (bossAI.t >= BAL.telegraph) {
      bossAI.state = 'recover';
      bossAI.t = 0;
      if (tg) tg.visible = false;
      const hx = hero.position.x, hz = hero.position.z;
      const tx = tg ? tg.position.x : bossMesh.position.x;
      const tz = tg ? tg.position.z : bossMesh.position.z;
      if (Math.hypot(hx - tx, hz - tz) <= BAL.bossHitRadius) {
        combat.hero = Math.max(0, combat.hero - BAL.bossAtkDmg);
        floatDmg('-' + BAL.bossAtkDmg, '#ff7a6e', 35, 48);
        sfx('hurt');
        spawnHitBurst(hero.position.clone().add(_tmpV.set(0, 1.2, 0)), 0xff6b5a, 28);
        triggerShake(0.22);
        syncHpHud();
        if (combat.hero <= 0) endCombat(false);
      }
    }
  } else if (bossAI.state === 'recover') {
    if (bossAI.t > 0.6) { bossAI.state = 'idle'; bossAI.t = 0; bossPlay(['Idle']); }
  }
}

function distHeroBoss() {
  if (!hero || !bossMesh) return 99;
  return Math.hypot(hero.position.x - bossMesh.position.x, hero.position.z - bossMesh.position.z);
}

function dealBossDamage(dmg, color = '#FFD91F') {
  if (combat.ended) return;
  let d = dmg;
  if (combat.streak >= 5) d = Math.round(d * BAL.combo5);
  else if (combat.streak >= 3) d = Math.round(d * BAL.combo3);
  combat.boss = Math.max(0, combat.boss - d);
  floatDmg('-' + d, color, 62, 36);
  if (bossMesh) spawnHitBurst(bossMesh.position.clone().add(_tmpV.set(0, 1.4, 0)), 0xFFD91F, 40);
  triggerShake(0.16);
  sfx('hit');
  syncHpHud();
  saveGame();
  if (combat.boss <= 0) { sfx('win'); endCombat(true); }
}

function castBasic() {
  if (combat.ended || combat.paused || cinematic.on) return false;
  window.__PROTO3D.combatArmed = true;
  if (cds.atk > 0) return false;
  cds.atk = BAL.basic.cd;
  playHeroAnim('attack');
  sfx('slash');
  if (distHeroBoss() <= BAL.basic.range) {
    combat.streak++;
    dealBossDamage(BAL.basic.dmg, '#fff');
  }
  return true;
}

function castSkill(idx) {
  if (combat.ended || combat.paused || cinematic.on) return false;
  window.__PROTO3D.combatArmed = true;
  const sk = BAL.skills[idx];
  if (!sk) return false;
  const key = 's' + (idx + 1);
  if (cds[key] > 0) return false;
  if (combat.mana < sk.cost) {
    openQuestion('mana');
    return false;
  }
  combat.mana -= sk.cost;
  cds[key] = sk.cd;
  playHeroAnim('attack');
  sfx('slash');
  spawnClassFx(combat.classId);
  if (distHeroBoss() <= sk.range) {
    combat.streak++;
    dealBossDamage(sk.dmg, '#7c5cff');
  }
  syncHpHud();
  saveGame();
  return true;
}

function requestUltimate() {
  if (combat.ended || combat.paused || cinematic.on) return false;
  window.__PROTO3D.combatArmed = true;
  if (combat.ultArmed) {
    playUltimateCinematic();
    return true;
  }
  openQuestion('ult');
  return false;
}

function playUltimateCinematic() {
  if (cinematic.on || !hero) return;
  combat.ultArmed = false;
  setPaused(false);
  cinematic.on = true;
  cinematic.t = 0;
  cinematic.dur = 2.8;
  const ban = document.getElementById('ultBanner');
  if (ban) ban.classList.add('on');
  playHeroAnim('attack');
  sfx('slash');
  // light pillar
  if (quality.level >= 1) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.55, 10, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xFFE56B, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
    );
    pillar.position.copy(hero.position); pillar.position.y += 5;
    scene.add(pillar);
    cinematic.pillar = pillar;
  }
  // slash arcs as torus pieces
  cinematic.arcs = [];
  for (let i = 0; i < 3; i++) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(1.2 + i * 0.35, 0.06, 6, 24, Math.PI * 1.2),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xFFD91F : 0x7c5cff, transparent: true, opacity: 0.9, depthWrite: false })
    );
    arc.position.copy(hero.position); arc.position.y += 1.2;
    arc.rotation.y = hero.rotation.y + i * 0.4;
    arc.rotation.x = Math.PI * 0.5;
    scene.add(arc);
    cinematic.arcs.push(arc);
  }
  spawnHitBurst(hero.position.clone().add(_tmpV.set(0, 1.2, 0)), 0xFFE56B, 36);
  if (bloomPass && quality.bloom) bloomPass.strength = CFG.bloomStrength + 0.7;
  // camera zoom
  cinematic.orbitDist0 = orbit.dist;
  cinematic.orbitTheta0 = orbit.theta;
}

function updateCinematic(dt) {
  if (!cinematic.on) return;
  cinematic.t += dt;
  const u = cinematic.t / cinematic.dur;
  orbit.dist = THREE.MathUtils.lerp(cinematic.orbitDist0 || 8.2, 5.2, Math.sin(Math.min(1, u * 1.4) * Math.PI) * 0.85);
  orbit.theta = (cinematic.orbitTheta0 || 0) + u * 1.1;
  gameTimeScale = u < 0.55 ? 0.35 : THREE.MathUtils.lerp(0.35, 1, (u - 0.55) / 0.45);
  if (cinematic.arcs) {
    cinematic.arcs.forEach((a, i) => {
      a.rotation.z += dt * (2 + i);
      a.material.opacity = Math.max(0, 1 - u);
      a.scale.setScalar(1 + u * 1.8);
    });
  }
  if (cinematic.pillar) {
    cinematic.pillar.material.opacity = Math.max(0, 0.6 - u * 0.6);
  }
  if (u >= 0.42 && !cinematic.hitDone) {
    cinematic.hitDone = true;
    const flash = document.getElementById('flashFx');
    if (flash) { flash.style.opacity = '0.85'; setTimeout(() => { flash.style.opacity = '0'; }, 90); }
    dealBossDamage(BAL.ult.dmg, '#FFE56B');
    floatDmg('-' + BAL.ult.dmg + '!', '#FFE56B', 55, 30);
    triggerShake(0.35);
    if (bossMesh) spawnHitBurst(bossMesh.position.clone().add(_tmpV.set(0, 1.5, 0)), 0xff5533, 36);
  }
  if (u >= 1) {
    cinematic.on = false;
    gameTimeScale = 1;
    if (cinematic.arcs) cinematic.arcs.forEach(a => { scene.remove(a); a.geometry.dispose(); a.material.dispose(); });
    if (cinematic.pillar) { scene.remove(cinematic.pillar); cinematic.pillar.geometry.dispose(); cinematic.pillar.material.dispose(); }
    cinematic.arcs = null; cinematic.pillar = null; cinematic.hitDone = false;
    const ban = document.getElementById('ultBanner');
    if (ban) ban.classList.remove('on');
    if (bloomPass) bloomPass.strength = quality.bloom ? CFG.bloomStrength : 0;
    orbit.dist = cinematic.orbitDist0 || 8.2;
    saveGame();
  }
}

function endCombat(win) {
  combat.ended = true;
  setPaused(false);
  const panel = document.getElementById('qPanel');
  if (panel) {
    document.getElementById('qBadge').textContent = win ? 'Thắng' : 'Thua';
    document.getElementById('qZh').textContent = win ? '胜利' : '失败';
    document.getElementById('qPy').textContent = win ? 'shènglì' : 'shībài';
    document.getElementById('qHint').textContent = win ? 'Thắng boss!' : 'Thua — thử lại';
    document.getElementById('qOpts').innerHTML = '';
    const rev = document.getElementById('qReveal');
    rev.classList.add('on');
    rev.textContent = win ? 'Hạ boss · học tiếp nhé' : 'Né telegraph đỏ + trả lời để hồi nội năng';
    panel.classList.remove('hide-out');
    panel.classList.add('show');
  }
  if (win) spawnSkillBurst();
  saveGame();
}

function applyAnswer(ok, elapsedSec) {
  const mode = combat.qMode || 'talk';
  if (mode === 'mana') {
    if (ok) {
      combat.mana = combat.manaMax;
      combat.streak++;
      floatDmg('MANA +' + combat.manaMax, '#4da3ff', 50, 42);
      sfx('ui');
    } else {
      combat.streak = 0;
      combat.mana = Math.min(combat.manaMax, combat.mana + BAL.manaSkillWrong);
      floatDmg('+' + BAL.manaSkillWrong + ' mana', '#8899aa', 50, 42);
    }
    syncHpHud();
    saveGame();
    return { after: null };
  }
  if (mode === 'ult') {
    if (ok) {
      combat.ultArmed = true;
      combat.streak++;
      floatDmg('ULT READY', '#FFE56B', 50, 40);
      sfx('win');
      syncHpHud();
      saveGame();
      return { after: 'ult' };
    } else {
      combat.streak = 0;
      floatDmg('Chưa đủ!', '#ff7a6e', 50, 42);
      sfx('hurt');
      saveGame();
      return { after: null };
    }
  }
  if (mode === 'riddle') {
    if (ok) {
      combat.mana = Math.min(combat.manaMax, combat.mana + 40);
      combat.streak++;
      floatDmg('Đố vui +40', '#7dffb0', 50, 42);
    } else {
      combat.streak = 0;
      floatDmg('Sai rồi', '#ff7a6e', 50, 42);
    }
    syncHpHud();
    saveGame();
    return { after: null };
  }
  /* talk / default — classic chip damage */
  if (combat.ended) return { after: null };
  if (ok) {
    combat.streak++;
    let dmg = BAL.dmgCorrect;
    if (elapsedSec <= BAL.fastSec) dmg += BAL.fastBonus;
    dealBossDamage(dmg);
    playHeroAnim('attack');
    spawnClassFx(combat.classId);
  } else {
    combat.streak = 0;
    combat.hero = Math.max(0, combat.hero - BAL.dmgWrong);
    floatDmg('-' + BAL.dmgWrong, '#ff7a6e', 35, 48);
    sfx('hurt');
    if (combat.hero <= 0) endCombat(false);
    syncHpHud();
  }
  saveGame();
  return { after: null };
}

function spawnClassFx(classId) {
  if (!hero || !scene || quality.level < 1) return;
  spawnHitBurst(hero.position.clone().add(_tmpV.set(0, 1.15, 0)), 0x1E90C6, 28);
}

function spawnSkillBurst() {
  if (!hero) return;
  spawnHitBurst(hero.position.clone().add(_tmpV.set(0, 1.2, 0)), 0xFFD91F, 36);
}



function makeProceduralBoss() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 8), toonMat(0x8B3A3A));
  body.position.y = 1.15; body.castShadow = true;
  addOutline(body, 1.05);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), toonMat(0x6B2A2A, { emissive: 0x330000, emissiveIntensity: 0.25 }));
  head.position.y = 2.05;
  g.add(body, head);
  g.position.set(0.5, 1.05, -11.5);
  return g;
}

function makeHero() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.75, 4, 10), toonMat(C.hero));
  body.position.y = 0.95;
  addOutline(body, 1.06);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), toonMat(C.skin));
  head.position.y = 1.72;
  addOutline(head, 1.07);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.4, 8), toonMat(C.hat, { emissive: C.hat, emissiveIntensity: 0.15 }));
  hat.position.y = 2.05;
  addOutline(hat, 1.05);
  /* sash accent */
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16), toonMat(0xE63946));
  sash.position.y = 1.05; sash.rotation.x = Math.PI / 2;
  g.add(body, head, hat, sash);
  g.userData.bob = 0;
  return g;
}

function applyQuality(level) {
  quality.level = level;
  const cap = CFG.pixelRatioMax;
  /* HQ<=1.5 · MID<=1.0 · LOW=0.75 */
  quality.pixelRatio = level >= 2 ? Math.min(devicePixelRatio || 1, Math.min(cap, 1.25))
    : (level === 1 ? Math.min(1.0, cap) : 0.75);
  quality.bloom = level >= 2; /* bloom HQ only — MID/LOW off for p5 */
  quality.waterReflect = level >= 1; /* LOW: flat water */
  quality.fog = true;
  quality.fxaa = false; /* FXAA off all tiers (costly on mobile) */
  quality.shadows = level >= 2;
  quality.outlines = level >= 2;
  if (renderer) {
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.shadowMap.enabled = quality.shadows;
    if (sunLight) {
      sunLight.castShadow = quality.shadows;
      const sm = level >= 2 ? 256 : 128;
      if (sunLight.shadow && sunLight.shadow.mapSize) sunLight.shadow.mapSize.set(sm, sm);
    }
  }
  if (scene && scene.fog) {
    scene.fog.near = level >= 1 ? CFG.fogNear : CFG.fogNear * 0.7;
    scene.fog.far = level >= 1 ? CFG.fogFar : 110;
  }
  if (bloomPass) { bloomPass.enabled = quality.bloom; bloomPass.strength = quality.bloom ? CFG.bloomStrength : 0; }
  if (fxaaPass) fxaaPass.enabled = !!quality.fxaa;
  /* swap water: reflective Water.js vs flat plane */
  try { setWaterMode(quality.waterReflect); } catch (_) {}
  if (layers && layers.far) layers.far.visible = level >= 1;
  if (layers && layers.mid) layers.mid.visible = level >= 1;
  /* toggle outlines */
  if (scene) {
    scene.traverse(o => {
      if (o.userData && o.userData.isOutline) o.visible = !!quality.outlines;
    });
  }
  if (composer) {
    const pr = renderer.getPixelRatio();
    composer.setSize(innerWidth, innerHeight);
    if (fxaaPass) fxaaPass.material.uniforms['resolution'].value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  }
  if (qualBtn) qualBtn.textContent = level >= 2 ? 'HQ' : level === 1 ? 'MID' : 'LOW';
}

let flatWater = null;
function setWaterMode(reflect) {
  if (!scene) return;
  if (reflect) {
    if (flatWater) { flatWater.visible = false; }
    if (water) water.visible = true;
  } else {
    if (!flatWater) {
      flatWater = new THREE.Mesh(
        new THREE.PlaneGeometry(420, 420, 1, 1),
        new THREE.MeshLambertMaterial({ color: C.waterNear })
      );
      flatWater.rotation.x = -Math.PI / 2;
      flatWater.position.y = 0.01;
      scene.add(flatWater);
    }
    flatWater.visible = true;
    if (water) water.visible = false;
  }
}

function init() {
  try {
    toonGrad = makeToonGradient();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(0xE8A878, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.fog, CFG.fogNear, CFG.fogFar);

    camera = new THREE.PerspectiveCamera(CFG.fov || 58, innerWidth / innerHeight, 0.2, 480);

    /* Golden hour + warm rim + soft shadows */
    const hemi = new THREE.HemisphereLight(0xFFE2B0, 0x1A6A78, 0.78);
    scene.add(hemi);
    sunLight = new THREE.DirectionalLight(C.sun, 2.35);
    sunLight.position.set(28, 22, -36);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(128, 128);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 90;
    sunLight.shadow.camera.left = -28;
    sunLight.shadow.camera.right = 28;
    sunLight.shadow.camera.top = 28;
    sunLight.shadow.camera.bottom = -28;
    sunLight.shadow.bias = -0.0008;
    sunLight.shadow.radius = 2.5;
    scene.add(sunLight);
    /* soft sun orb + bloom-friendly glow (ahead in sky) */
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xFFE8A0, fog: false, toneMapped: false })
    );
    sunDisc.position.set(14, 26, -62);
    scene.add(sunDisc);
    const sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(14, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xFFB040, transparent: true, opacity: 0.32, depthWrite: false, fog: false, toneMapped: false })
    );
    sunGlow.position.copy(sunDisc.position);
    scene.add(sunGlow);
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(22, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xFF8844, transparent: true, opacity: 0.14, depthWrite: false, fog: false, toneMapped: false })
    );
    sunHalo.position.copy(sunDisc.position);
    scene.add(sunHalo);
    rimLight = new THREE.DirectionalLight(0xFFAA66, 1.15);
    rimLight.position.set(-35, 14, 18); /* from behind camera onto hero silhouette */
    scene.add(rimLight);
    const fill = new THREE.DirectionalLight(0x88B8E0, 0.4);
    fill.position.set(-25, 20, -8);
    scene.add(fill);
    const deckFill = new THREE.DirectionalLight(0xFFE2C0, 0.65);
    deckFill.position.set(2, 9, 14);
    scene.add(deckFill);

    const skyMesh = makeSky(); scene.add(skyMesh); window.__PROTO3D.skyMesh = skyMesh;
    scene.add(makeSeaBed());
    water = makeWater();
    scene.add(water);
    layers = makeKarstLayers();
    scene.add(layers.near, layers.mid, layers.far);
    rebuildColliders();
    hero = makeHero();
    hero.position.set(0, 1.06, 0.35);
    hero.userData.deckY = 1.06;
    scene.add(hero);
    /* procedural boss placeholder — swapped when GLB arrives */
    bossMesh = makeProceduralBoss();
    scene.add(bossMesh);
    orbit.theta = 0.95;
    orbit.phi = THREE.MathUtils.degToRad(80);
    orbit.dist = 8.2;
    setLoadProgress(40);
    /* B8: playable ASAP — only three.js core required */
    syncHpHud();
    window.__PROTO3D.ready = true;
    window.__PROTO3D.playableAt = performance.now();
    window.__PROTO3D.navStart = NAV_START;
    window.__PROTO3D.ttp = window.__PROTO3D.playableAt - NAV_START;
    setLoadProgress(75);
    hideLoader();
    /* lazy: addons → reflective water/composer → meshopt GLBs */
    (async () => {
      try {
        await loadAddons();
        await upgradeWater();
        if (EffectComposer) {
          composer = new EffectComposer(renderer);
          composer.addPass(new RenderPass(scene, camera));
          const bs = new THREE.Vector2(Math.min(innerWidth, 400), Math.min(innerHeight, 720));
          bloomPass = new UnrealBloomPass(bs, CFG.bloomStrength, CFG.bloomRadius, CFG.bloomThresh);
          bloomPass.enabled = !!quality.bloom;
          composer.addPass(bloomPass);
          fxaaPass = new ShaderPass(FXAAShader);
          fxaaPass.enabled = false;
          const pr = renderer.getPixelRatio();
          fxaaPass.material.uniforms['resolution'].value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
          composer.addPass(fxaaPass);
          composer.addPass(new OutputPass());
        }
        applyQuality(quality.level);
        await loadCharacters();
        syncHpHud();
        setLoadProgress(100);
        console.info('[B8] enhanced+GLB', (performance.now() - NAV_START).toFixed(0), 'ttp', window.__PROTO3D.ttp?.toFixed?.(0));
      } catch (e) { console.warn('[B8] enhance fail', e); }
    })();

    /* Post FX deferred until addons load */
    composer = null; bloomPass = null; fxaaPass = null;

    orbit.theta = 0.0;
    orbit.phi = THREE.MathUtils.degToRad(80);
    orbit.dist = 8.2;
    clock = new THREE.Clock();
    applyQuality(innerWidth <= 1100 ? 1 : 2); /* mobile default MID */
    initPools();
    bindInput();
    loadGame();
    window.addEventListener('resize', () => {
      if (!camera || !renderer) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false);
      if (composer) composer.setSize(innerWidth, innerHeight);
      if (fxaaPass) {
        const pr = renderer.getPixelRatio();
        fxaaPass.material.uniforms['resolution'].value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
      }
    });
    qualBtn.onclick = () => applyQuality((quality.level + 2) % 3);
    const bindTap = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); unlockAudio(); fn(); });
    };
    bindTap('atkBtn', () => castBasic());
    bindTap('sk1', () => castSkill(0));
    bindTap('sk2', () => castSkill(1));
    bindTap('sk3', () => castSkill(2));
    bindTap('ultBtn', () => requestUltimate());
    document.getElementById('talkBtn').onclick = () => {
      if (performance.now() < inputLockUntil || combat.ended || combat.locked || cinematic.on) return;
      inputLockUntil = performance.now() + 300;
      openQuestion(combat.stage === 'road' ? 'riddle' : 'talk');
    };

    loadQuestions().then(() => { if (!window.__PROTO3D.ready) {/* wait glb */} });
    // ready set after GLB (or fallback) in loadCharacters
    setTimeout(() => { if (!window.__PROTO3D.ready) { window.__PROTO3D.ready = true; hideLoader(); } }, 4000);
    syncHpHud();
    loop();
  } catch (e) {
    showErr('WebGL/init: ' + (e && e.message));
  }
}

/* ---- Questions: embedded cau_hoi_v7.json (40q · 20 text/20 audio) · single-file ---- */
const CAU_HOI_V7 = [{"id":"v6-bl-01","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":1,"loai":"bat_loi","type":"text","distractor_group":"nhận/trả phòng khách sạn","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我要办理入住。","dap_an":["Tôi muốn trả phòng","Tôi muốn đổi phòng","Tôi muốn gia hạn phòng","Tôi muốn làm thủ tục nhận phòng"],"dung":3,"pinyin":"Wǒ yào bànlǐ rùzhù.","nghia":"Tôi muốn làm thủ tục nhận phòng.","giai_thich":"办理入住 (bànlǐ rùzhù) = làm thủ tục nhận phòng; dễ nhầm với 退房 (tuìfáng) trả phòng."},{"id":"v6-bl-02","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":1,"loai":"bat_loi","type":"text","distractor_group":"hỏi thông tin khách lịch sự","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请问您贵姓？","dap_an":["Xin hỏi quý khách đi mấy người?","Xin hỏi quý khách ở mấy đêm?","Xin hỏi quý họ là gì?","Xin hỏi quý khách có đặt trước không?"],"dung":2,"pinyin":"Qǐngwèn nín guìxìng?","nghia":"Xin hỏi quý họ là gì?","giai_thich":"贵姓 (guìxìng) = hỏi họ lịch sự; dùng 您 (nín) với khách."},{"id":"v6-bl-03","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":1,"loai":"bat_loi","type":"text","distractor_group":"chấm công / ca làm nhà máy","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我去打卡。","dap_an":["Tôi đi chấm công","Tôi đi tăng ca","Tôi đi tan ca","Tôi đi vào kho"],"dung":0,"pinyin":"Wǒ qù dǎkǎ.","nghia":"Tôi đi chấm công.","giai_thich":"打卡 (dǎkǎ) = chấm công; khác 加班 (jiābān) tăng ca, 下班 (xiàbān) tan ca."},{"id":"v6-bl-04","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":2,"loai":"bat_loi","type":"text","distractor_group":"câu lịch sự quầy lễ tân","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请稍等。","dap_an":["Xin mời vào","Xin đợi một chút","Xin mời ngồi","Xin giữ liên lạc"],"dung":1,"pinyin":"Qǐng shāo děng.","nghia":"Xin đợi một chút.","giai_thich":"稍等 (shāo děng) = đợi một chút; cũng nói 等一下 (děng yíxià)."},{"id":"v6-bl-05","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":2,"loai":"bat_loi","type":"text","distractor_group":"lên/xuống du thuyền","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请上船。","dap_an":["Mời xuống thuyền","Mời ngồi yên","Mời đeo áo phao","Mời lên thuyền"],"dung":3,"pinyin":"Qǐng shàng chuán.","nghia":"Mời lên thuyền.","giai_thich":"上船 (shàng chuán) = lên thuyền; 下船 (xià chuán) = xuống thuyền."},{"id":"v6-bl-06","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":2,"loai":"bat_loi","type":"text","distractor_group":"bảo dưỡng / sửa máy","cau_hoi":"Chọn nghĩa đúng:","chu_han":"机器需要保养。","dap_an":["Máy cần thay dầu","Máy đã hỏng rồi","Máy cần bảo dưỡng","Máy cần tắt nguồn"],"dung":2,"pinyin":"Jīqì xūyào bǎoyǎng.","nghia":"Máy cần bảo dưỡng.","giai_thich":"保养 (bǎoyǎng) = bảo dưỡng; dễ nhầm 保修 (bǎoxiū) bảo hành, 维修 (wéixiū) sửa chữa."},{"id":"v6-bl-07","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":2,"loai":"bat_loi","type":"text","distractor_group":"đặt phòng / nhận phòng","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请问您有预订吗？","dap_an":["Quý khách đã đặt phòng trước chưa?","Quý khách muốn trả phòng chứ?","Quý khách muốn đổi phòng chứ?","Quý khách muốn ở thêm đêm chứ?"],"dung":0,"pinyin":"Qǐngwèn nín yǒu yùdìng ma?","nghia":"Quý khách đã đặt phòng trước chưa?","giai_thich":"预订 (yùdìng) = đặt trước; khác 退房 (tuìfáng), 续住 (xùzhù) ở thêm."},{"id":"v6-bl-08","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":3,"loai":"bat_loi","type":"text","distractor_group":"yêu cầu món ăn / khẩu vị","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我不吃辣。","dap_an":["Tôi không ăn mặn","Tôi không ăn ngọt","Tôi không ăn chua","Tôi không ăn cay"],"dung":3,"pinyin":"Wǒ bù chī là.","nghia":"Tôi không ăn cay.","giai_thich":"不吃辣 (bù chī là) = không ăn cay; 辣 (là) = cay."},{"id":"v6-bl-09","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":3,"loai":"bat_loi","type":"text","distractor_group":"kiểm tra chất lượng hàng","cau_hoi":"Chọn nghĩa đúng:","chu_han":"这批货没通过质检。","dap_an":["Lô hàng này đã xuất kho","Lô hàng này chưa đạt kiểm tra chất lượng","Lô hàng này đang đóng gói","Lô hàng này là hàng mẫu"],"dung":1,"pinyin":"Zhè pī huò méi tōngguò zhìjiǎn.","nghia":"Lô hàng này chưa đạt kiểm tra chất lượng.","giai_thich":"没通过质检 (méi tōngguò zhìjiǎn) = chưa đạt kiểm định chất lượng."},{"id":"v6-bl-10","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":3,"loai":"bat_loi","type":"text","distractor_group":"cọc / thanh toán khách sạn","cau_hoi":"Chọn nghĩa đúng:","chu_han":"押金退房时退还给您。","dap_an":["Phí phòng thu khi nhận phòng","Phí mini-bar trừ vào hóa đơn","Tiền cọc hoàn lại khi trả phòng","Phí muộn giờ tính thêm một đêm"],"dung":2,"pinyin":"Yājīn tuìfáng shí tuìhuán gěi nín.","nghia":"Tiền cọc hoàn lại khi trả phòng.","giai_thich":"押金 (yājīn) = tiền cọc; 退还 (tuìhuán) = hoàn lại; 退房 (tuìfáng) = trả phòng."},{"id":"v6-hai-01","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":1,"loai":"hai","type":"text","distractor_group":"câu mở đầu lịch sự","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请问一下。","dap_an":["Xin hỏi một chút","Xin ngồi một chút","Xin chờ một chút","Xin ký một chút"],"dung":0,"pinyin":"Qǐngwèn yíxià.","nghia":"Xin hỏi một chút.","giai_thich":"问 (wèn, thanh 4) = hỏi; dễ đọc nhầm 吻 (wěn, thanh 3) = hôn."},{"id":"v6-hai-02","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":1,"loai":"hai","type":"text","distractor_group":"gọi món nước/canh nhà hàng","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请来一碗汤。","dap_an":["Cho một tô cơm","Cho một tô phở","Cho một tô chè","Cho một tô canh"],"dung":3,"pinyin":"Qǐng lái yì wǎn tāng.","nghia":"Cho một tô canh.","giai_thich":"汤 (tāng, thanh 1) = canh; gần âm 糖 (táng, thanh 2) = đường."},{"id":"v6-hai-03","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":1,"loai":"hai","type":"text","distractor_group":"mua/bán nguyên liệu nhà máy","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我去买原料。","dap_an":["Tôi đi bán nguyên liệu","Tôi đi kiểm nguyên liệu","Tôi đi mua nguyên liệu","Tôi đi chuyển nguyên liệu"],"dung":2,"pinyin":"Wǒ qù mǎi yuánliào.","nghia":"Tôi đi mua nguyên liệu.","giai_thich":"买 (mǎi, thanh 3) = mua; 卖 (mài, thanh 4) = bán — chỉ khác thanh."},{"id":"v6-hai-04","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":2,"loai":"hai","type":"text","distractor_group":"gọi món điểm tâm","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我要水饺。","dap_an":["Tôi muốn há cảo","Tôi muốn mì xào","Tôi muốn bánh bao","Tôi muốn cháo trắng"],"dung":0,"pinyin":"Wǒ yào shuǐjiǎo.","nghia":"Tôi muốn há cảo (sủi cảo).","giai_thich":"水饺 (shuǐjiǎo) = há cảo; gần âm 睡觉 (shuìjiào) = ngủ."},{"id":"v6-hai-05","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":2,"loai":"hai","type":"text","distractor_group":"nội quy phòng khách sạn","cau_hoi":"Chọn nghĩa đúng:","chu_han":"这里不可以抽烟。","dap_an":["Ở đây không được ồn ào","Ở đây không được hút thuốc","Ở đây không được gửi đồ","Ở đây không được mang thú cưng"],"dung":1,"pinyin":"Zhèlǐ bù kěyǐ chōuyān.","nghia":"Ở đây không được hút thuốc.","giai_thich":"抽烟 (chōuyān) = hút thuốc; 不可以 (bù kěyǐ) = không được."},{"id":"v6-hai-06","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":2,"loai":"hai","type":"text","distractor_group":"khen cảnh du lịch","cau_hoi":"Chọn nghĩa đúng:","chu_han":"景色真美！","dap_an":["Cảnh đông quá!","Cảnh xa quá!","Cảnh lạ quá!","Cảnh đẹp quá!"],"dung":3,"pinyin":"Jǐngsè zhēn měi!","nghia":"Cảnh đẹp quá!","giai_thich":"美 (měi, thanh 3) = đẹp; dễ nhầm 妹 (mèi, thanh 4) = em gái."},{"id":"v6-hai-07","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":2,"loai":"hai","type":"text","distractor_group":"gửi hàng / xuất kho","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我们已经发货了。","dap_an":["Chúng tôi đã nổi nóng rồi","Chúng tôi đã kiểm hàng rồi","Chúng tôi đã gửi hàng rồi","Chúng tôi đã nhập kho rồi"],"dung":2,"pinyin":"Wǒmen yǐjīng fāhuò le.","nghia":"Chúng tôi đã gửi hàng rồi.","giai_thich":"发货 (fāhuò) = gửi hàng; gần âm 发火 (fāhuǒ) = nổi nóng."},{"id":"v6-hai-08","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":3,"loai":"hai","type":"text","distractor_group":"hành lý lễ tân","cau_hoi":"Chọn nghĩa đúng:","chu_han":"请帮我寄存行李。","dap_an":["Xin giúp tôi gửi giữ hành lý","Xin giúp tôi mang hành lý lên phòng","Xin giúp tôi cân hành lý","Xin giúp tôi bọc hành lý"],"dung":0,"pinyin":"Qǐng bāng wǒ jìcún xínglǐ.","nghia":"Xin giúp tôi gửi giữ hành lý.","giai_thich":"寄存 (jìcún) = gửi/giữ hộ; gần âm 记错 (jìcuò) = nhớ nhầm."},{"id":"v6-hai-09","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":3,"loai":"hai","type":"text","distractor_group":"thanh toán nhà hàng","cau_hoi":"Chọn nghĩa đúng:","chu_han":"老板，买单！","dap_an":["Chủ quán, gọi món!","Chủ quán, tính tiền!","Chủ quán, gọi nước!","Chủ quán, đổi bàn!"],"dung":1,"pinyin":"Lǎobǎn, mǎidān!","nghia":"Chủ quán, tính tiền!","giai_thich":"买单 (mǎidān) = tính tiền; 买 (mǎi) ≠ 卖 (mài) bán."},{"id":"v6-hai-10","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":3,"loai":"hai","type":"text","distractor_group":"họp / trao đổi nội bộ","cau_hoi":"Chọn nghĩa đúng:","chu_han":"我们开会五分钟。","dap_an":["Chúng ta nghỉ năm phút","Chúng ta tan ca năm phút","Chúng ta kiểm hàng năm phút","Chúng ta họp năm phút"],"dung":3,"pinyin":"Wǒmen kāihuì wǔ fēnzhōng.","nghia":"Chúng ta họp năm phút.","giai_thich":"开会 (kāihuì) = họp; gần âm 开荤 (kāihūn) = phá chay."},{"id":"v6-nn-01","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"câu chào đón / tiễn khách sạn gần nghĩa","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"您好，欢迎光临。","dap_an":["您好，欢迎光临。","您好，欢迎再来。","您好，一路平安。","您好，请慢走。"],"dung":0,"pinyin":"Nín hǎo, huānyíng guānglín.","nghia":"Xin chào, hân hạnh đón tiếp.","giai_thich":"欢迎光临 (huānyíng guānglín) = hân hạnh đón tiếp khi khách vào; 欢迎再来 (huānyíng zàilái) = chào mời quay lại; 一路平安 (yílù píng'ān) = chúc thượng lộ bình an; 请慢走 (qǐng màn zǒu) = xin đi chậm/tạm biệt khi khách ra."},{"id":"v6-nn-02","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"gọi đồ uống gần khung câu","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请给我一杯水。","dap_an":["请给我一杯茶。","请给我一杯水。","请给我一杯奶。","请给我一杯咖啡。"],"dung":1,"pinyin":"Qǐng gěi wǒ yì bēi shuǐ.","nghia":"Cho tôi một ly nước.","giai_thich":"一杯水 (yì bēi shuǐ) = một ly nước; 一杯茶 (yì bēi chá) = một ly trà; 一杯奶 (yì bēi nǎi) = một ly sữa; 一杯咖啡 (yì bēi kāfēi) = một ly cà phê — cùng khung '请给我一杯…', khác đồ uống."},{"id":"v6-nn-03","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"trang phục / bảo hộ lao động gần chủ đề","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请穿工作服。","dap_an":["请戴安全帽。","请戴防护眼镜。","请戴手套。","请穿工作服。"],"dung":3,"pinyin":"Qǐng chuān gōngzuòfú.","nghia":"Xin mặc đồ bảo hộ lao động.","giai_thich":"穿工作服 (chuān gōngzuòfú) = mặc đồng phục/đồ bảo hộ; 戴安全帽 (dài ānquánmào) = đội mũ bảo hộ; 戴防护眼镜 (dài fánghù yǎnjìng) = đeo kính bảo hộ; 戴手套 (dài shǒutào) = đeo găng tay — cùng chủ đề bảo hộ, khác bộ phận."},{"id":"v6-nn-04","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"số tầng / vị trí phòng gần âm số","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"您的房间在五楼。","dap_an":["您的房间在三楼。","您的房间在四楼。","您的房间在五楼。","您的房间在十五楼。"],"dung":2,"pinyin":"Nín de fángjiān zài wǔ lóu.","nghia":"Phòng quý khách ở tầng 5.","giai_thich":"五楼 (wǔ lóu) = tầng 5; 三楼 (sān lóu) = tầng 3; 四楼 (sì lóu) = tầng 4; 十五楼 (shíwǔ lóu) = tầng 15 — cùng khung '您的房间在…楼', khác số tầng dễ nhầm khi nghe."},{"id":"v6-nn-05","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"cảnh báo an toàn trên thuyền gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"小心，地板很滑。","dap_an":["小心，栏杆很低。","小心，浪很大。","小心，地板很滑。","小心，门很窄。"],"dung":2,"pinyin":"Xiǎoxīn, dìbǎn hěn huá.","nghia":"Cẩn thận, sàn rất trơn.","giai_thich":"地板很滑 (dìbǎn hěn huá) = sàn rất trơn; 栏杆很低 (lángān hěn dī) = lan can rất thấp; 浪很大 (làng hěn dà) = sóng rất lớn; 门很窄 (mén hěn zhǎi) = cửa rất hẹp — cùng cảnh báo '小心，…', khác nguy hiểm."},{"id":"v6-nn-06","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"phân loại hàng gần âm -品","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"样品","dap_an":["次品","药品","样品","成品"],"dung":2,"pinyin":"yàngpǐn","nghia":"Hàng mẫu.","giai_thich":"样品 (yàngpǐn) = hàng mẫu; 次品 (cìpǐn) = hàng lỗi; 药品 (yàopǐn) = thuốc; 成品 (chéngpǐn) = thành phẩm — cùng đuôi -品, gần âm."},{"id":"v6-nn-07","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"khẩu vị món ăn gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"这道菜不辣。","dap_an":["这道菜很辣。","这道菜有点咸。","这道菜有点甜。","这道菜不辣。"],"dung":3,"pinyin":"Zhè dào cài bú là.","nghia":"Món này không cay.","giai_thich":"不辣 (bú là) = không cay; 很辣 (hěn là) = rất cay; 有点咸 (yǒudiǎn xián) = hơi mặn; 有点甜 (yǒudiǎn tián) = hơi ngọt — cùng khung '这道菜…', khác khẩu vị."},{"id":"v6-nn-08","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"tình trạng phòng khách sạn gần nghĩa","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"对不起，今天房间都满了。","dap_an":["对不起，今天房间在打扫。","对不起，今天房间都满了。","对不起，今天房间在维修。","对不起，今天只有单人间。"],"dung":1,"pinyin":"Duìbuqǐ, jīntiān fángjiān dōu mǎn le.","nghia":"Xin lỗi, hôm nay phòng đều hết.","giai_thich":"房间都满了 (fángjiān dōu mǎn le) = phòng đều hết; 房间在打扫 (fángjiān zài dǎsǎo) = phòng đang dọn; 房间在维修 (fángjiān zài wéixiū) = phòng đang sửa; 只有单人间 (zhǐ yǒu dānrénjiān) = chỉ còn phòng đơn — cùng xin lỗi về phòng, khác tình trạng."},{"id":"v6-nn-09","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"xử lý lô hàng nhà máy gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"这批货需要重新检查。","dap_an":["这批货需要重新包装。","这批货需要重新入库。","这批货需要重新检查。","这批货需要马上出库。"],"dung":2,"pinyin":"Zhè pī huò xūyào chóngxīn jiǎnchá.","nghia":"Lô hàng này cần kiểm tra lại.","giai_thich":"重新检查 (chóngxīn jiǎnchá) = kiểm tra lại; 重新包装 (chóngxīn bāozhuāng) = đóng gói lại; 重新入库 (chóngxīn rùkù) = nhập kho lại; 马上出库 (mǎshàng chūkù) = xuất kho ngay — cùng '这批货需要…', khác thao tác."},{"id":"v6-nn-10","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"giờ xuất phát du thuyền gần âm thời gian","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"船将在十分钟后出发。","dap_an":["船将在十分钟后出发。","船将在十小时后出发。","船十分钟前已经出发。","船将在十分钟内取消。"],"dung":0,"pinyin":"Chuán jiāng zài shí fēnzhōng hòu chūfā.","nghia":"Thuyền xuất phát sau 10 phút.","giai_thich":"十分钟后出发 (shí fēnzhōng hòu chūfā) = xuất phát sau 10 phút; 十小时后 (shí xiǎoshí hòu) = sau 10 giờ; 十分钟前已经出发 (shí fēnzhōng qián yǐjīng chūfā) = đã xuất phát 10 phút trước; 十分钟内取消 (shí fēnzhōng nèi qǔxiāo) = hủy trong 10 phút — gần âm số/thời gian."},{"id":"v7-nn-11","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"vị trí trong khách sạn gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"前台在一楼。","chu_han":"前台在一楼。","dap_an":["餐厅在一楼。","电梯在一楼。","前台在一楼。","健身房在一楼。"],"dung":2,"pinyin":"Qiántái zài yī lóu.","nghia":"Lễ tân ở tầng 1.","giai_thich":"前台 (qiántái) = quầy lễ tân; 餐厅 (cāntīng) = nhà hàng; 电梯 (diàntī) = thang máy; 健身房 (jiànshēnfáng) = phòng gym — cùng '…在一楼', khác địa điểm."},{"id":"v7-nn-12","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"yêu cầu phục vụ bàn gần âm -单","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请给我菜单。","chu_han":"请给我菜单。","dap_an":["请给我菜单。","请给我账单。","请给我筷子。","请给我白开水。"],"dung":0,"pinyin":"Qǐng gěi wǒ càidān.","nghia":"Cho tôi thực đơn.","giai_thich":"菜单 (càidān) = thực đơn; 账单 (zhàngdān) = hóa đơn (gần âm -单); 筷子 (kuàizi) = đũa; 白开水 (báikāishuǐ) = nước lọc — cùng '请给我…', 菜单/账单 dễ nhầm."},{"id":"v7-nn-13","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":1,"loai":"nghe_nhanh","type":"audio","distractor_group":"giờ vào ca / tan ca gần âm -班","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"今天几点上班？","chu_han":"今天几点上班？","dap_an":["今天几点下班？","今天几点加班？","今天几点开会？","今天几点上班？"],"dung":3,"pinyin":"Jīntiān jǐ diǎn shàngbān?","nghia":"Hôm nay mấy giờ vào ca?","giai_thich":"上班 (shàngbān) = vào ca/đi làm; 下班 (xiàbān) = tan ca (đối nghĩa gần âm); 加班 (jiābān) = tăng ca; 开会 (kāihuì) = họp — cùng '今天几点…', khác hành động."},{"id":"v7-nn-14","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"hành lý / dịch vụ lễ tân gần chủ đề","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"行李可以寄存在这里。","chu_han":"行李可以寄存在这里。","dap_an":["行李可以送到房间。","行李可以寄存在这里。","行李必须自己拿上去。","行李超重需要付费。"],"dung":1,"pinyin":"Xínglǐ kěyǐ jìcún zài zhèlǐ.","nghia":"Hành lý có thể gửi giữ ở đây.","giai_thich":"寄存 (jìcún) = gửi/giữ hộ; 送到房间 (sòng dào fángjiān) = gửi lên phòng; 必须自己拿上去 (bìxū zìjǐ ná shàngqù) = phải tự mang lên; 超重需要付费 (chāozhòng xūyào fùfèi) = quá cân phải trả phí — cùng chủ đề hành lý."},{"id":"v7-nn-15","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"an toàn trên thuyền gần đuôi 衣","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请穿上救生衣。","chu_han":"请穿上救生衣。","dap_an":["请脱下雨衣。","请穿上救生衣。","请戴上墨镜。","请穿上防滑鞋。"],"dung":1,"pinyin":"Qǐng chuān shàng jiùshēngyī.","nghia":"Xin mặc áo phao.","giai_thich":"救生衣 (jiùshēngyī) = áo phao/áo cứu sinh; 雨衣 (yǔyī) = áo mưa (cùng đuôi 衣); 墨镜 (mòjìng) = kính râm; 防滑鞋 (fánghuáxié) = giày chống trượt — cùng trang phục an toàn/du thuyền."},{"id":"v7-nn-16","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"phân loại hàng trong xưởng gần âm -品","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请把次品放在这边。","chu_han":"请把次品放在这边。","dap_an":["请把样品放在这边。","请把成品放在这边。","请把次品放在这边。","请把原料放在这边。"],"dung":2,"pinyin":"Qǐng bǎ cìpǐn fàng zài zhèbiān.","nghia":"Xin để hàng lỗi ở bên này.","giai_thich":"次品 (cìpǐn) = hàng lỗi; 样品 (yàngpǐn) = hàng mẫu; 成品 (chéngpǐn) = thành phẩm; 原料 (yuánliào) = nguyên liệu — cùng khung '请把…放在这边', gần âm -品."},{"id":"v7-nn-17","chang":"Hạ Long – Nhà hàng","ngon_ngu":"zh","do_kho":2,"loai":"nghe_nhanh","type":"audio","distractor_group":"gọi thêm món cơm/canh gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"我想再加点米饭。","chu_han":"我想再加点米饭。","dap_an":["我想再加点米饭。","我想再加点汤。","我想再加双筷子。","我想再加一把椅子。"],"dung":0,"pinyin":"Wǒ xiǎng zài jiā diǎn mǐfàn.","nghia":"Tôi muốn thêm cơm.","giai_thich":"米饭 (mǐfàn) = cơm; 汤 (tāng) = canh; 筷子 (kuàizi) = đũa; 椅子 (yǐzi) = ghế — cùng '我想再加…', khác món/đồ."},{"id":"v7-nn-18","chang":"Bãi Cháy – Lễ tân","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"tình trạng phòng sẵn sàng gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"您的房间已经准备好了。","chu_han":"您的房间已经准备好了。","dap_an":["您的房间正在打扫。","您的房间已经客满。","您的房间需要交押金。","您的房间已经准备好了。"],"dung":3,"pinyin":"Nín de fángjiān yǐjīng zhǔnbèi hǎo le.","nghia":"Phòng quý khách đã sẵn sàng.","giai_thich":"已经准备好了 (yǐjīng zhǔnbèi hǎo le) = đã sẵn sàng; 正在打扫 (zhèngzài dǎsǎo) = đang dọn; 已经客满 (yǐjīng kèmǎn) = đã hết phòng; 需要交押金 (xūyào jiāo yājīn) = cần đặt cọc — cùng '您的房间…', khác trạng thái."},{"id":"v7-nn-19","chang":"Cẩm Phả – Nhà máy","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"an toàn khi sửa máy gần khung 先…再…","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请先关闭电源再维修。","chu_han":"请先关闭电源再维修。","dap_an":["请先打开电源再维修。","请先关闭电源再维修。","请先擦干净再维修。","请先试运行再维修。"],"dung":1,"pinyin":"Qǐng xiān guānbì diànyuán zài wéixiū.","nghia":"Xin tắt nguồn rồi mới sửa.","giai_thich":"关闭电源 (guānbì diànyuán) = tắt nguồn; 打开电源 (dǎkāi diànyuán) = mở nguồn (đối nghĩa gần); 擦干净 (cā gānjìng) = lau sạch; 试运行 (shì yùnxíng) = chạy thử — cùng '请先…再维修'."},{"id":"v7-nn-20","chang":"Hạ Long – Du thuyền","ngon_ngu":"zh","do_kho":3,"loai":"nghe_nhanh","type":"audio","distractor_group":"nội quy an toàn du thuyền gần khung","cau_hoi":"Nghe và chọn chữ đúng:","am_thanh":"请不要把身体探出船外。","chu_han":"请不要把身体探出船外。","dap_an":["请不要在船上站起来。","请不要把身体探出船外。","请不要在船上拍照。","请不要脱下救生衣。"],"dung":1,"pinyin":"Qǐng búyào bǎ shēntǐ tàn chū chuán wài.","nghia":"Xin đừng thò người ra ngoài thuyền.","giai_thich":"把身体探出船外 (bǎ shēntǐ tàn chū chuán wài) = thò người ra ngoài thuyền; 在船上站起来 (zài chuán shàng zhàn qǐlái) = đứng dậy trên thuyền; 在船上拍照 (zài chuán shàng pāizhào) = chụp ảnh trên thuyền; 脱下救生衣 (tuō xià jiùshēngyī) = tháo áo phao — cùng nội quy '请不要…'."},{"id":"b7-rid-01","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":2,"loai":"do_vui","type":"text","distractor_group":"câu đố đường dài","cau_hoi":"Câu đố dài — đọc kỹ cả câu rồi chọn nghĩa đúng của cả cụm từ in đậm trong tình huống hỏi đường ven vịnh Hạ Long:","chu_han":"请问，去天涯海角怎么走？","dap_an":["Xin hỏi đi Thiên Nhai Hải Giác bằng đường nào?","Xin hỏi nhà hàng ở đâu?","Xin hỏi mấy giờ mở cửa?","Xin hỏi có Wi‑Fi không?"],"dung":0,"pinyin":"Qǐngwèn, qù Tiānyá Hǎijiǎo zěnme zǒu?","nghia":"Xin hỏi đi Thiên Nhai Hải Giác bằng đường nào?","giai_thich":"怎么走 (zěnme zǒu) = đi bằng đường nào; 天涯海角 = địa danh/điểm đến."},{"id":"b7-rid-02","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":3,"loai":"do_vui","type":"text","distractor_group":"câu đố khó đường dài","cau_hoi":"Câu đố khó — khách hỏi bạn một câu lịch sự dài về thời tiết và lịch trình du thuyền. Chọn bản dịch đúng nhất:","chu_han":"如果明天天气不好，游船还会准时出发吗？","dap_an":["Nếu ngày mai thời tiết xấu, du thuyền vẫn xuất phát đúng giờ chứ?","Ngày mai nhất định có nắng và thuyền sẽ trễ.","Nếu trời đẹp thì hủy chuyến.","Du thuyền chỉ chạy ban đêm khi mưa."],"dung":0,"pinyin":"Rúguǒ míngtiān tiānqì bù hǎo, yóuchuán hái huì zhǔnshí chūfā ma?","nghia":"Nếu ngày mai thời tiết xấu, du thuyền vẫn xuất phát đúng giờ chứ?","giai_thich":"如果…还会…吗？= nếu…thì vẫn…chứ?; 准时出发 = xuất phát đúng giờ."},{"id":"b7-rid-03","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":2,"loai":"do_vui","type":"text","distractor_group":"câu đố đường dài","cau_hoi":"Câu đố — trên đường tới đảo, hướng dẫn viên nói một câu dài. Chọn nghĩa đúng:","chu_han":"请大家跟上队伍，不要掉队，注意安全。","dap_an":["Xin mọi người đi theo đoàn, đừng lạc, chú ý an toàn.","Xin ngồi yên và tắt điện thoại.","Xin mua vé trước khi lên thuyền.","Xin trả phòng trước 12 giờ."],"dung":0,"pinyin":"Qǐng dàjiā gēn shàng duìwu, bú yào diào duì, zhùyì ānquán.","nghia":"Xin mọi người đi theo đoàn, đừng lạc, chú ý an toàn.","giai_thich":"跟上队伍 = đi kịp đoàn; 掉队 = lạc đoàn; 注意安全 = chú ý an toàn."},{"id":"b7-rid-04","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":3,"loai":"do_vui","type":"text","distractor_group":"câu đố khó","cau_hoi":"Câu đố HARD — chọn nghĩa đúng của câu phỏng vấn khách sạn khá dài:","chu_han":"您需要我帮您预约明天早上的出租车去机场吗？","dap_an":["Quý khách có cần tôi đặt taxi sáng mai ra sân bay giúp không?","Quý khách muốn đổi phòng nhìn ra biển chứ?","Quý khách muốn ăn sáng buffet miễn phí chứ?","Quý khách muốn gia hạn thêm hai đêm chứ?"],"dung":0,"pinyin":"Nín xūyào wǒ bāng nín yùyuē míngtiān zǎoshang de chūzūchē qù jīchǎng ma?","nghia":"Quý khách có cần tôi đặt taxi sáng mai ra sân bay giúp không?","giai_thich":"预约出租车 = đặt trước taxi; 机场 = sân bay."},{"id":"b7-rid-05","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":2,"loai":"do_vui","type":"text","distractor_group":"câu đố đường dài","cau_hoi":"Câu đố dài — chọn nghĩa đúng khi hỏi giá và thời gian tham quan hang động:","chu_han":"参观这个岩洞需要多长时间，门票多少钱？","dap_an":["Tham quan hang đá này mất bao lâu, vé bao nhiêu tiền?","Hang này có cho phép bơi không?","Hang này mở cửa đến mấy giờ tối?","Có được mang đồ ăn vào hang không?"],"dung":0,"pinyin":"Cānguān zhège yándòng xūyào duō cháng shíjiān, ménpiào duōshǎo qián?","nghia":"Tham quan hang đá này mất bao lâu, vé bao nhiêu tiền?","giai_thich":"岩洞 = hang đá; 门票 = vé vào cửa."},{"id":"b7-rid-06","chang":"Đường ven vịnh","ngon_ngu":"zh","do_kho":3,"loai":"do_vui","type":"text","distractor_group":"câu đố khó ultimate","cau_hoi":"Câu đố HARD (Ultimate) — đọc kỹ rồi chọn bản dịch đúng nhất của lời căn dặn an toàn trên thuyền:","chu_han":"为了您的安全，请在船上全程穿着救生衣，不要把身体探出船外。","dap_an":["Vì an toàn, xin mặc áo phao suốt hành trình và đừng thò người ra ngoài thuyền.","Vì đẹp ảnh, xin cởi áo phao khi chụp hình.","Xin đứng ở mũi thuyền để nhìn cảnh.","Xin nhảy xuống nước khi thuyền gần bờ."],"dung":0,"pinyin":"Wèile nín de ānquán, qǐng zài chuán shàng quánchéng chuānzhuó jiùshēngyī, bú yào bǎ shēntǐ tàn chū chuán wài.","nghia":"Vì an toàn, xin mặc áo phao suốt hành trình và đừng thò người ra ngoài thuyền.","giai_thich":"全程穿着救生衣 = mặc áo phao suốt chuyến; 探出船外 = thò ra ngoài thuyền."}];
window.__PROTO3D = window.__PROTO3D || {};
window.__PROTO3D.CAU_HOI_V7 = CAU_HOI_V7;


const FALLBACK_Q = CAU_HOI_V7; // alias

function normalizeV7(raw) {
  return {
    id: raw.id || '',
    chang: raw.chang || '',
    ngon_ngu: raw.ngon_ngu || 'zh',
    do_kho: raw.do_kho || 1,
    loai: raw.loai || '',
    type: raw.type === 'audio' ? 'audio' : 'text',
    distractor_group: raw.distractor_group || '',
    cau_hoi: raw.cau_hoi || '',
    chu_han: raw.chu_han || '',
    am_thanh: raw.am_thanh || '',
    dap_an: (raw.dap_an || []).slice(),
    dung: raw.dung != null ? raw.dung : 0,
    pinyin: raw.pinyin || '',
    nghia: raw.nghia || '',
    giai_thich: raw.giai_thich || ''
  };
}

/** Stage pool: stage1 ~70/30 text/audio; stage3 true 50/50 no reuse. */
function buildStagePool(stage = 1) {
  const all = questions.length ? questions : CAU_HOI_V7.map(normalizeV7);
  const text = all.filter(q => q.type === 'text');
  const audio = all.filter(q => q.type === 'audio');
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  if (stage >= 3) {
    const a = shuffle(audio);
    const t = shuffle(text);
    const n = Math.min(t.length, a.length); // equal count, each id once
    const mix = [];
    for (let i = 0; i < n; i++) { mix.push(t[i], a[i]); }
    return shuffle(mix);
  }
  // stage 1: ~70% text / 30% audio from unique ids
  const wantAudio = Math.min(audio.length, Math.max(1, Math.round((text.length + audio.length) * 0.3)));
  return shuffle(text.concat(shuffle(audio).slice(0, wantAudio)));
}

window.__PROTO3D.buildStagePool = buildStagePool;
async function loadQuestions() {
  // Prefer embedded (single-file). Optional external override if present.
  try {
    const r = await fetch('cau_hoi_v7.json', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        questions = data.map(normalizeV7);
        window.__PROTO3D.questions = questions;
        console.info('[B3] external cau_hoi_v7.json', questions.length);
        return questions;
      }
    }
  } catch (_) {}
  questions = CAU_HOI_V7.map(normalizeV7);
  window.__PROTO3D.questions = questions;
  console.info('[B3] embedded CAU_HOI_V7', questions.length);
  return questions;
}

function pickQuestion(mode) {
  if (!questions.length) questions = CAU_HOI_V7.map(normalizeV7);
  let pool = questions;
  if (mode === 'ult') pool = questions.filter(q => +q.do_kho >= 3);
  else if (mode === 'riddle') pool = questions.filter(q => q.loai === 'do_vui' || +q.do_kho >= 2 || (q.cau_hoi && q.cau_hoi.length > 40));
  else if (mode === 'mana') pool = questions.filter(q => +q.do_kho <= 2);
  if (!pool.length) pool = questions;
  const q = pool[qIndex % pool.length];
  qIndex++;
  return q;
}

function hideQuestionCard(cb) {
  const panel = document.getElementById('qPanel');
  panel.classList.remove('show');
  panel.classList.add('hide-out');
  const done = () => {
    panel.classList.remove('hide-out');
    panel.style.visibility = 'hidden';
    combat.locked = false;
    setPaused(false);
    if (cb) cb();
  };
  setTimeout(done, 380);
}

function openQuestion(mode = 'talk') {
  if (cinematic.on) return;
  if (!questions.length) questions = CAU_HOI_V7.map(normalizeV7);
  combat.qMode = mode || 'talk';
  const q = pickQuestion(combat.qMode);
  const panel = document.getElementById('qPanel');
  const opts = document.getElementById('qOpts');
  const rev = document.getElementById('qReveal');
  const badge = document.getElementById('qBadge');
  const pyEl = document.getElementById('qPy');
  rev.classList.remove('on'); rev.innerHTML = '';
  combat.qStart = performance.now();
  combat.locked = false;
  setPaused(true);
  const labels = { mana: '💙 Hồi nội năng', ult: '⚡ Ultimate · HARD', riddle: '🧩 Câu đố đường', talk: '答题 · Trả lời' };
  if (badge) badge.textContent = labels[combat.qMode] || labels.talk;
  const isAudio = q.type === 'audio';
  document.getElementById('qZh').textContent = isAudio ? '🔊' : (q.chu_han || '');
  pyEl.textContent = q.pinyin || '';
  /* B8: hide pinyin for audio when TTS will work; show only as fallback */
  pyEl.style.display = (isAudio ? 'none' : '');
  document.getElementById('qHint').textContent = q.cau_hoi || (isAudio ? 'Nghe và chọn đáp án' : 'Chọn nghĩa đúng');
  opts.innerHTML = '';
  const n = q.dap_an.length;
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((orig) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = q.dap_an[orig];
    b.dataset.orig = String(orig);
    b.onclick = () => {
      if (performance.now() < inputLockUntil || combat.locked) return;
      inputLockUntil = performance.now() + 280;
      const ok = orig === q.dung;
      [...opts.querySelectorAll('button')].forEach(btn => {
        if (+btn.dataset.orig === q.dung) btn.style.background = '#5dffb0';
      });
      if (!ok) b.style.background = '#ff7a6e';
      const elapsed = (performance.now() - combat.qStart) / 1000;
      rev.innerHTML = '<b>' + (ok ? '✓ Đúng' : '✗ Sai') + '</b> · ' +
        ((isAudio ? (q.chu_han || q.am_thanh) : q.chu_han) || '') + '<br><i>' + (q.pinyin || '') + '</i><br>' +
        '<span>' + (q.nghia || '') + '</span><br><small>' + (q.giai_thich || '') + '</small>';
      rev.classList.add('on');
      const result = applyAnswer(ok, elapsed);
      combat.locked = true;
      setTimeout(() => {
        hideQuestionCard(() => {
          if (result && result.after === 'ult') {
            /* card fully gone THEN cinematic */
            setTimeout(() => playUltimateCinematic(), 120);
          }
        });
      }, 900);
    };
    opts.appendChild(b);
  });
  panel.classList.remove('hide-out');
  panel.style.visibility = 'visible';
  requestAnimationFrame(() => panel.classList.add('show'));
  if (isAudio) {
    const spoke = speakZh(q.am_thanh || q.chu_han, pyEl);
    if (spoke) {
      document.getElementById('qZh').textContent = '🔊';
      pyEl.textContent = '';
      pyEl.style.display = 'none';
      const hint = document.getElementById('qHint');
      hint.textContent = '';
      hint.appendChild(document.createTextNode((q.cau_hoi || 'Nghe và chọn đáp án') + ' · '));
      const rb = document.createElement('button');
      rb.type = 'button'; rb.id = 'qReplay';
      rb.textContent = 'Nghe lại';
      rb.style.cssText = 'pointer-events:auto;margin-left:6px;border:2px solid #16171B;border-radius:8px;background:#FFD91F;font-weight:800;padding:4px 8px';
      rb.onclick = (e) => { e.preventDefault(); speakZh(q.am_thanh || q.chu_han, null); };
      hint.appendChild(rb);
    } else {
      document.getElementById('qZh').textContent = q.chu_han || q.am_thanh || '…';
      pyEl.textContent = q.pinyin || '';
      pyEl.style.display = '';
      document.getElementById('qHint').textContent = (q.cau_hoi || 'Chọn đáp án') + ' · (không có giọng zh — hiện pinyin)';
    }
  }
  sfx('ui');
}

function bindInput() {
  const stickZone = document.getElementById('stickZone');
  const lookZone = document.getElementById('lookZone');

  function joyStart(x, y, id) {
    joy.active = true; joy.id = id;
    stickBase.style.display = 'block';
    const r = stickBase.getBoundingClientRect();
    joy.ox = r.left + r.width / 2; joy.oy = r.top + r.height / 2;
    joyMove(x, y);
  }
  function joyMove(x, y) {
    if (!joy.active) return;
    const dx = x - joy.ox, dy = y - joy.oy;
    const len = Math.hypot(dx, dy), max = CFG.joyRadius;
    const nx = len > max ? dx / len * max : dx;
    const ny = len > max ? dy / len * max : dy;
    stickKnob.style.left = (60 + nx) + 'px';
    stickKnob.style.top = (60 + ny) + 'px';
    let jx = nx / max, jy = ny / max;
    const mag = Math.hypot(jx, jy);
    if (mag < CFG.joyDead) { joy.x = 0; joy.y = 0; }
    else {
      const s = (mag - CFG.joyDead) / (1 - CFG.joyDead);
      joy.x = (jx / mag) * s; joy.y = (jy / mag) * s;
    }
  }
  function joyEnd() {
    joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
    stickKnob.style.left = '60px'; stickKnob.style.top = '60px';
    stickBase.style.display = 'none';
  }

  stickZone.addEventListener('pointerdown', e => { stickZone.setPointerCapture(e.pointerId); joyStart(e.clientX, e.clientY, e.pointerId); });
  stickZone.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e.clientX, e.clientY); });
  stickZone.addEventListener('pointerup', e => { if (e.pointerId === joy.id) joyEnd(); });
  stickZone.addEventListener('pointercancel', e => { if (e.pointerId === joy.id) joyEnd(); });

  lookZone.addEventListener('pointerdown', e => {
    lookZone.setPointerCapture(e.pointerId);
    look.active = true; look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
  });
  lookZone.addEventListener('pointermove', e => {
    if (!look.active || e.pointerId !== look.id) return;
    const dx = e.clientX - look.lx, dy = e.clientY - look.ly;
    look.lx = e.clientX; look.ly = e.clientY;
    orbit.theta -= dx * 0.005;
    orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.004, CFG.camPolarMin, CFG.camPolarMax);
  });
  lookZone.addEventListener('pointerup', e => { if (e.pointerId === look.id) { look.active = false; look.id = null; } });
  lookZone.addEventListener('pointercancel', e => { if (e.pointerId === look.id) { look.active = false; look.id = null; } });

  let pinch = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1];
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), dist: orbit.dist };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      const a = e.touches[0], b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      orbit.dist = THREE.MathUtils.clamp(pinch.dist * (pinch.d / d), CFG.camDistMin, CFG.camDistMax);
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinch = null; }, { passive: true });

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyQ') openQuestion(combat.stage === 'road' ? 'riddle' : 'talk');
    if (e.code === 'KeyE') castBasic();
    if (e.code === 'Digit1') castSkill(0);
    if (e.code === 'Digit2') castSkill(1);
    if (e.code === 'Digit3') castSkill(2);
    if (e.code === 'KeyR') requestUltimate();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  let md = false;
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && e.clientX > innerWidth / 2) { md = true; look.lx = e.clientX; look.ly = e.clientY; }
  });
  addEventListener('mouseup', () => { md = false; });
  addEventListener('mousemove', e => {
    if (!md) return;
    const dx = e.clientX - look.lx, dy = e.clientY - look.ly;
    look.lx = e.clientX; look.ly = e.clientY;
    orbit.theta -= dx * 0.005;
    orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.004, CFG.camPolarMin, CFG.camPolarMax);
  });
  canvas.addEventListener('wheel', e => {
    orbit.dist = THREE.MathUtils.clamp(orbit.dist + e.deltaY * 0.01, CFG.camDistMin, CFG.camDistMax);
  }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
  });

  /* tap near NPC/hero to open question (B3 interact ≤3m) */
  lookZone.addEventListener('click', e => {
    if (performance.now() < inputLockUntil) return;
    /* simple: double-purpose — if nearly idle click opens Q */
    if (Math.hypot(joy.x, joy.y) < 0.05) {
      /* ignore — skill button / Q key preferred for now */
    }
  });
}

function updateHero(dt) {
  let mx = joy.x, mz = joy.y;
  if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const sin = Math.sin(orbit.theta), cos = Math.cos(orbit.theta);
  move.set(mx * cos + mz * sin, 0, -mx * sin + mz * cos);
  if (len > 0.01) {
    hero.position.x += move.x * CFG.moveSpeed * dt;
    hero.position.z += move.z * CFG.moveSpeed * dt;
    hero.position.x = THREE.MathUtils.clamp(hero.position.x, -80, 80);
    hero.position.z = THREE.MathUtils.clamp(hero.position.z, -80, 80);
    hero.rotation.y = Math.atan2(move.x, move.z);
    const baseY = hero.userData.deckY != null ? hero.userData.deckY : 1.06;
    if (usingProceduralHero) {
      hero.userData.bob += dt * 10;
      hero.position.y = baseY + Math.abs(Math.sin(hero.userData.bob)) * 0.08;
    } else hero.position.y = baseY;
    /* arena: islet + approach corridor toward boss (-Z) */
    hero.position.x = THREE.MathUtils.clamp(hero.position.x, -3.2, 3.2);
    hero.position.z = THREE.MathUtils.clamp(hero.position.z, -9.5, 1.6);
    if (heroAnimState !== 'attack') playHeroAnim('run');
  } else {
    hero.position.y = hero.userData.deckY != null ? hero.userData.deckY : 1.06;
    if (heroAnimState !== 'attack') playHeroAnim('idle');
  }

  /* subtle parallax on far layer */
  if (layers.far) {
    layers.far.position.x = hero.position.x * 0.08;
    layers.far.position.z = hero.position.z * 0.08;
  }
  if (layers.mid) {
    layers.mid.position.x = hero.position.x * 0.03;
    layers.mid.position.z = hero.position.z * 0.03;
  }
}

function updateCamera() {
  if (!hero || !camera) return;
  const hx = hero.position.x, hy = hero.position.y, hz = hero.position.z;
  const yaw = hero.rotation.y + orbit.theta;
  const dist = THREE.MathUtils.clamp(orbit.dist, CFG.camDistMin, CFG.camDistMax);
  const pitch = THREE.MathUtils.clamp(orbit.phi, CFG.camPolarMin, CFG.camPolarMax);
  /* Three.js Ry: local +Z → (sin(y), 0, cos(y)). Hero faces -Z (y=PI). */
  const fX = Math.sin(yaw), fZ = Math.cos(yaw);
  const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
  const back = Math.sin(pitch);
  const lift = Math.cos(pitch);
  let idealX = hx - fX * dist * back + rX * CFG.camShoulder;
  let idealY = hy + CFG.camHeight + dist * lift * 0.2;
  let idealZ = hz - fZ * dist * back + rZ * CFG.camShoulder;
  idealY = Math.max(idealY, hy + 2.8);

  _camFrom.set(hx, hy + 1.4, hz);
  _camTo.set(idealX, idealY, idealZ);
  _camDir.copy(_camTo).sub(_camFrom);
  let dlen = _camDir.length() || 0.001;
  _camDir.multiplyScalar(1 / dlen);
  _camRay.set(_camFrom, _camDir);
  _camRay.far = dlen;
  let finalDist = dlen;
  if (colliders.length) {
    const hits = _camRay.intersectObjects(colliders, true);
    if (hits.length && hits[0].distance < dlen) {
      finalDist = Math.max(5.2, hits[0].distance - 0.55);
    }
  }
  camera.position.copy(_camFrom).addScaledVector(_camDir, finalDist);
  if (camera.position.y < hy + 2.7) camera.position.y = hy + 2.7;
  /* Look AHEAD along facing (toward boss). Bias so hero sits slightly left. */
  const lookDist = 9.0;
  const lookX = hx + fX * lookDist - rX * 0.55;
  const lookZ = hz + fZ * lookDist - rZ * 0.55;
  camera.lookAt(lookX, hy + CFG.camLookY, lookZ);
}

const fpsBuf = new Float32Array(90);
let fpsBufI = 0, fpsBufFilled = 0;
function loop() {
  requestAnimationFrame(loop);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * (cinematic.on ? gameTimeScale : (combat.paused ? 0.05 : 1));
  if (water && water.visible && water.material && water.material.uniforms && water.material.uniforms.time) {
    water.material.uniforms.time.value += rawDt;
  }
  /* cooldowns always tick in real time */
  const cdt = rawDt;
  cds.atk = Math.max(0, cds.atk - cdt);
  cds.s1 = Math.max(0, cds.s1 - cdt);
  cds.s2 = Math.max(0, cds.s2 - cdt);
  cds.s3 = Math.max(0, cds.s3 - cdt);

  if (!combat.paused && !cinematic.on) updateHero(dt);
  if (mixerHero) mixerHero.update(dt);
  if (mixerBoss) mixerBoss.update(dt);
  updateBossAI(dt);
  updateCinematic(rawDt);
  updateParticles(rawDt);
  if (window.__PROTO3D.skyMesh?.userData?.skyMat?.uniforms?.time)
    window.__PROTO3D.skyMesh.userData.skyMat.uniforms.time.value += rawDt * 0.5;
  updateCamera();
  if (shakeT > 0) {
    shakeT -= rawDt;
    const a = shakeAmp * Math.max(0, shakeT / 0.28);
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a * 0.6;
    if (shakeT <= 0) shakeAmp = 0;
  }
  if (composer && quality.bloom) composer.render();
  else renderer.render(scene, camera);

  const f = rawDt > 0 ? 1 / rawDt : 0;
  fpsBuf[fpsBufI] = f;
  fpsBufI = (fpsBufI + 1) % fpsBuf.length;
  if (fpsBufFilled < fpsBuf.length) fpsBufFilled++;
  let sum = 0, minv = 1e9;
  const tmp = [];
  for (let i = 0; i < fpsBufFilled; i++) { sum += fpsBuf[i]; tmp.push(fpsBuf[i]); }
  const avg = sum / fpsBufFilled;
  tmp.sort((a, b) => a - b);
  const p5 = tmp[Math.max(0, Math.floor(tmp.length * 0.05))] || 0;
  window.__PROTO3D.fps = f;
  window.__PROTO3D.avgFps = avg;
  window.__PROTO3D.p5 = p5;
  if (FPS_DBG && fpsTimed) {
    const now = performance.now();
    fpsTimed.push(now, f);
    /* prune older than 10s (pairs of now,f) */
    const cut = now - 10000;
    let i0 = 0;
    while (i0 < fpsTimed.length && fpsTimed[i0] < cut) i0 += 2;
    if (i0) fpsTimed.splice(0, i0);
  }
  if ((performance.now() / 250 | 0) !== loop._hud) {
    loop._hud = performance.now() / 250 | 0;
    if (!FPS_DBG && fpsEl) fpsEl.textContent = `FPS ${f.toFixed(0)} · avg ${avg.toFixed(0)} · p5 ${p5.toFixed(0)}`;
    if (FPS_DBG && fpsDbgEl && fpsTimed) {
      const now = performance.now();
      let sum5 = 0, n5 = 0;
      const win10 = [];
      const t5 = now - 5000;
      for (let i = 0; i < fpsTimed.length; i += 2) {
        const ts = fpsTimed[i], fv = fpsTimed[i + 1];
        if (ts >= t5) { sum5 += fv; n5++; }
        win10.push(fv);
      }
      const avg5 = n5 ? sum5 / n5 : avg;
      win10.sort((a, b) => a - b);
      const p5_10 = win10.length ? win10[Math.max(0, Math.floor(win10.length * 0.05))] : p5;
      const tier = quality.level >= 2 ? 'HQ' : quality.level === 1 ? 'MID' : 'LOW';
      const pr = quality.pixelRatio;
      const dw = Math.round(innerWidth);
      const dh = Math.round(innerHeight);
      const dpr = devicePixelRatio || 1;
      fpsDbgEl.textContent =
        `FPS ${f.toFixed(0)}\n` +
        `avg5s ${avg5.toFixed(1)}\n` +
        `p5·10s ${p5_10.toFixed(1)}\n` +
        `${tier}  PR ${pr}\n` +
        `${dw}×${dh} @${dpr}`;
    }
    syncCdUI();
  }
  /* target >=30: drop HQ→MID→LOW */
  if (fpsBufFilled > 40) {
    const needDrop = !quality.locked && ((quality.level >= 2 && (avg < 34 || p5 < 26))
      || (quality.level === 1 && (avg < 28 || p5 < 24)));
    if (needDrop) {
      lowFpsAcc += rawDt * 1000;
      if (!quality.locked && lowFpsAcc >= CFG.lowFpsMs && quality.level > 0) {
        const next = quality.level - 1;
        if (REC_MODE && next < 1) { lowFpsAcc = 0; }
        else {
          applyQuality(next);
          lowFpsAcc = 0;
          console.info('[B8] quality ↓', quality.level, 'avg', avg.toFixed(0), 'p5', p5.toFixed(0));
        }
      }
    } else lowFpsAcc = Math.max(0, lowFpsAcc - rawDt * 500);
  }
}

init();
