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
    epFill: document.getElementById('epFill'),
    epText: document.getElementById('epText'),
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
    crouchBtn: document.getElementById('crouchBtn'),
    proneBtn: document.getElementById('proneBtn'),
    jumpBtn: document.getElementById('jumpBtn'),
    dodgeBtn: document.getElementById('dodgeBtn'),
    weaponName: document.getElementById('weaponName'),
    joystick: document.getElementById('joystick'),
    joyKnob: document.getElementById('joyKnob'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toastTitle'),
    toastText: document.getElementById('toastText'),
    compass: document.getElementById('compass'),
    hitMarker: document.getElementById('hitMarker'),
    dmgFlash: document.getElementById('dmgFlash'),
    weaponSlots: document.getElementById('weaponSlots'),
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
  const input = { x: 0, y: 0, firing: false, sprint: false, crouch: false };
  const tap = { a: 0, d: 0 }; // double-tap dodge timing
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
  scene.background = new THREE.Color(0x9ec8e8);
  scene.fog = new THREE.FogExp2(0xb8d4e8, 0.011);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 280);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewEl.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x4a6b32, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dd, 1.65);
  sun.position.set(28, 42, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 110;
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8d4ff, 0.4);
  fill.position.set(-22, 14, -16);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe0b0, 0.25);
  rim.position.set(0, 8, -30);
  scene.add(rim);

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
    hitFlashT: 0,
    muzzleLight: null,
  };

  const aim = { yaw: Math.PI, mouseLook: false };
  const tmpCamPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

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

  function pulseHitMarker() {
    if (!els.hitMarker) return;
    els.hitMarker.classList.remove('hidden');
    clearTimeout(pulseHitMarker._t);
    pulseHitMarker._t = setTimeout(() => els.hitMarker.classList.add('hidden'), 120);
  }

  function pulseDamage() {
    world.hitFlashT = 0.28;
    if (els.dmgFlash) els.dmgFlash.classList.add('on');
  }

  function spawnMuzzle(x, z, angle) {
    if (!world.muzzleLight) {
      world.muzzleLight = new THREE.PointLight(0xffcc66, 0, 6, 2);
      worldRoot.add(world.muzzleLight);
    }
    world.muzzleLight.position.set(
      x + Math.sin(angle) * 0.9,
      1.45,
      z + Math.cos(angle) * 0.9
    );
    world.muzzleLight.intensity = 3.2;
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
    const w = viewEl.clientWidth || window.innerWidth || 960;
    const h = viewEl.clientHeight || window.innerHeight || Math.round(w * 9 / 16);
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
      baseScale: 1.05,
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

  function addPine(x, z, scale) {
    const s = scale || 1;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 1.1 * s, 7),
      new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.92 })
    );
    trunk.position.y = 0.55 * s;
    trunk.castShadow = true;
    group.add(trunk);
    const green = new THREE.MeshStandardMaterial({ color: 0x2f6b35, roughness: 0.88 });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - i * 0.22) * s, 1.35 * s, 8), green);
      cone.position.y = (1.35 + i * 0.85) * s;
      cone.castShadow = true;
      group.add(cone);
    }
    group.position.set(x, 0, z);
    worldRoot.add(group);
  }

  function addHill(x, z, r, h) {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x4d7340, roughness: 0.95, flatShading: true })
    );
    hill.position.set(x, 0, z);
    hill.scale.y = h / r;
    hill.receiveShadow = true;
    hill.castShadow = true;
    worldRoot.add(hill);
  }

  function addScenicBackdrop(mapSize) {
    // Soft sky dome gradient
    const skyGeo = new THREE.SphereGeometry(220, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0xb8d8f0) },
        midColor: { value: new THREE.Color(0xd8eaf5) },
        bottomColor: { value: new THREE.Color(0xe8f0e4) },
      },
      vertexShader: `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = normalize(w.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vW;
        void main() {
          float h = clamp(vW.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.45, h));
          col = mix(col, topColor, smoothstep(0.4, 1.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    worldRoot.add(sky);

    // Lake beyond +Z edge
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 90),
      new THREE.MeshStandardMaterial({
        color: 0x3a7ea8,
        metalness: 0.65,
        roughness: 0.22,
        transparent: true,
        opacity: 0.92,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.08, mapSize / 2 + 38);
    worldRoot.add(water);

    // Shore strip
    const shore = new THREE.Mesh(
      new THREE.PlaneGeometry(mapSize + 30, 10),
      new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.03, mapSize / 2 + 6);
    worldRoot.add(shore);

    // Wooden pier into water
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.85), plankMat);
      plank.position.set(3.5, 0.2, mapSize / 2 + 4 + i * 0.95);
      plank.castShadow = true;
      plank.receiveShadow = true;
      worldRoot.add(plank);
    }
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.92 });
    [[2.2, 0], [4.8, 0], [2.2, 10], [4.8, 10]].forEach(([ox, oz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), postMat);
      post.position.set(ox + 1.5, 0.5, mapSize / 2 + 5 + oz);
      worldRoot.add(post);
    });

    // Distant cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 2.6, 3.5),
      new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.88 })
    );
    cabin.position.set(-18, 1.3, mapSize / 2 + 22);
    cabin.castShadow = true;
    worldRoot.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.6, 1.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.9 })
    );
    roof.position.set(-18, 3.3, mapSize / 2 + 22);
    roof.rotation.y = Math.PI / 4;
    worldRoot.add(roof);

    // Hills around perimeter
    addHill(-38, -10, 14, 9);
    addHill(40, -16, 16, 11);
    addHill(-32, 28, 12, 8);
    addHill(36, 34, 15, 10);
    addHill(0, -40, 18, 7);
    addHill(-48, 12, 11, 7);

    // Pine forest on hills / shore
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = mapSize / 2 + 8 + Math.random() * 28;
      const px = Math.cos(ang) * dist;
      const pz = Math.sin(ang) * dist;
      if (pz > mapSize / 2 + 2 && Math.abs(px) < 8) continue; // keep pier clear
      addPine(px, pz, 0.85 + Math.random() * 0.7);
    }

    // Foreground rocks near shore
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + Math.random() * 1.2, 0), rockMat);
      rock.position.set(rand(-16, 16), 0.2, mapSize / 2 + rand(1, 5));
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      worldRoot.add(rock);
    }
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

    addScenicBackdrop(mapSize);

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

    for (let i = 0; i < 10; i++) {
      const tx = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      const tz = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      if (blocked(tx, tz, 1.2) || Math.hypot(tx, tz) < 7) continue;
      addPine(tx, tz, 0.75 + Math.random() * 0.45);
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
      isPlayer: true,
      x: 0, z: 6, r: 0.4,
      hp: data.playerHp,
      maxHp: data.playerMaxHp,
      angle: Math.PI,
      walkSpeed: 9.8,
      runSpeed: 17.5,
      crouchSpeed: 5.8,
      proneSpeed: 3.4,
      vx: 0,
      vz: 0,
      jumpY: 0,
      jumpV: 0,
      grounded: true,
      stance: 'stand', // stand | crouch | prone
      action: null, // dive | slide | dodge
      actionT: 0,
      actionDur: 0,
      dodgeSign: 0,
      dodgeCd: 0,
      shootCd: 0,
      moving: false,
      sprinting: false,
      stamina: 200,
      muzzleY: 1.42,
    };
    aim.yaw = Math.PI;

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
      new THREE.SphereGeometry(ally ? 0.055 : 0.065, 8, 8),
      new THREE.MeshStandardMaterial({
        color: ally ? 0xd4ff4d : 0xff8a1e,
        emissive: ally ? 0xa0ff20 : 0xff5500,
        emissiveIntensity: 2.4,
        toneMapped: false,
      })
    );
    mesh.position.set(owner.x + dir.x * 0.9, owner.muzzleY != null ? owner.muzzleY : 1.42, owner.z + dir.z * 0.9);
    worldRoot.add(mesh);
    if (ally) spawnMuzzle(owner.x, owner.z, yaw);
    world.bullets.push({
      mesh,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      vx: dir.x * speed,
      vz: dir.z * speed,
      ally,
      dmg,
      life: 1.2,
      r: ally ? 0.14 : 0.16,
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

    const base = actor.baseScale || 1.05;
    let y = actor.jumpY || 0;
    let rx = 0;
    let sy = base;
    let hpY = 2.15;

    if (actor.isPlayer) {
      const st = actor.stance || 'stand';
      const act = actor.action;
      if (act === 'slide') {
        rx = -0.75;
        y = 0.08 + (actor.jumpY || 0);
        sy = base * 0.72;
        hpY = 1.1;
      } else if (act === 'dive') {
        const k = 1 - Math.max(0, actor.actionT) / (actor.actionDur || 0.55);
        rx = -Math.PI / 2 * Math.min(1, k * 1.35);
        y = 0.12 + (actor.jumpY || 0) * 0.3;
        sy = base * 0.9;
        hpY = 0.7;
      } else if (act === 'dodge') {
        rx = -0.35;
        y = 0.2 + (actor.jumpY || 0);
        sy = base * 0.85;
        hpY = 1.4;
      } else if (st === 'prone') {
        rx = -Math.PI / 2 * 0.95;
        y = 0.1;
        sy = base * 0.95;
        hpY = 0.55;
      } else if (st === 'crouch') {
        rx = -0.12;
        y = -0.05 + (actor.jumpY || 0);
        sy = base * 0.72;
        hpY = 1.45;
      } else {
        y = actor.jumpY || 0;
        sy = base;
        hpY = 2.15 + y * 0.2;
      }
      actor.muzzleY = st === 'prone' || act === 'dive' ? 0.45 : st === 'crouch' || act === 'slide' ? 1.05 : 1.42 + (actor.jumpY || 0) * 0.5;
      actor.r = st === 'prone' ? 0.26 : st === 'crouch' ? 0.34 : 0.4;
    }

    actor.root.position.y = y;
    actor.root.rotation.x = rx;
    actor.root.rotation.y = actor.angle + Math.PI;
    actor.root.rotation.z = actor.action === 'dodge' ? (actor.dodgeSign || 0) * 0.45 : 0;
    actor.root.scale.setScalar(sy);

    if (actor.hpBar) {
      actor.hpBar.position.y = hpY;
      const pct = Math.max(0.01, actor.hp / actor.maxHp);
      actor.hpBar.scale.x = pct;
      actor.hpBar.material.color.setHex(pct > 0.45 ? 0x6dff7a : 0xff4d4d);
      actor.hpBar.quaternion.copy(camera.quaternion);
    }
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

  function startPlayerAction(p, type, opts) {
    if (!p || p.action) return false;
    if (type === 'dodge' && p.dodgeCd > 0) return false;
    if (type === 'jump' && (!p.grounded || p.stance === 'prone')) return false;

    if (type === 'jump') {
      p.jumpV = 7.2;
      p.grounded = false;
      p.stance = 'stand';
      // small forward hop boost
      p.vx += Math.sin(aim.yaw) * 2.2;
      p.vz += Math.cos(aim.yaw) * 2.2;
      return true;
    }

    if (type === 'slide') {
      if (p.stance === 'prone') return false;
      p.action = 'slide';
      p.actionDur = 0.48;
      p.actionT = 0.48;
      p.stance = 'crouch';
      const boost = 21;
      p.vx = Math.sin(aim.yaw) * boost;
      p.vz = Math.cos(aim.yaw) * boost;
      return true;
    }

    if (type === 'dive') {
      p.action = 'dive';
      p.actionDur = 0.55;
      p.actionT = 0.55;
      const boost = 18;
      const dirX = opts?.wx != null ? opts.wx : Math.sin(aim.yaw);
      const dirZ = opts?.wz != null ? opts.wz : Math.cos(aim.yaw);
      p.vx = dirX * boost;
      p.vz = dirZ * boost;
      p.jumpV = 2.4;
      p.grounded = false;
      return true;
    }

    if (type === 'dodge') {
      const sign = opts?.sign || 1;
      p.action = 'dodge';
      p.actionDur = 0.32;
      p.actionT = 0.32;
      p.dodgeSign = sign;
      p.dodgeCd = 0.55;
      const side = sign;
      const boost = 20;
      p.vx = Math.cos(aim.yaw) * side * boost + Math.sin(aim.yaw) * 4;
      p.vz = -Math.sin(aim.yaw) * side * boost + Math.cos(aim.yaw) * 4;
      p.jumpV = 3.2;
      p.grounded = false;
      if (p.stance === 'prone') p.stance = 'crouch';
      return true;
    }
    return false;
  }

  function setStance(p, stance) {
    if (!p || p.action) return;
    if (stance === 'prone') {
      p.stance = 'prone';
      p.sprinting = false;
    } else if (stance === 'crouch') {
      p.stance = 'crouch';
    } else {
      p.stance = 'stand';
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
    const inputMag = Math.hypot(mx, mz);
    if (inputMag > 1) { mx /= inputMag; mz /= inputMag; }

    const cosA = Math.cos(aim.yaw);
    const sinA = Math.sin(aim.yaw);
    let wishX = sinA * (-mz) + cosA * mx;
    let wishZ = cosA * (-mz) - sinA * mx;
    const wishMag = Math.hypot(wishX, wishZ);
    if (wishMag > 1e-4) { wishX /= wishMag; wishZ /= wishMag; }

    // Stance input
    const wantCrouch = input.crouch || keys.ControlLeft || keys.ControlRight || keys.KeyC || keys.c;
    if ((keys.KeyZ || keys.z) && !keys._zLatch) {
      keys._zLatch = true;
      if (p.stance === 'prone') setStance(p, 'stand');
      else if (wishMag > 0.2 || p.sprinting) startPlayerAction(p, 'dive', { wx: wishX || Math.sin(aim.yaw), wz: wishZ || Math.cos(aim.yaw) });
      else setStance(p, 'prone');
    }
    if (!(keys.KeyZ || keys.z)) keys._zLatch = false;

    // Slide: sprint + crouch
    let wantSprint = !!(input.sprint || keys.ShiftLeft || keys.ShiftRight || keys.shift);
    if (wantCrouch && wantSprint && wishMag > 0.2 && p.stance !== 'prone' && !p.action && p.grounded) {
      startPlayerAction(p, 'slide');
    } else if (wantCrouch && !p.action && p.stance !== 'prone') {
      setStance(p, 'crouch');
    } else if (!wantCrouch && p.stance === 'crouch' && !p.action) {
      setStance(p, 'stand');
    }

    // Jump / get up
    if ((keys.Space || keys[' '] || input.jumpPulse) && !keys._spaceLatch) {
      keys._spaceLatch = true;
      input.jumpPulse = false;
      if (p.stance === 'prone' && !p.action) setStance(p, 'crouch');
      else if (p.stance === 'crouch' && !p.action && !wantSprint) startPlayerAction(p, 'jump');
      else if (!p.action) startPlayerAction(p, 'jump');
    }
    if (!(keys.Space || keys[' '])) keys._spaceLatch = false;

    // Dodge: Alt / F / double-tap A-D / button
    if (input.dodgePulse) {
      const sign = input._dodgeSign || (mx !== 0 ? Math.sign(mx) : 1);
      startPlayerAction(p, 'dodge', { sign: sign || 1 });
      input.dodgePulse = false;
    }
    if ((keys.AltLeft || keys.AltRight || keys.KeyF || keys.f) && !keys._dodgeLatch) {
      keys._dodgeLatch = true;
      const sign = mx !== 0 ? Math.sign(mx) : 1;
      startPlayerAction(p, 'dodge', { sign });
    }
    if (!(keys.AltLeft || keys.AltRight || keys.KeyF || keys.f)) keys._dodgeLatch = false;

    p.dodgeCd = Math.max(0, p.dodgeCd - dt);

    // Action timers
    if (p.action) {
      p.actionT -= dt;
      if (p.actionT <= 0) {
        if (p.action === 'dive') p.stance = 'prone';
        if (p.action === 'slide') p.stance = 'crouch';
        p.action = null;
        p.actionT = 0;
        p.root.rotation.z = 0;
      }
    }

    if (wantSprint && wishMag > 0.1 && p.stance === 'stand' && !p.action && p.grounded) {
      // stamina drain for EP bar
      p.stamina = Math.max(0, (p.stamina != null ? p.stamina : 200) - 28 * dt);
      if (p.stamina <= 0) wantSprint = false;
    } else {
      p.stamina = Math.min(200, (p.stamina != null ? p.stamina : 200) + 22 * dt);
    }
    p.sprinting = wantSprint && wishMag > 0.1 && p.stance === 'stand' && !p.action && p.grounded;
    if (els.sprintBtn) els.sprintBtn.classList.toggle('active', !!p.sprinting);
    if (els.crouchBtn) els.crouchBtn.classList.toggle('active', p.stance === 'crouch' || p.action === 'slide');
    if (els.proneBtn) els.proneBtn.classList.toggle('active', p.stance === 'prone' || p.action === 'dive');

    let maxSpeed = p.walkSpeed;
    if (p.sprinting) maxSpeed = p.runSpeed;
    else if (p.stance === 'crouch') maxSpeed = p.crouchSpeed;
    else if (p.stance === 'prone') maxSpeed = p.proneSpeed;
    if (p.action === 'slide' || p.action === 'dive' || p.action === 'dodge') maxSpeed = 24;

    const air = !p.grounded;
    const targetVx = (p.action ? p.vx : wishX * maxSpeed * (wishMag > 0.05 ? 1 : 0));
    const targetVz = (p.action ? p.vz : wishZ * maxSpeed * (wishMag > 0.05 ? 1 : 0));
    let accel = wishMag > 0.05 ? (p.sprinting ? 120 : 95) : 130;
    if (p.stance === 'prone') accel = 40;
    if (air) accel *= 0.45;
    if (p.action === 'slide' || p.action === 'dive' || p.action === 'dodge') {
      // coast with light friction during special move
      p.vx *= Math.max(0, 1 - 1.8 * dt);
      p.vz *= Math.max(0, 1 - 1.8 * dt);
    } else {
      p.vx += Math.sign(targetVx - p.vx) * Math.min(Math.abs(targetVx - p.vx), accel * dt);
      p.vz += Math.sign(targetVz - p.vz) * Math.min(Math.abs(targetVz - p.vz), accel * dt);
      if (wishMag < 0.05 && p.grounded) {
        p.vx *= Math.max(0, 1 - 16 * dt);
        p.vz *= Math.max(0, 1 - 16 * dt);
        if (Math.abs(p.vx) < 0.08) p.vx = 0;
        if (Math.abs(p.vz) < 0.08) p.vz = 0;
      }
    }

    // Jump physics
    if (!p.grounded || p.jumpV !== 0) {
      p.jumpV -= 22 * dt;
      p.jumpY += p.jumpV * dt;
      if (p.jumpY <= 0) {
        p.jumpY = 0;
        p.jumpV = 0;
        p.grounded = true;
      } else {
        p.grounded = false;
      }
    }

    let nx = p.x + p.vx * dt;
    let nz = p.z + p.vz * dt;
    nx = Math.max(-half, Math.min(half, nx));
    nz = Math.max(-half, Math.min(half, nz));
    if (!blocked(nx, p.z, p.r)) p.x = nx; else p.vx *= -0.2;
    if (!blocked(p.x, nz, p.r)) p.z = nz; else p.vz *= -0.2;

    const speedNow = Math.hypot(p.vx, p.vz);
    p.moving = speedNow > 0.4;
    if (p.sprinting && speedNow > 1 && !p.action) {
      const moveYaw = Math.atan2(p.vx, p.vz);
      let d = moveYaw - aim.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      aim.yaw += d * Math.min(1, 8 * dt);
    }
    p.angle = aim.yaw;

    if (p.action === 'dive' || p.action === 'slide' || p.action === 'dodge') {
      setAnim(p, 'run');
    } else if (p.stance === 'prone') {
      setAnim(p, p.moving ? 'walk' : 'idle');
    } else {
      setAnim(p, p.moving ? (p.sprinting || speedNow > 10 ? 'run' : 'walk') : 'idle');
    }

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
    // Fire: mouse / DISPARO / Enter (Space is jump)
    const wantFire = input.firing || keys.Enter || keys.enter;
    const wpn = currentWeapon();
    const canShoot = !p.action || p.action === 'slide';
    if (wantFire && canShoot) {
      const tgt = nearestEnemy(p);
      if (tgt) {
        const desired = Math.atan2(tgt.x - p.x, tgt.z - p.z);
        let diff = desired - aim.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const assist = p.stance === 'prone' ? 0.55 : 0.35;
        if (Math.abs(diff) < 0.6) aim.yaw += diff * Math.min(1, 7 * dt * (assist + (world.aimAssist || 0.2)));
        p.angle = aim.yaw;
      }
    }
    // Stance accuracy: prone more precise (less spread handled in fire), crouch slightly better cd feel
    const stanceCdMul = p.stance === 'prone' ? 0.92 : p.stance === 'crouch' ? 0.96 : 1;
    if (wantFire && canShoot && p.shootCd <= 0 && world.reloadT <= 0) {
      if (world.ammo > 0) {
        world.ammo -= 1;
        p.shootCd = wpn.cd * stanceCdMul;
        // temporarily tighten spread when prone
        const oldSpread = wpn.spread;
        if (p.stance === 'prone') wpn.spread *= 0.45;
        if (p.stance === 'crouch') wpn.spread *= 0.7;
        firePlayerWeapon(p);
        wpn.spread = oldSpread;
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
      if (dist > 11) move = 1;
      else if (dist < 6) move = -0.55;
      else move = 0.15;
      // Flank / strafe while keeping LOS to player
      const sx = -dz / dist * e.strafe * 0.7;
      const sz = dx / dist * e.strafe * 0.7;
      const mvx = (dx / dist) * move + sx;
      const mvz = (dz / dist) * move + sz;
      let ex = e.x + mvx * e.speed * dt;
      let ez = e.z + mvz * e.speed * dt;
      ex = Math.max(-half, Math.min(half, ex));
      ez = Math.max(-half, Math.min(half, ez));
      if (!blocked(ex, e.z, e.r)) e.x = ex;
      if (!blocked(e.x, ez, e.r)) e.z = ez;

      // Always face / shoot AT the player (with lead)
      const leadT = dist / 26;
      const aimDx = dx + p.vx * leadT;
      const aimDz = dz + p.vz * leadT;
      const toPlayer = Math.atan2(aimDx, aimDz);
      e.angle = toPlayer;

      setAnim(e, Math.hypot(mvx, mvz) > 0.15 ? (Math.abs(move) > 0.7 ? 'run' : 'walk') : 'idle');

      e.shootCd -= dt;
      const canSee = dist < 22 && dist > 1.2;
      if (e.shootCd <= 0 && canSee) {
        // More aggressive as level rises; slight inaccuracy
        const inacc = Math.max(0.02, 0.12 - (session?.level || 1) * 0.008);
        e.angle = toPlayer + (Math.random() - 0.5) * inacc * (p.stance === 'prone' ? 1.8 : p.stance === 'crouch' ? 1.25 : 1);
        e.shootCd = rand(0.35, 0.75);
        fireBullet(e, false, world.enemyDmg, 24 + Math.min(8, (session?.level || 1) * 0.4));
        e.angle = toPlayer;
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
              if (Math.hypot(v.x - barrel.x, v.z - barrel.z) < 3.2) {
                v.hp -= 28;
                if (v === world.player) pulseDamage();
              }
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
            pulseHitMarker();
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
          pulseDamage();
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
    if (Math.hypot(p.x, p.z) > world.zoneR) {
      p.hp -= 14 * dt;
      if (Math.random() < dt * 2) pulseDamage();
    }

    if (world.hitFlashT > 0) {
      world.hitFlashT -= dt;
      if (world.hitFlashT <= 0 && els.dmgFlash) els.dmgFlash.classList.remove('on');
    }
    if (world.muzzleLight && world.muzzleLight.intensity > 0) {
      world.muzzleLight.intensity *= Math.max(0, 1 - 18 * dt);
    }

    syncActor(p);

    // Tighter cinematic camera behind aim — height by stance
    let camH = 4.15;
    let camBack = 7.2;
    if (p.stance === 'crouch' || p.action === 'slide') { camH = 3.1; camBack = 6.4; }
    if (p.stance === 'prone' || p.action === 'dive') { camH = 2.05; camBack = 5.6; }
    if (p.sprinting) { camH += 0.15; camBack -= 0.5; }
    camH += (p.jumpY || 0) * 0.65;
    const cx = p.x - Math.sin(aim.yaw) * camBack;
    const cz = p.z - Math.cos(aim.yaw) * camBack;
    const camLerp = 1 - Math.pow(0.00015, dt);
    tmpCamPos.set(cx, camH, cz);
    camera.position.lerp(tmpCamPos, camLerp);
    const lookY = p.stance === 'prone' ? 0.55 : p.stance === 'crouch' ? 1.05 : 1.4;
    tmpLook.set(p.x + Math.sin(aim.yaw) * 2.8, lookY + (p.jumpY || 0) * 0.4, p.z + Math.cos(aim.yaw) * 2.8);
    camera.lookAt(tmpLook);
    const targetFov = p.sprinting ? 62 : p.action === 'dodge' ? 58 : 54;
    camera.fov += (targetFov - camera.fov) * Math.min(1, 10 * dt);
    camera.updateProjectionMatrix();

    const deg = ((-aim.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const mid = Math.round(deg / 15) * 15;
    if (els.compass) {
      els.compass.innerHTML =
        '<span>' + ((mid + 345) % 360) + '</span>' +
        '<span>' + ((mid + 350) % 360) + '</span>' +
        '<span class="c-mid">' + (mid % 360) + '</span>' +
        '<span>' + ((mid + 15) % 360) + '</span>' +
        '<span>' + ((mid + 30) % 360) + '</span>';
    }

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
      if (els.epFill) {
        const epMax = 200;
        const ep = Math.max(0, Math.min(epMax, world.player.stamina != null ? world.player.stamina : epMax));
        els.epFill.style.width = ((ep / epMax) * 100) + '%';
        if (els.epText) els.epText.textContent = Math.ceil(ep) + '/' + epMax;
      }
    } else {
      els.hpFill.style.width = '100%';
      els.hpText.textContent = '200/200';
      if (els.epFill) els.epFill.style.width = '100%';
      if (els.epText) els.epText.textContent = '200/200';
    }

    els.ammoText.textContent = world.ammo + '/' + world.reserve;
    if (els.weaponName) els.weaponName.textContent = currentWeapon().name;
    if (els.weaponSlots) {
      els.weaponSlots.querySelectorAll('.w-slot').forEach((el) => {
        el.classList.toggle('is-active', parseInt(el.dataset.weapon, 10) === world.weaponIndex);
      });
    }
    els.killCount.textContent = String(world.kills);
    const alive = (world.player && world.player.hp > 0 ? 1 : 0) + world.enemies.filter((e) => e.hp > 0).length;
    els.aliveCount.textContent = world.running ? String(alive) : '0';
    const left = Math.max(0, Math.ceil(world.zoneMax - world.zoneT));
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    els.zoneTimer.textContent = world.running ? (mm + ':' + ss) : '00:00';

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
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.crouch = true;
    if (e.code === 'Digit1' || e.key === '1') setWeapon(0);
    if (e.code === 'Digit2' || e.key === '2') setWeapon(1);
    if (e.code === 'Digit3' || e.key === '3') setWeapon(2);
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      e.preventDefault();
      cycleWeapon();
    }
    // Double-tap A/D = dodge
    const now = performance.now();
    if (e.code === 'KeyA') {
      if (now - tap.a < 280) input.dodgePulse = true, input._dodgeSign = -1;
      tap.a = now;
    }
    if (e.code === 'KeyD') {
      if (now - tap.d < 280) input.dodgePulse = true, input._dodgeSign = 1;
      tap.d = now;
    }
    if (e.code === 'KeyR') {
      const w = currentWeapon();
      if (world.running && world.reloadT <= 0 && world.ammo < w.mag && world.reserve > 0) {
        world.reloadT = w.reload;
      }
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    keys[e.key.toLowerCase()] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.crouch = false;
  });

  renderer.domElement.addEventListener('mousedown', () => { input.firing = true; });
  window.addEventListener('mouseup', () => { input.firing = false; });
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!world.running) return;
    // Drag with LMB or any movement while firing / holding RMB
    if (e.buttons === 1 || e.buttons === 2 || input.firing) {
      aim.yaw -= e.movementX * 0.0032;
    }
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  // Touch look: horizontal drag on the 3D view (not on joystick)
  let lookTouchId = null;
  let lookLastX = 0;
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (!world.running || lookTouchId !== null) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lookLastX = t.clientX;
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', (e) => {
    if (lookTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      aim.yaw -= (t.clientX - lookLastX) * 0.0045;
      lookLastX = t.clientX;
    }
  }, { passive: true });
  const endLook = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  };
  renderer.domElement.addEventListener('touchend', endLook);
  renderer.domElement.addEventListener('touchcancel', endLook);
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
  if (els.crouchBtn) {
    const down = (e) => { e.preventDefault(); input.crouch = true; };
    const up = () => { input.crouch = false; };
    els.crouchBtn.addEventListener('touchstart', down, { passive: false });
    els.crouchBtn.addEventListener('touchend', up);
    els.crouchBtn.addEventListener('mousedown', down);
    els.crouchBtn.addEventListener('mouseup', up);
  }
  if (els.proneBtn) {
    els.proneBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!world.player) return;
      const p = world.player;
      if (p.stance === 'prone') setStance(p, 'stand');
      else startPlayerAction(p, 'dive', { wx: Math.sin(aim.yaw), wz: Math.cos(aim.yaw) });
    });
  }
  if (els.jumpBtn) {
    els.jumpBtn.addEventListener('click', (e) => { e.preventDefault(); input.jumpPulse = true; });
  }
  if (els.dodgeBtn) {
    els.dodgeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      input.dodgePulse = true;
      input._dodgeSign = 1;
    });
  }
  if (els.weaponBtn) {
    if (els.weaponBtn) {
    els.weaponBtn.addEventListener('click', (e) => { e.preventDefault(); cycleWeapon(); });
  }
  if (els.weaponSlots) {
    els.weaponSlots.addEventListener('click', (e) => {
      const slot = e.target.closest('.w-slot');
      if (!slot) return;
      e.preventDefault();
      setWeapon(parseInt(slot.dataset.weapon, 10));
    });
  }
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
      if (els.hint) els.hint.textContent = 'Listo · C agachar · Z suelo · Space salto · Shift sprint';
      // Scenic lobby preview (Free Fire vibe)
      clearWorld();
      buildArena(42);
      const demo = createSoldierActor(null);
      if (demo) {
        demo.root.position.set(0, 0, 4);
        worldRoot.add(demo.root);
        setAnim(demo, 'idle');
      }
      const rival = createSoldierActor(0xc45c26);
      if (rival) {
        rival.root.position.set(2.4, 0, 2.5);
        rival.root.rotation.y = -0.85;
        worldRoot.add(rival.root);
        setAnim(rival, 'idle');
      }
      camera.position.set(8, 5.5, 2);
      camera.lookAt(2, 1.2, 18);
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
