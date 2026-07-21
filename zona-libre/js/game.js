import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [1, 2, 5, 10, 15, 20];
  const viewEl = document.getElementById('view3d');
  const loadBanner = document.getElementById('loadBanner');

  const els = {
    credits: document.getElementById('credits'),
    bet: document.getElementById('bet'),
    level: document.getElementById('level'),
    prize: document.getElementById('prize'),
    won: document.getElementById('won'),
    hint: document.getElementById('hint'),
    machineLabel: document.getElementById('machineLabel'),
    zoneTimer: document.getElementById('zoneTimer'),
    aliveCount: document.getElementById('aliveCount'),
    killCount: document.getElementById('killCount'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    ammoText: document.getElementById('ammoText'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    startBtn: document.getElementById('startBtn'),
    actionBtn: document.getElementById('actionBtn'),
    restartBtn: document.getElementById('restartBtn'),
    menuBtn: document.getElementById('menuBtn'),
    betDown: document.getElementById('betDown'),
    betUp: document.getElementById('betUp'),
    fireBtn: document.getElementById('fireBtn'),
    sprintBtn: document.getElementById('sprintBtn'),
    weaponBtn: document.getElementById('weaponBtn'),
    weaponName: document.getElementById('weaponName'),
    joystick: document.getElementById('joystick'),
    joyKnob: document.getElementById('joyKnob'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toastTitle'),
    toastText: document.getElementById('toastText'),
    compass: document.getElementById('compass'),
  };

  const WEAPONS = [
    { id: 'rifle', name: 'ASALTO', dmg: 18, cd: 0.13, speed: 30, mag: 30, reserve: 120, reload: 1.05, spread: 0.01, pellets: 1 },
    { id: 'smg', name: 'RÁFAGA', dmg: 9, cd: 0.065, speed: 27, mag: 40, reserve: 160, reload: 0.95, spread: 0.045, pellets: 1 },
    { id: 'shotgun', name: 'ESCOPETA', dmg: 11, cd: 0.55, speed: 22, mag: 8, reserve: 32, reload: 1.35, spread: 0.14, pellets: 6 },
  ];
  let weaponIndex = 0;

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let session = null;
  let missionEnded = false;
  let assetsReady = false;

  const keys = Object.create(null);
  const input = { x: 0, y: 0, firing: false, sprint: false };
  let joyActive = false;
  let brickTex = null;
  let grassTex = null;
  const texLoader = new THREE.TextureLoader();
  texLoader.load('assets/textures/brick.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    brickTex = t;
  });
  texLoader.load('assets/textures/grass.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    grassTex = t;
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7eb6d9);
  scene.fog = new THREE.FogExp2(0xa8cce0, 0.016);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewEl.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x3d5a28, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
  sun.position.set(22, 34, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88ccff, 0.35);
  fill.position.set(-18, 10, -12);
  scene.add(fill);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  let composer;
  let bloomPass;
  function setupComposer() {
    const w = viewEl.clientWidth || 960;
    const h = viewEl.clientHeight || Math.round(w * 9 / 16);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.7, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  setupComposer();

  const soldierTemplate = { scene: null, animations: [] };
  const mixers = [];

  const world = {
    running: false,
    mapSize: 42,
    player: null,
    enemies: [],
    bullets: [],
    buildings: [],
    barrels: [],
    zoneMesh: null,
    kills: 0,
    ammo: 30,
    reserve: 120,
    reloadT: 0,
    weaponIndex: 0,
    zoneR: 18,
    zoneMax: 45,
    zoneT: 0,
    aimAssist: 0.25,
    enemyDmg: 8,
    startedAt: 0,
    clock: new THREE.Clock(),
  };

  function currentWeapon() {
    return WEAPONS[world.weaponIndex] || WEAPONS[0];
  }

  function setWeapon(i, silent) {
    world.weaponIndex = ((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    weaponIndex = world.weaponIndex;
    const w = currentWeapon();
    if (world.running) {
      world.ammo = w.mag;
      world.reserve = Math.max(world.reserve, w.reserve);
      world.reloadT = 0;
    }
    if (els.weaponName) els.weaponName.textContent = w.name;
    if (!silent) showToast('Arma', w.name, null);
    refreshHud();
  }

  function cycleWeapon() {
    setWeapon(world.weaponIndex + 1);
  }

  function mxn(n) {
    return isPlayerMode ? PlayerAuth.formatPesos(n) : MachineAPI.formatPesos(n);
  }
  function bet() { return BETS[betIndex]; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function showToast(title, text, ok) {
    els.toastTitle.textContent = title;
    els.toastText.textContent = text;
    els.toast.style.borderColor = ok ? '#b8f000' : ok === false ? '#ff4d4d' : '#4de2ff';
    els.toast.classList.remove('hidden');
    setTimeout(() => els.toast.classList.add('hidden'), 2800);
  }

  function resize() {
    const w = viewEl.clientWidth || 960;
    const h = viewEl.clientHeight || Math.round(w * 9 / 16);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloomPass?.resolution.set(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  function makeGroundTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#4a6b38';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4200; i++) {
      g.fillStyle = 'rgba(' + (50 + Math.random() * 40) + ',' + (90 + Math.random() * 50) + ',' + (30 + Math.random() * 30) + ',' + (0.15 + Math.random() * 0.35) + ')';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function tintSoldier(root, hex) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, i) => {
        const clone = m.clone();
        if (clone.color) {
          const c = new THREE.Color(hex);
          clone.color.lerp(c, 0.35);
        }
        if (Array.isArray(o.material)) o.material[i] = clone;
        else o.material = clone;
      });
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  function createSoldierActor(tintHex) {
    if (!soldierTemplate.scene) return null;
    const root = SkeletonUtils.clone(soldierTemplate.scene);
    root.scale.setScalar(1.05);
    if (tintHex) tintSoldier(root, tintHex);
    else {
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    soldierTemplate.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      actions[clip.name] = action;
    });
    const idle = actions.Idle || actions.idle || Object.values(actions)[0];
    const walk = actions.Walk || actions.walk || actions.Run || idle;
    const run = actions.Run || actions.run || walk;
    if (idle) {
      idle.play();
      idle.setLoop(THREE.LoopRepeat);
    }
    if (walk) walk.setLoop(THREE.LoopRepeat);
    if (run) run.setLoop(THREE.LoopRepeat);

    const hpBar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x6dff7a, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    hpBar.position.y = 2.15;
    root.add(hpBar);

    mixers.push(mixer);
    return {
      root,
      mixer,
      actions: { idle, walk, run },
      current: 'idle',
      hpBar,
    };
  }

  function setAnim(actor, name) {
    if (!actor || actor.current === name) return;
    const next = actor.actions[name];
    const prev = actor.actions[actor.current];
    if (!next) return;
    next.reset().fadeIn(0.18).play();
    if (prev && prev !== next) prev.fadeOut(0.18);
    actor.current = name;
  }

  function clearWorld() {
    while (mixers.length) mixers.pop();
    while (worldRoot.children.length) {
      const c = worldRoot.children[0];
      worldRoot.remove(c);
    }
    world.player = null;
    world.enemies = [];
    world.bullets = [];
    world.buildings = [];
    world.barrels = [];
    world.zoneMesh = null;
  }

  function blocked(x, z, r) {
    for (const b of world.buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  function makeFacadeTexture(baseHex, accentHex) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = baseHex;
    g.fillRect(0, 0, 512, 512);
    // mortar / panel lines
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let y = 0; y < 512; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    for (let x = 0; x < 512; x += 64) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
    }
    // windows
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 6; col++) {
        const lit = Math.random() > 0.35;
        g.fillStyle = lit ? accentHex : '#1a2430';
        const wx = 28 + col * 80;
        const wy = 28 + row * 68;
        g.fillRect(wx, wy, 44, 38);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(wx + 2, wy + 2, 16, 10);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.strokeRect(wx, wy, 44, 38);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function addRealBuilding(x, z, w, d, floors, style) {
    const h = floors * 2.55 + 0.8;
    const facade = makeFacadeTexture(style.base, style.win);
    facade.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, floors));
    const wallMat = new THREE.MeshStandardMaterial({
      map: brickTex ? brickTex.clone() : facade,
      color: brickTex ? style.tint : 0xffffff,
      roughness: 0.78,
      metalness: 0.05,
    });
    if (brickTex) {
      wallMat.map.repeat.set(w * 0.55, h * 0.45);
      wallMat.map.needsUpdate = true;
    } else {
      wallMat.map = facade;
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.set(x, h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    worldRoot.add(body);

    // glass strip facade
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9ad8ff,
      emissive: 0x1a4a66,
      emissiveIntensity: 0.45,
      metalness: 0.55,
      roughness: 0.12,
      transparent: true,
      opacity: 0.85,
    });
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < Math.max(2, Math.floor(w / 1.6)); i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), glassMat);
        win.position.set(x - w / 2 + 1.1 + i * 1.55, 1.35 + f * 2.55, z + d / 2 + 0.04);
        worldRoot.add(win);
        const winB = win.clone();
        winB.position.z = z - d / 2 - 0.04;
        winB.rotation.y = Math.PI;
        worldRoot.add(winB);
      }
    }

    // roof parapet + AC units
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.9, metalness: 0.2 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.28, d + 0.25), roofMat);
    roof.position.set(x, h + 0.1, z);
    roof.castShadow = true;
    worldRoot.add(roof);
    for (let i = 0; i < 2; i++) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.55),
        new THREE.MeshStandardMaterial({ color: 0xb0b8c0, metalness: 0.6, roughness: 0.35 })
      );
      ac.position.set(x - w * 0.25 + i * w * 0.45, h + 0.45, z - d * 0.15);
      worldRoot.add(ac);
    }

    // entrance
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7, metalness: 0.15 })
    );
    door.position.set(x, 1.05, z + d / 2 + 0.08);
    worldRoot.add(door);

    // balcony ledge mid floor
    if (floors >= 3) {
      const balc = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.12, 0.55),
        new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.6, metalness: 0.1 })
      );
      balc.position.set(x, 2.55 * 2, z + d / 2 + 0.28);
      worldRoot.add(balc);
    }

    world.buildings.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  function buildArena(mapSize) {
    const groundMat = new THREE.MeshStandardMaterial({
      map: grassTex || makeGroundTexture(),
      roughness: 0.92,
      metalness: 0.02,
      color: grassTex ? 0xffffff : 0xffffff,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(mapSize + 14, mapSize + 14), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    worldRoot.add(ground);

    // asphalt roads
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.95, metalness: 0.05 });
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(mapSize + 4, 4.2), roadMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.y = 0.02;
    worldRoot.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(4.2, mapSize + 4), roadMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.y = 0.025;
    worldRoot.add(roadZ);

    const styles = [
      { base: '#c4b7a6', win: '#ffe7a0', tint: 0xd8cfc0 },
      { base: '#9aa7b5', win: '#b8ecff', tint: 0xb8c2cc },
      { base: '#b59a88', win: '#fff1c2', tint: 0xc4a892 },
      { base: '#8f9aa8', win: '#9fe0ff', tint: 0xa8b0bc },
    ];
    const layout = [
      { x: -14, z: -12, w: 7.5, d: 6, floors: 4, s: 0 },
      { x: 14, z: -12, w: 8, d: 6.5, floors: 5, s: 1 },
      { x: -14, z: 12, w: 7, d: 6, floors: 3, s: 2 },
      { x: 14, z: 12, w: 7.2, d: 5.8, floors: 4, s: 3 },
      { x: -2, z: -16, w: 5.5, d: 4.8, floors: 3, s: 1 },
      { x: 2, z: 16, w: 6, d: 5, floors: 4, s: 0 },
    ];
    layout.forEach((b) => addRealBuilding(b.x, b.z, b.w, b.d, b.floors, styles[b.s]));

    for (let i = 0; i < 12; i++) {
      const tx = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      const tz = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      if (blocked(tx, tz, 1.2) || Math.hypot(tx, tz) < 7) continue;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 })
      );
      trunk.position.set(tx, 0.6, tz);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x3d7a3a, roughness: 0.85 })
      );
      leaves.position.set(tx, 1.7, tz);
      leaves.castShadow = true;
      worldRoot.add(trunk, leaves);
    }

    for (let i = 0; i < 7; i++) {
      const bx = rand(-mapSize / 2 + 3, mapSize / 2 - 3);
      const bz = rand(-mapSize / 2 + 3, mapSize / 2 - 3);
      if (blocked(bx, bz, 0.6)) continue;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 0.9, 16),
        new THREE.MeshStandardMaterial({ color: 0xc62828, metalness: 0.45, roughness: 0.35, emissive: 0x401010, emissiveIntensity: 0.25 })
      );
      barrel.position.set(bx, 0.45, bz);
      barrel.castShadow = true;
      worldRoot.add(barrel);
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 16),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(bx, 0.92, bz);
      worldRoot.add(mark);
      world.barrels.push({ mesh: barrel, mark, x: bx, z: bz, r: 0.55, hp: 30 });
    }

    const zoneGeo = new THREE.RingGeometry(17.2, 18, 96);
    const zoneMat = new THREE.MeshBasicMaterial({
      color: 0x5ef0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
    });
    world.zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    world.zoneMesh.rotation.x = -Math.PI / 2;
    world.zoneMesh.position.y = 0.06;
    worldRoot.add(world.zoneMesh);
  }

  function spawnMission(data) {
    clearWorld();
    world.mapSize = 42;
    world.aimAssist = data.aimAssist || 0.2;
    world.enemyDmg = data.enemyDmg || 8;
    world.zoneMax = data.zoneSeconds || 45;
    world.zoneT = 0;
    world.zoneR = 18;
    world.kills = 0;
    world.weaponIndex = weaponIndex;
    const wpn = currentWeapon();
    world.ammo = wpn.mag;
    world.reserve = wpn.reserve;
    world.reloadT = 0;
    if (els.weaponName) els.weaponName.textContent = wpn.name;
    world.startedAt = performance.now();
    missionEnded = false;
    buildArena(world.mapSize);

    const half = world.mapSize / 2 - 2;
    const pActor = createSoldierActor(null);
    pActor.root.position.set(0, 0, 6);
    worldRoot.add(pActor.root);
    world.player = {
      ...pActor,
      x: 0, z: 6, r: 0.45,
      hp: data.playerHp,
      maxHp: data.playerMaxHp,
      angle: Math.PI,
      walkSpeed: 7.5,
      runSpeed: 13.5,
      shootCd: 0,
      moving: false,
      sprinting: false,
    };

    world.enemies = [];
    const n = data.enemies || 4;
    const tints = [0xc45c26, 0x8a2f2f, 0x3d5a80, 0x5a3d7a];
    for (let i = 0; i < n; i++) {
      let x; let z; let tries = 0;
      do {
        x = rand(-half, half);
        z = rand(-half, half);
        tries += 1;
      } while ((Math.hypot(x - world.player.x, z - world.player.z) < 8 || blocked(x, z, 0.5)) && tries < 50);

      const eActor = createSoldierActor(tints[i % tints.length]);
      eActor.root.position.set(x, 0, z);
      worldRoot.add(eActor.root);
      world.enemies.push({
        ...eActor,
        x, z, r: 0.45,
        hp: data.enemyHp,
        maxHp: data.enemyHp,
        angle: 0,
        speed: 3.2 + data.level * 0.12,
        shootCd: rand(0.5, 1.3),
        strafe: Math.random() < 0.5 ? 1 : -1,
      });
    }

    world.running = true;
    els.hint.textContent = `Nivel ${data.level}: elimina ${n} rivales GLB · premio ${mxn(data.prize)}`;
  }

  function nearestEnemy(from) {
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - from.x, e.z - from.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireBullet(owner, ally, dmg, speed, yawOffset) {
    const yaw = owner.angle + (yawOffset || 0);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(ally ? 0.06 : 0.07, 8, 8),
      new THREE.MeshStandardMaterial({
        color: ally ? 0xd4ff4d : 0xff8a1e,
        emissive: ally ? 0xa0ff20 : 0xff5500,
        emissiveIntensity: 2.2,
        toneMapped: false,
      })
    );
    mesh.position.set(owner.x + dir.x * 0.85, 1.4, owner.z + dir.z * 0.85);
    worldRoot.add(mesh);
    world.bullets.push({
      mesh,
      x: mesh.position.x,
      y: 1.4,
      z: mesh.position.z,
      vx: dir.x * speed,
      vz: dir.z * speed,
      ally,
      dmg,
      life: 1.15,
      r: 0.12,
    });
  }

  function firePlayerWeapon(p) {
    const w = currentWeapon();
    for (let i = 0; i < w.pellets; i++) {
      const spread = (Math.random() - 0.5) * w.spread * 2;
      fireBullet(p, true, w.dmg, w.speed, spread);
    }
  }

  function removeBullet(b) {
    worldRoot.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.material.dispose();
  }

  function syncActor(actor) {
    actor.root.position.x = actor.x;
    actor.root.position.z = actor.z;
    // Soldier.glb faces -Z; add PI so walk/run match movement direction
    actor.root.rotation.y = actor.angle + Math.PI;
    const pct = Math.max(0.01, actor.hp / actor.maxHp);
    actor.hpBar.scale.x = pct;
    actor.hpBar.material.color.setHex(pct > 0.45 ? 0x6dff7a : 0xff4d4d);
    actor.hpBar.quaternion.copy(camera.quaternion);
  }

  function updateZoneVisual() {
    if (!world.zoneMesh) return;
    const s = Math.max(0.15, world.zoneR / 18);
    world.zoneMesh.scale.set(s, s, s);
  }

  async function endMission(survived) {
    if (missionEnded || !session) return;
    missionEnded = true;
    world.running = false;
    busy = true;
    refreshHud();

    const elapsed = (performance.now() - world.startedAt) / 1000;
    try {
      const payload = {
        kills: world.kills,
        survived: !!survived && world.player && world.player.hp > 0,
        playerHp: Math.max(0, Math.ceil(world.player?.hp || 0)),
        elapsed,
      };
      const data = isPlayerMode
        ? await PlayerAuth.completeZonaLibre(session.sessionId, payload)
        : await MachineAPI.completeZonaLibre(session.sessionId, payload);

      credits = data.balance ?? credits;
      if (data.session) {
        session = {
          sessionId: data.session.sessionId,
          level: data.session.level,
          prize: data.session.prize,
          status: data.session.status,
          totalWon: data.session.totalWon || 0,
          enemies: data.session.enemies,
          playerHp: data.session.playerHp,
          playerMaxHp: data.session.playerMaxHp,
          enemyHp: data.session.enemyHp,
          enemyDmg: data.session.enemyDmg,
          zoneSeconds: data.session.zoneSeconds,
          aimAssist: data.session.aimAssist,
          mapSize: data.session.mapSize,
          killsRequired: data.session.killsRequired,
        };
      }

      if (data.won) {
        showToast(data.awarded > 0 ? '¡ZONA LIMPIA!' : 'Victoria', data.message, true);
        els.hint.textContent = data.awarded > 0
          ? `Premio cobrado. Pulsa SIGUIENTE (cuesta ${mxn(bet())}).`
          : 'Listo para el siguiente nivel.';
      } else {
        showToast('Eliminado', data.message, false);
        els.hint.textContent = 'REINTENTAR cobra otra apuesta · REINICIAR vuelve al nivel 1.';
      }
    } catch (err) {
      showToast('Error', err.message || 'No se pudo cerrar la misión', false);
      if (session) session.status = 'failed';
    } finally {
      busy = false;
      refreshHud();
    }
  }

  function update(dt) {
    if (!world.running || !world.player) return;
    const p = world.player;
    const half = world.mapSize / 2 - 0.8;

    let mx = 0;
    let mz = 0;
    if (keys.KeyW || keys.ArrowUp || keys.w || keys.arrowup) mz -= 1;
    if (keys.KeyS || keys.ArrowDown || keys.s || keys.arrowdown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft || keys.a || keys.arrowleft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight || keys.d || keys.arrowright) mx += 1;
    mx += input.x;
    mz += input.y;

    // Camera-relative movement (W = hacia donde mira la cámara)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    else forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    let wx = right.x * mx + forward.x * (-mz);
    let wz = right.z * mx + forward.z * (-mz);
    const mag = Math.hypot(wx, wz);
    if (mag > 1) { wx /= mag; wz /= mag; }

    const wantSprint = input.sprint || keys.ShiftLeft || keys.ShiftRight || keys.shift;
    p.sprinting = wantSprint && mag > 0.12;
    const speed = p.sprinting ? p.runSpeed : p.walkSpeed;
    if (els.sprintBtn) els.sprintBtn.classList.toggle('active', !!p.sprinting);

    let nx = p.x + wx * speed * dt;
    let nz = p.z + wz * speed * dt;
    nx = Math.max(-half, Math.min(half, nx));
    nz = Math.max(-half, Math.min(half, nz));
    if (!blocked(nx, p.z, p.r)) p.x = nx;
    if (!blocked(p.x, nz, p.r)) p.z = nz;

    p.moving = mag > 0.12;
    if (mag > 0.1) {
      p.angle = Math.atan2(wx, wz);
    }
    setAnim(p, p.moving ? (p.sprinting ? 'run' : 'walk') : 'idle');

    if (world.reloadT > 0) {
      world.reloadT -= dt;
      if (world.reloadT <= 0) {
        const w = currentWeapon();
        const need = w.mag - world.ammo;
        const take = Math.min(need, world.reserve);
        world.ammo += take;
        world.reserve -= take;
      }
    }

    p.shootCd = Math.max(0, p.shootCd - dt);
    const wantFire = input.firing || keys[' '] || keys.Space || keys.Enter || keys.enter;
    const wpn = currentWeapon();
    if (wantFire && p.shootCd <= 0 && world.reloadT <= 0) {
      if (world.ammo > 0) {
        world.ammo -= 1;
        p.shootCd = wpn.cd;
        firePlayerWeapon(p);
        if (world.ammo === 0 && world.reserve > 0) world.reloadT = wpn.reload;
      } else if (world.reserve > 0) world.reloadT = wpn.reload;
    }

    for (const e of world.enemies) {
      if (e.hp <= 0) {
        e.root.visible = false;
        continue;
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;

      let move = 0;
      if (dist > 9) move = 1;
      else if (dist < 5.5) move = -0.65;
      const sx = -dz / dist * e.strafe * 0.55;
      const sz = dx / dist * e.strafe * 0.55;
      const mvx = (dx / dist) * move + sx;
      const mvz = (dz / dist) * move + sz;
      let ex = e.x + mvx * e.speed * dt;
      let ez = e.z + mvz * e.speed * dt;
      ex = Math.max(-half, Math.min(half, ex));
      ez = Math.max(-half, Math.min(half, ez));
      if (!blocked(ex, e.z, e.r)) e.x = ex;
      if (!blocked(e.x, ez, e.r)) e.z = ez;

      // Face velocity when moving, face player when standing/shooting
      if (Math.hypot(mvx, mvz) > 0.08) e.angle = Math.atan2(mvx, mvz);
      else e.angle = Math.atan2(dx, dz);

      setAnim(e, Math.hypot(mvx, mvz) > 0.12 ? (Math.abs(move) > 0.8 ? 'run' : 'walk') : 'idle');

      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 16) {
        e.shootCd = rand(0.55, 1.1);
        fireBullet(e, false, world.enemyDmg, 20);
      }
      syncActor(e);
    }

    for (const b of world.bullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);

      if (blocked(b.x, b.z, b.r) || Math.abs(b.x) > half + 2 || Math.abs(b.z) > half + 2) {
        b.life = 0;
        continue;
      }

      for (const barrel of world.barrels) {
        if (barrel.hp <= 0) continue;
        if (Math.hypot(barrel.x - b.x, barrel.z - b.z) < barrel.r + b.r) {
          barrel.hp -= b.dmg;
          b.life = 0;
          if (barrel.hp <= 0) {
            barrel.mesh.visible = false;
            barrel.mark.visible = false;
            const victims = [world.player, ...world.enemies];
            for (const v of victims) {
              if (!v || v.hp <= 0) continue;
              if (Math.hypot(v.x - barrel.x, v.z - barrel.z) < 3.2) v.hp -= 28;
            }
          }
          break;
        }
      }

      if (b.ally) {
        for (const e of world.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - b.x, e.z - b.z) < e.r + b.r) {
            e.hp -= b.dmg;
            b.life = 0;
            if (e.hp <= 0) {
              world.kills += 1;
              e.root.visible = false;
            }
            break;
          }
        }
      } else if (world.player.hp > 0) {
        if (Math.hypot(world.player.x - b.x, world.player.z - b.z) < world.player.r + b.r) {
          world.player.hp -= b.dmg;
          b.life = 0;
        }
      }
    }
    world.bullets = world.bullets.filter((b) => {
      if (b.life > 0) return true;
      removeBullet(b);
      return false;
    });

    world.zoneT += dt;
    const zProg = Math.min(1, world.zoneT / world.zoneMax);
    world.zoneR = 18 * (1 - zProg) + 6 * zProg;
    updateZoneVisual();
    if (Math.hypot(p.x, p.z) > world.zoneR) p.hp -= 14 * dt;

    syncActor(p);

    const back = 7.8;
    const height = 4.4;
    const cx = p.x - Math.sin(p.angle) * back;
    const cz = p.z - Math.cos(p.angle) * back;
    camera.position.lerp(new THREE.Vector3(cx, height, cz), 1 - Math.pow(0.001, dt));
    camera.lookAt(p.x, 1.4, p.z);

    const heading = ((p.angle * 180) / Math.PI + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const di = Math.round(heading / 45) % 8;
    els.compass.textContent = dirs[(di + 7) % 8] + ' · ' + dirs[di] + ' · ' + dirs[(di + 1) % 8];

    if (p.hp <= 0) {
      p.hp = 0;
      endMission(false);
      return;
    }
    if (world.enemies.every((e) => e.hp <= 0)) endMission(true);

    refreshHud();
  }

  function idleCamera() {
    camera.position.set(8, 7, 12);
    camera.lookAt(0, 1, 0);
  }

  function loop() {
    const dt = Math.min(0.033, world.clock.getDelta());
    for (const m of mixers) m.update(dt);
    if (world.running) update(dt);
    else idleCamera();
    composer.render();
    requestAnimationFrame(loop);
  }

  function refreshHud() {
    els.credits.textContent = mxn(credits);
    els.bet.textContent = mxn(bet());
    els.level.textContent = session ? String(session.level) : '—';
    els.prize.textContent = mxn(session?.prize || 0);
    els.won.textContent = mxn(session?.totalWon || 0);
    if (els.machineLabel) {
      els.machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }
    els.restartBtn.disabled = !session || busy || world.running || !assetsReady;

    if (world.player) {
      const pct = Math.max(0, (world.player.hp / world.player.maxHp) * 100);
      els.hpFill.style.width = pct + '%';
      els.hpText.textContent = Math.ceil(world.player.hp) + '/' + world.player.maxHp;
    } else {
      els.hpFill.style.width = '100%';
      els.hpText.textContent = '—';
    }

    els.ammoText.textContent = world.ammo + '/' + world.reserve;
    if (els.weaponName) els.weaponName.textContent = currentWeapon().name;
    els.killCount.textContent = String(world.kills);
    const alive = (world.player && world.player.hp > 0 ? 1 : 0) + world.enemies.filter((e) => e.hp > 0).length;
    els.aliveCount.textContent = world.running ? String(alive) : '0';
    const left = Math.max(0, Math.ceil(world.zoneMax - world.zoneT));
    els.zoneTimer.textContent = world.running ? String(left).padStart(2, '0') + 's' : '—';

    if (!assetsReady) {
      els.actionBtn.textContent = 'CARGANDO…';
      els.actionBtn.disabled = true;
    } else if (!playing) {
      els.actionBtn.textContent = 'JUGAR';
      els.actionBtn.disabled = false;
    } else if (!session) {
      els.actionBtn.textContent = 'MISIÓN 1';
      els.actionBtn.disabled = busy;
    } else if (session.status === 'level_complete') {
      els.actionBtn.textContent = 'SIGUIENTE';
      els.actionBtn.disabled = busy || world.running;
    } else if (session.status === 'failed') {
      els.actionBtn.textContent = 'REINTENTAR';
      els.actionBtn.disabled = busy || world.running;
    } else if (world.running) {
      els.actionBtn.textContent = 'EN MISIÓN';
      els.actionBtn.disabled = true;
    } else {
      els.actionBtn.textContent = 'MISIÓN 1';
      els.actionBtn.disabled = busy;
    }
  }

  async function loadBalance() {
    if (isPlayerMode) {
      if (els.menuBtn) {
        els.menuBtn.href = '/portal/';
        els.menuBtn.textContent = '← Portal';
      }
      if (!PlayerAuth.isLoggedIn()) {
        window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname + location.search);
        return;
      }
      try {
        const data = await PlayerAuth.request('/api/auth/me');
        credits = data.user.game_balance || 0;
        refreshHud();
      } catch (err) {
        els.overlay.classList.remove('hidden');
        els.title.textContent = 'Sin sesión';
        els.subtitle.textContent = err.message || 'Inicia sesión';
      }
      return;
    }
    machineNumber = MachineAPI.requireMachine();
    if (!machineNumber) return;
    if (MachineAPI.wireInicioLinks) MachineAPI.wireInicioLinks();
    try {
      const data = await MachineAPI.getMachine(machineNumber);
      credits = data.balance;
      refreshHud();
    } catch (err) {
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin máquina';
      els.subtitle.textContent = err.message || 'Selecciona máquina';
    }
  }

  function applySessionMeta(data) {
    session = {
      sessionId: data.sessionId,
      level: data.level,
      prize: data.prize,
      status: data.status,
      totalWon: data.totalWon || 0,
      enemies: data.enemies,
      playerHp: data.playerHp,
      playerMaxHp: data.playerMaxHp,
      enemyHp: data.enemyHp,
      enemyDmg: data.enemyDmg,
      zoneSeconds: data.zoneSeconds,
      aimAssist: data.aimAssist,
      mapSize: data.mapSize,
      killsRequired: data.killsRequired,
    };
    credits = data.balance ?? credits;
  }

  async function startMission(restart) {
    if (!playing || busy || world.running || !assetsReady) return;
    if (!isPlayerMode && !machineNumber) return;
    if (credits < bet()) {
      if (restart && session) {
        try {
          busy = true;
          if (isPlayerMode) await PlayerAuth.startZonaLibre(bet(), true);
          else await MachineAPI.startZonaLibre(bet(), true);
        } catch (_) { /* */ }
        finally { busy = false; }
        session = null;
        refreshHud();
        els.overlay.classList.remove('hidden');
        els.title.textContent = 'Sin saldo';
        els.subtitle.textContent = 'Crédito agotado. Recarga para volver al nivel 1.';
        return;
      }
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Necesitas más crédito para la siguiente misión.';
      return;
    }

    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.startZonaLibre(bet(), restart)
        : await MachineAPI.startZonaLibre(bet(), restart);
      applySessionMeta(data);
      spawnMission(data);
      showToast(restart ? 'Nueva partida' : `Nivel ${data.level}`, data.message, true);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo iniciar', false);
      if (restart) session = null;
    } finally {
      busy = false;
      refreshHud();
    }
  }

  async function retryMission() {
    if (!session || busy || world.running || !assetsReady) return;
    if (credits < bet()) {
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Recarga para reintentar.';
      return;
    }
    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.retryZonaLibre(session.sessionId)
        : await MachineAPI.retryZonaLibre(session.sessionId);
      applySessionMeta(data);
      spawnMission(data);
      showToast('Reintento', data.message, null);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo reintentar', false);
    } finally {
      busy = false;
      refreshHud();
    }
  }

  function beginPlay() {
    if (!assetsReady) {
      showToast('Cargando', 'Espera a que terminen los modelos 3D', null);
      return;
    }
    if (!isPlayerMode && !machineNumber) { loadBalance(); return; }
    if (credits < bet()) {
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Pide recarga al cajero.';
      return;
    }
    playing = true;
    els.overlay.classList.add('hidden');
    session = null;
    els.hint.textContent = 'Pulsa MISIÓN 1 para pagar y entrar a la zona GLB.';
    refreshHud();
  }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    if (e.code === 'Digit1' || e.key === '1') setWeapon(0);
    if (e.code === 'Digit2' || e.key === '2') setWeapon(1);
    if (e.code === 'Digit3' || e.key === '3') setWeapon(2);
    if (e.code === 'KeyQ' || e.code === 'KeyE' || e.key === 'q' || e.key === 'e') {
      e.preventDefault();
      cycleWeapon();
    }
    if (e.code === 'KeyR') {
      // reload
      const w = currentWeapon();
      if (world.running && world.reloadT <= 0 && world.ammo < w.mag && world.reserve > 0) {
        world.reloadT = w.reload;
      }
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    keys[e.key.toLowerCase()] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
  });

  renderer.domElement.addEventListener('mousedown', () => { input.firing = true; });
  window.addEventListener('mouseup', () => { input.firing = false; });
  els.fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.firing = true; }, { passive: false });
  els.fireBtn.addEventListener('touchend', () => { input.firing = false; });
  els.fireBtn.addEventListener('mousedown', (e) => { e.preventDefault(); input.firing = true; });
  if (els.sprintBtn) {
    const down = (e) => { e.preventDefault(); input.sprint = true; els.sprintBtn.classList.add('active'); };
    const up = () => { input.sprint = false; els.sprintBtn.classList.remove('active'); };
    els.sprintBtn.addEventListener('touchstart', down, { passive: false });
    els.sprintBtn.addEventListener('touchend', up);
    els.sprintBtn.addEventListener('mousedown', down);
    els.sprintBtn.addEventListener('mouseup', up);
  }
  if (els.weaponBtn) {
    els.weaponBtn.addEventListener('click', (e) => { e.preventDefault(); cycleWeapon(); });
  }
  const weaponBox = document.querySelector('.weapon-box');
  if (weaponBox) {
    weaponBox.addEventListener('click', (e) => { e.preventDefault(); cycleWeapon(); });
  }

  function setJoyFromEvent(clientX, clientY) {
    const rect = els.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.35;
    const m = Math.hypot(dx, dy) || 1;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    input.x = dx / max;
    input.y = dy / max;
    els.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  els.joystick.addEventListener('touchstart', (e) => {
    e.preventDefault(); joyActive = true;
    setJoyFromEvent(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, { passive: false });
  els.joystick.addEventListener('touchmove', (e) => {
    if (!joyActive) return;
    e.preventDefault();
    setJoyFromEvent(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, { passive: false });
  const endJoy = () => {
    joyActive = false; input.x = 0; input.y = 0;
    els.joyKnob.style.transform = 'translate(0,0)';
  };
  els.joystick.addEventListener('touchend', endJoy);
  els.joystick.addEventListener('touchcancel', endJoy);

  els.actionBtn.addEventListener('click', () => {
    if (!playing) { beginPlay(); return; }
    if (!session) { startMission(false); return; }
    if (session.status === 'level_complete') { startMission(false); return; }
    if (session.status === 'failed') { retryMission(); }
  });
  els.restartBtn.addEventListener('click', async () => {
    if (!playing || busy || world.running || !assetsReady) return;
    if (!confirm('¿Reiniciar? Volverás al nivel 1.')) return;
    await startMission(true);
  });
  els.startBtn.addEventListener('click', beginPlay);
  els.betDown.addEventListener('click', () => { if (world.running) return; betIndex = Math.max(0, betIndex - 1); refreshHud(); });
  els.betUp.addEventListener('click', () => { if (world.running) return; betIndex = Math.min(BETS.length - 1, betIndex + 1); refreshHud(); });

  // Preview ground while loading
  (function preview() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x4d6b3a })
    );
    g.rotation.x = -Math.PI / 2;
    worldRoot.add(g);
  })();

  refreshHud();
  requestAnimationFrame(loop);
  loadBalance();

  const loader = new GLTFLoader();
  loader.load(
    'assets/models/Soldier.glb',
    (gltf) => {
      soldierTemplate.scene = gltf.scene;
      soldierTemplate.animations = gltf.animations || [];
      assetsReady = true;
      loadBanner?.classList.add('hidden');
      els.hint.textContent = 'Modelos listos · Idle/Walk/Run + bloom activos';
      // demo soldier in lobby
      clearWorld();
      const demo = createSoldierActor(null);
      if (demo) {
        demo.root.position.set(0, 0, 0);
        worldRoot.add(demo.root);
        setAnim(demo, 'idle');
      }
      const rival = createSoldierActor(0xc45c26);
      if (rival) {
        rival.root.position.set(2.2, 0, -1.2);
        rival.root.rotation.y = -0.7;
        worldRoot.add(rival.root);
        setAnim(rival, 'idle');
      }
      refreshHud();
    },
    (ev) => {
      if (!ev.total) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      if (loadBanner) loadBanner.textContent = `Cargando modelo GLB… ${pct}%`;
    },
    (err) => {
      console.error(err);
      if (loadBanner) loadBanner.textContent = 'Error cargando GLB — recarga la página';
      showToast('Error 3D', 'No se pudo cargar Soldier.glb', false);
    }
  );
})();
