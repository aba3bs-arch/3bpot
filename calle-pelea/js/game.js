import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const isPlayerMode = new URLSearchParams(location.search).has('player');
const BETS = [1, 2, 5, 10, 15, 20];

const viewEl = document.getElementById('view3d');
const loadBanner = document.getElementById('loadBanner');

const creditsEl = document.getElementById('credits');
const betEl = document.getElementById('bet');
const levelEl = document.getElementById('level');
const prizeEl = document.getElementById('prize');
const wonEl = document.getElementById('won');
const hintEl = document.getElementById('hint');
const playerBar = document.getElementById('playerBar');
const enemyBar = document.getElementById('enemyBar');
const playerHp = document.getElementById('playerHp');
const enemyHp = document.getElementById('enemyHp');
const rivalName = document.getElementById('rivalName');
const roundNum = document.getElementById('roundNum');
const overlay = document.getElementById('overlay');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const startBtn = document.getElementById('startBtn');
const betDown = document.getElementById('betDown');
const betUp = document.getElementById('betUp');
const actionBtn = document.getElementById('actionBtn');
const restartBtn = document.getElementById('restartBtn');
const menuBtn = document.getElementById('menuBtn');
const machineLabel = document.getElementById('machineLabel');
const btnPunch = document.getElementById('btnPunch');
const btnKick = document.getElementById('btnKick');
const btnBlock = document.getElementById('btnBlock');
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toastTitle');
const toastText = document.getElementById('toastText');

let credits = 0;
let betIndex = 0;
let machineNumber = null;
let busy = false;
let playing = false;
let session = null;
let assetsReady = false;

const clock = new THREE.Clock();
const mixers = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a9fc4);
scene.fog = new THREE.Fog(0x8eb8d4, 8, 28);

const camera = new THREE.PerspectiveCamera(42, 16 / 7, 0.1, 80);
camera.position.set(0, 1.55, 3.15);
camera.lookAt(0, 1.0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewEl.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xd8ecff, 0x3d4a28, 0.95);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d6, 1.45);
sun.position.set(4, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
sun.shadow.bias = -0.0003;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x88bbff, 0.35);
fill.position.set(-5, 4, -3);
scene.add(fill);

const flashLight = new THREE.PointLight(0xffe08a, 0, 8, 2);
flashLight.position.set(0, 2.2, 1.5);
scene.add(flashLight);

const impactMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 12, 12),
  new THREE.MeshStandardMaterial({
    color: 0xffe066, emissive: 0xff9900, emissiveIntensity: 4, toneMapped: false,
  })
);
impactMesh.visible = false;
scene.add(impactMesh);

function showImpact() {
  impactMesh.position.set(0, 1.2, 0.2);
  impactMesh.visible = true;
  impactMesh.scale.setScalar(1.6);
  flashLight.intensity = 3.2;
  setTimeout(() => { impactMesh.visible = false; }, 160);
}

const arenaRoot = new THREE.Group();
scene.add(arenaRoot);

let composer;
let bloomPass;

function setupComposer() {
  const w = viewEl.clientWidth || 960;
  const h = viewEl.clientHeight || Math.round(w * 7 / 16);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.65, 0.88);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}
setupComposer();

function resize() {
  const w = viewEl.clientWidth || 960;
  const h = viewEl.clientHeight || Math.round(w * 7 / 16);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  bloomPass?.resolution.set(w, h);
}
window.addEventListener('resize', resize);
resize();

const templates = {
  fighter: { scene: null, animations: [] },
  rival: { scene: null, animations: [] },
};

let playerActor = null;
let rivalActor = null;
let flash = 0;
let lastNote = '';

function mxn(n) {
  if (isPlayerMode) return PlayerAuth.formatPesos(n);
  return MachineAPI.formatPesos(n);
}

function bet() {
  return BETS[betIndex];
}

function showToast(title, text, ok) {
  toastTitle.textContent = title;
  toastText.textContent = text;
  toast.style.borderColor = ok ? '#6bcb77' : ok === false ? '#e23b2e' : '#ffcc33';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2800);
}

function setFightButtons(enabled) {
  const on = enabled && assetsReady;
  btnPunch.disabled = !on;
  btnKick.disabled = !on;
  btnBlock.disabled = !on;
}

function refreshHud() {
  creditsEl.textContent = mxn(credits);
  betEl.textContent = mxn(bet());
  levelEl.textContent = session ? String(session.level) : '—';
  prizeEl.textContent = mxn(session?.prize || 0);
  wonEl.textContent = mxn(session?.totalWon || 0);
  roundNum.textContent = String(session?.round || 0);

  if (session) {
    const pPct = Math.max(0, (session.playerHp / session.playerMaxHp) * 100);
    const ePct = Math.max(0, (session.enemyHp / session.enemyMaxHp) * 100);
    playerBar.style.width = pPct + '%';
    enemyBar.style.width = ePct + '%';
    playerHp.textContent = `${session.playerHp}/${session.playerMaxHp}`;
    enemyHp.textContent = `${session.enemyHp}/${session.enemyMaxHp}`;
    rivalName.textContent = (session.rival?.name || 'RIVAL').toUpperCase();
  } else {
    playerBar.style.width = '100%';
    enemyBar.style.width = '100%';
    playerHp.textContent = '—';
    enemyHp.textContent = '—';
    rivalName.textContent = 'RIVAL';
  }

  if (machineLabel) {
    machineLabel.textContent = isPlayerMode
      ? (PlayerAuth.getUser()?.name || 'Jugador')
      : (machineNumber ? '#' + machineNumber : '—');
  }

  restartBtn.disabled = !session || busy || !assetsReady;
  refreshActionBtn();
  setFightButtons(!!session && session.status === 'fighting' && !busy);
}

function refreshActionBtn() {
  if (!assetsReady) {
    actionBtn.textContent = 'CARGANDO…';
    actionBtn.disabled = true;
    return;
  }
  if (!playing) {
    actionBtn.textContent = 'JUGAR';
    actionBtn.disabled = false;
    return;
  }
  if (!session) {
    actionBtn.textContent = 'NIVEL 1';
    actionBtn.disabled = busy;
    return;
  }
  if (session.status === 'level_complete') {
    actionBtn.textContent = 'SIGUIENTE';
    actionBtn.disabled = busy;
    return;
  }
  if (session.status === 'failed') {
    actionBtn.textContent = 'REVANCHA';
    actionBtn.disabled = busy;
    return;
  }
  actionBtn.textContent = 'EN PELEA';
  actionBtn.disabled = true;
}

function loadTexture(url) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function makeFallbackGrass() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a6b38';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 800; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 50},${80 + Math.random() * 60},${30 + Math.random() * 30},0.4)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFallbackBrick() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6a55';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#6e5344';
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 9; col++) {
      g.fillRect(col * 32 + off + 1, y + 1, 30, 28);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function buildArena() {
  while (arenaRoot.children.length) {
    arenaRoot.remove(arenaRoot.children[0]);
  }

  let grassTex = await loadTexture('assets/textures/grass.jpg');
  let brickTex = await loadTexture('assets/textures/brick.jpg');
  if (!grassTex) grassTex = makeFallbackGrass();
  else grassTex.repeat.set(8, 8);
  if (!brickTex) brickTex = makeFallbackBrick();
  else brickTex.repeat.set(3, 2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 12),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  arenaRoot.add(ground);

  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a463f, roughness: 0.95, metalness: 0.05 })
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = 0.01;
  street.receiveShadow = true;
  arenaRoot.add(street);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 0.85 });
  [-2.4, 2.4].forEach((x) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 10), curbMat);
    curb.position.set(x, 0.04, 0);
    curb.receiveShadow = true;
    arenaRoot.add(curb);
  });

  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8, metalness: 0.05 });
  const buildings = [
    { x: -5.2, z: -3.2, w: 3.2, h: 4.2, d: 2.4 },
    { x: 5.4, z: -2.8, w: 3.6, h: 5.0, d: 2.6 },
    { x: -4.8, z: 2.5, w: 2.8, h: 3.4, d: 2.2 },
    { x: 5.0, z: 2.8, w: 3.0, h: 3.8, d: 2.4 },
    { x: 0, z: -4.5, w: 5.5, h: 3.2, d: 1.8 },
  ];
  buildings.forEach((b) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), brickMat.clone());
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    arenaRoot.add(mesh);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x9fd4ff,
      emissive: 0x2a6088,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.3,
    });
    const cols = Math.max(2, Math.floor(b.w));
    for (let i = 0; i < cols; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.55), winMat);
      win.position.set(
        b.x - b.w / 2 + 0.7 + i * ((b.w - 1.2) / Math.max(1, cols - 1)),
        1.6 + (i % 2) * 1.1,
        b.z + b.d / 2 + 0.02
      );
      arenaRoot.add(win);
    }
  });

  // Trees only on the sides / back — never between camera (z>0) and fighters
  const treeSpots = [
    { x: -3.8, z: -2.4 },
    { x: 3.8, z: -2.4 },
    { x: -4.2, z: 0.2 },
    { x: 4.2, z: 0.2 },
  ];
  treeSpots.forEach(({ x: tx, z: tz }) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 })
    );
    trunk.position.set(tx, 0.45, tz);
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3d7a3a, roughness: 0.85 })
    );
    leaves.position.set(tx, 1.15, tz);
    leaves.castShadow = true;
    arenaRoot.add(trunk, leaves);
  });
}

function findBone(root, names) {
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    const n = o.name || '';
    if (names.some((p) => n === p || n.endsWith(p) || n.includes(p))) found = o;
  });
  return found;
}

function createFighter(template, facingSign, tintHex) {
  if (!template.scene) return null;
  const root = SkeletonUtils.clone(template.scene);
  // Normalize height so Soldier/Xbot match in the ring
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const targetH = 1.85;
  const s = size.y > 0.1 ? targetH / size.y : 1;
  root.scale.setScalar(s);
  root.rotation.y = facingSign > 0 ? Math.PI / 2 : -Math.PI / 2;

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (tintHex && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, i) => {
        const clone = m.clone();
        if (clone.color) clone.color.lerp(new THREE.Color(tintHex), 0.32);
        if (Array.isArray(o.material)) o.material[i] = clone;
        else o.material = clone;
      });
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  (template.animations || []).forEach((clip) => {
    actions[clip.name] = mixer.clipAction(clip);
  });
  const idle = actions.Idle || actions.idle || Object.values(actions)[0] || null;
  const walk = actions.Walk || actions.walk || idle;
  const run = actions.Run || actions.run || walk;
  if (idle) idle.play();

  const bones = {
    spine: findBone(root, ['mixamorigSpine', 'Spine', 'spine']),
    spine1: findBone(root, ['mixamorigSpine1', 'Spine1']),
    leftArm: findBone(root, ['mixamorigLeftArm', 'LeftArm', 'LeftUpperArm']),
    rightArm: findBone(root, ['mixamorigRightArm', 'RightArm', 'RightUpperArm']),
    leftFore: findBone(root, ['mixamorigLeftForeArm', 'LeftForeArm', 'LeftLowerArm']),
    rightFore: findBone(root, ['mixamorigRightForeArm', 'RightForeArm', 'RightLowerArm']),
    leftUpLeg: findBone(root, ['mixamorigLeftUpLeg', 'LeftUpLeg', 'LeftUpperLeg']),
    rightUpLeg: findBone(root, ['mixamorigRightUpLeg', 'RightUpLeg', 'RightUpperLeg']),
  };

  mixers.push(mixer);

  return {
    root,
    mixer,
    actions: { idle, walk, run },
    current: 'idle',
    facingSign,
    bones,
    baseX: 0,
    pose: 'idle',
    poseT: 0,
    offsetX: 0,
    offsetY: 0,
    lean: 0,
  };
}

function setAnim(actor, name) {
  if (!actor || actor.current === name) return;
  const next = actor.actions[name];
  const prev = actor.actions[actor.current];
  if (!next) return;
  next.reset().fadeIn(0.15).play();
  if (prev && prev !== next) prev.fadeOut(0.15);
  actor.current = name;
}

function setPose(actor, pose) {
  if (!actor) return;
  actor.pose = pose || 'idle';
  actor.poseT = 0.42;
  if (pose === 'idle' || !pose) {
    setAnim(actor, 'idle');
    actor.offsetX = 0;
    actor.offsetY = 0;
    actor.lean = 0;
    return;
  }
  if (pose === 'punch' || pose === 'kick') {
    setAnim(actor, 'run');
    // Big lunge so fists/legs visibly connect in the center
    actor.offsetX = (pose === 'kick' ? 0.72 : 0.78) * actor.facingSign;
    actor.offsetY = pose === 'kick' ? 0.08 : 0.04;
    actor.lean = 0.55;
    actor.poseT = 0.55;
  } else if (pose === 'block') {
    setAnim(actor, 'idle');
    actor.offsetX = -0.08 * actor.facingSign;
    actor.offsetY = -0.12;
    actor.lean = -0.12;
    actor.poseT = 0.5;
  } else if (pose === 'hit') {
    setAnim(actor, 'idle');
    actor.offsetX = -0.42 * actor.facingSign;
    actor.offsetY = 0.04;
    actor.lean = -0.55;
    actor.poseT = 0.5;
  }
}

function applyBonePose(actor, dt) {
  if (!actor) return;
  if (actor.poseT > 0) actor.poseT -= dt;
  else if (actor.pose !== 'idle' && session?.status === 'fighting') {
    setPose(actor, 'idle');
  }

  const t = Math.max(0, Math.min(1, actor.poseT / 0.55));
  const ease = t * t * (3 - 2 * t);
  const ox = actor.offsetX * ease;
  const oy = actor.offsetY * ease;
  const lean = actor.lean * ease;

  actor.root.position.x = actor.baseX + ox;
  if (actor.pose !== 'idle' || actor.poseT > 0) {
    actor.root.position.y = oy;
  }

  if (actor.pose === 'idle' && actor.poseT <= 0) {
    if (!actor.bones.spine) actor.root.rotation.z = 0;
    return;
  }

  const { bones } = actor;
  const side = actor.facingSign;

  if (bones.spine) {
    bones.spine.rotation.z = lean * 0.35 * side;
    bones.spine.rotation.x = actor.pose === 'block' ? 0.35 * ease : actor.pose === 'hit' ? -0.25 * ease : lean * 0.15;
  }
  if (bones.spine1) {
    bones.spine1.rotation.x = actor.pose === 'block' ? 0.25 * ease : 0;
  }

  if (actor.pose === 'punch') {
    if (bones.rightArm) {
      bones.rightArm.rotation.x = -1.4 * ease;
      bones.rightArm.rotation.z = -0.6 * ease * side;
    }
    if (bones.rightFore) bones.rightFore.rotation.x = -0.9 * ease;
  } else if (actor.pose === 'kick') {
    if (bones.rightUpLeg) {
      bones.rightUpLeg.rotation.x = -1.5 * ease;
      bones.rightUpLeg.rotation.z = 0.2 * ease * side;
    }
    if (bones.leftArm) bones.leftArm.rotation.x = -0.5 * ease;
  } else if (actor.pose === 'block') {
    if (bones.leftArm) {
      bones.leftArm.rotation.x = -1.2 * ease;
      bones.leftArm.rotation.z = 0.8 * ease * side;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.x = -1.2 * ease;
      bones.rightArm.rotation.z = -0.8 * ease * side;
    }
    if (bones.leftFore) bones.leftFore.rotation.x = -1.0 * ease;
    if (bones.rightFore) bones.rightFore.rotation.x = -1.0 * ease;
  } else if (actor.pose === 'hit') {
    if (bones.spine) bones.spine.rotation.x = -0.45 * ease;
    if (bones.leftArm) bones.leftArm.rotation.x = -0.4 * ease;
    if (bones.rightArm) bones.rightArm.rotation.x = -0.4 * ease;
  }

  if (!bones.spine) {
    actor.root.rotation.z = lean * 0.2 * side;
  }
}

function placeFighters() {
  // Close range so punches/kicks actually connect
  const gap = 0.52;
  if (playerActor) {
    playerActor.baseX = -gap;
    playerActor.root.position.set(-gap, 0, 0);
    playerActor.root.rotation.y = Math.PI / 2;
    setPose(playerActor, 'idle');
  }
  if (rivalActor) {
    rivalActor.baseX = gap;
    rivalActor.root.position.set(gap, 0, 0);
    rivalActor.root.rotation.y = -Math.PI / 2;
    setPose(rivalActor, 'idle');
  }
}

function applySession(data) {
  session = {
    sessionId: data.sessionId,
    level: data.level,
    prize: data.prize,
    rival: data.rival,
    playerHp: data.playerHp,
    playerMaxHp: data.playerMaxHp,
    enemyHp: data.enemyHp,
    enemyMaxHp: data.enemyMaxHp,
    round: data.round,
    maxRounds: data.maxRounds,
    status: data.status,
    totalWon: data.totalWon || 0,
  };
  credits = data.balance ?? credits;
  lastNote = data.message || '';
  setPose(playerActor, 'idle');
  setPose(rivalActor, 'idle');
  refreshHud();
}

async function loadBalance() {
  if (isPlayerMode) {
    if (menuBtn) {
      menuBtn.href = '/portal/';
      menuBtn.textContent = '← Portal';
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
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin sesión';
      subtitleEl.textContent = err.message || 'Inicia sesión';
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
    overlay.classList.remove('hidden');
    titleEl.textContent = 'Sin máquina';
    subtitleEl.textContent = err.message || 'Selecciona máquina';
  }
}

async function startFight(restart) {
  if (!playing || busy || !assetsReady) return;
  if (!isPlayerMode && !machineNumber) return;

  if (credits < bet()) {
    if (restart && session) {
      try {
        busy = true;
        if (isPlayerMode) await PlayerAuth.startCallePelea(bet(), true);
        else await MachineAPI.startCallePelea(bet(), true);
      } catch (_) { /* abandoned */ }
      finally { busy = false; }
      session = null;
      refreshHud();
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Crédito agotado. Pide recarga al cajero para volver al nivel 1.';
      showToast('Reiniciado', 'Volviste al nivel 1', null);
      return;
    }
    overlay.classList.remove('hidden');
    titleEl.textContent = 'Sin saldo';
    subtitleEl.textContent = 'Necesitas más crédito para pelear el siguiente nivel.';
    return;
  }

  busy = true;
  refreshHud();
  try {
    const data = isPlayerMode
      ? await PlayerAuth.startCallePelea(bet(), restart)
      : await MachineAPI.startCallePelea(bet(), restart);
    applySession(data);
    placeFighters();
    showToast(restart ? 'Nueva partida' : `Nivel ${data.level}`, data.message, true);
    hintEl.textContent = `vs ${data.rival.name} · elige GOLPE, PATADA o BLOQUEO`;
  } catch (err) {
    showToast('Error', err.message || 'No se pudo iniciar', false);
    if (restart) session = null;
    if ((err.message || '').includes('insuficiente')) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga al cajero.';
    }
  } finally {
    busy = false;
    refreshHud();
  }
}

async function retryFight() {
  if (!session || busy || !assetsReady) return;
  if (credits < bet()) {
    overlay.classList.remove('hidden');
    titleEl.textContent = 'Sin saldo';
    subtitleEl.textContent = 'Pide recarga para la revancha.';
    return;
  }
  busy = true;
  refreshHud();
  try {
    const data = isPlayerMode
      ? await PlayerAuth.retryCallePelea(session.sessionId)
      : await MachineAPI.retryCallePelea(session.sessionId);
    applySession(data);
    placeFighters();
    showToast('Revancha', data.message, null);
  } catch (err) {
    showToast('Error', err.message || 'No se pudo reintentar', false);
  } finally {
    busy = false;
    refreshHud();
  }
}

async function doAction(action) {
  if (!session || session.status !== 'fighting' || busy || !assetsReady) return;
  busy = true;
  refreshHud();

  setPose(playerActor, action === 'block' ? 'block' : action);
  if (action === 'punch' || action === 'kick') {
    setTimeout(showImpact, 120);
  }

  try {
    const data = isPlayerMode
      ? await PlayerAuth.actionCallePelea(session.sessionId, action)
      : await MachineAPI.actionCallePelea(session.sessionId, action);

    credits = data.balance ?? credits;
    if (data.session) {
      session = {
        sessionId: data.session.sessionId,
        level: data.session.level,
        prize: data.session.prize,
        rival: data.session.rival,
        playerHp: data.session.playerHp,
        playerMaxHp: data.session.playerMaxHp,
        enemyHp: data.session.enemyHp,
        enemyMaxHp: data.session.enemyMaxHp,
        round: data.session.round,
        maxRounds: data.session.maxRounds,
        status: data.session.status,
        totalWon: data.session.totalWon || 0,
      };
    }

    const entry = data.entry;
    if (entry) {
      const enemyPose = entry.enemyAction === 'block' ? 'block' : entry.enemyAction;
      setPose(rivalActor, enemyPose);
      lastNote = entry.note || lastNote;
      if (entry.playerDmg > 0) {
        setPose(playerActor, 'hit');
        flash = 1;
        flashLight.intensity = 2.8;
      }
      if (entry.enemyDmg > 0) {
        flash = Math.max(flash, 0.7);
        flashLight.intensity = Math.max(flashLight.intensity, 2.2);
        showImpact();
      }
    }

    setTimeout(() => {
      if (session?.status === 'fighting') {
        setPose(playerActor, 'idle');
        setPose(rivalActor, 'idle');
      }
    }, 560);

    if (data.finished) {
      if (data.won) {
        setPose(rivalActor, 'hit');
        setPose(playerActor, 'punch');
        showToast(data.awarded > 0 ? '¡KO!' : 'Victoria', data.message, true);
        hintEl.textContent = data.awarded > 0
          ? `Premio cobrado. Pulsa SIGUIENTE (cuesta ${mxn(bet())}) para el nivel ${session.level + 1}.`
          : 'Puedes seguir al siguiente nivel.';
      } else {
        setPose(playerActor, 'hit');
        showToast('Derrota', data.message, false);
        hintEl.textContent = 'REVANCHA cobra otra apuesta · REINICIAR vuelve al nivel 1.';
      }
    } else {
      hintEl.textContent = data.message || 'Siguiente movimiento…';
    }

    refreshHud();
  } catch (err) {
    showToast('Error', err.message || 'Acción inválida', false);
    setPose(playerActor, 'idle');
    setPose(rivalActor, 'idle');
  } finally {
    busy = false;
    refreshHud();
  }
}

function beginPlay() {
  if (!assetsReady) {
    showToast('Espera', 'Aún cargan los luchadores GLB…', null);
    return;
  }
  if (!isPlayerMode && !machineNumber) {
    loadBalance();
    return;
  }
  if (credits < bet()) {
    titleEl.textContent = 'Sin saldo';
    subtitleEl.textContent = 'Pide recarga al cajero.';
    return;
  }
  playing = true;
  overlay.classList.add('hidden');
  session = null;
  hintEl.textContent = 'Pulsa NIVEL 1 para pagar y pelear. Reiniciar = volver al inicio.';
  placeFighters();
  refreshHud();
}

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  for (const m of mixers) m.update(dt);
  applyBonePose(playerActor, dt);
  applyBonePose(rivalActor, dt);

  if (flash > 0) {
    flash -= dt * 2.2;
    flashLight.intensity = Math.max(0, flash * 2.5);
  } else {
    flashLight.intensity *= 0.85;
  }

  // Subtle idle bob when fighting idle
  const t = clock.elapsedTime;
  if (playerActor && playerActor.pose === 'idle') {
    playerActor.root.position.y = Math.sin(t * 3.2) * 0.015;
  }
  if (rivalActor && rivalActor.pose === 'idle') {
    rivalActor.root.position.y = Math.sin(t * 3.2 + 1.2) * 0.015;
  }

  composer.render();
  requestAnimationFrame(loop);
}

actionBtn.addEventListener('click', () => {
  if (!playing) { beginPlay(); return; }
  if (!session) { startFight(false); return; }
  if (session.status === 'level_complete') { startFight(false); return; }
  if (session.status === 'failed') { retryFight(); }
});

restartBtn.addEventListener('click', async () => {
  if (!playing || busy || !assetsReady) return;
  if (!confirm('¿Reiniciar? Volverás al nivel 1 y perderás el progreso.')) return;
  await startFight(true);
});

startBtn.addEventListener('click', beginPlay);
btnPunch.addEventListener('click', () => doAction('punch'));
btnKick.addEventListener('click', () => doAction('kick'));
btnBlock.addEventListener('click', () => doAction('block'));

betDown.addEventListener('click', () => {
  if (session && session.status === 'fighting') return;
  betIndex = Math.max(0, betIndex - 1);
  refreshHud();
});
betUp.addEventListener('click', () => {
  if (session && session.status === 'fighting') return;
  betIndex = Math.min(BETS.length - 1, betIndex + 1);
  refreshHud();
});

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, resolve, undefined, reject);
  });
}

async function boot() {
  await buildArena();
  refreshHud();
  requestAnimationFrame(loop);
  loadBalance();

  try {
    if (loadBanner) loadBanner.textContent = 'Cargando Fighter.glb…';
    const fighterGltf = await loadGltf('assets/models/Fighter.glb');
    templates.fighter.scene = fighterGltf.scene;
    templates.fighter.animations = fighterGltf.animations || [];

    if (loadBanner) loadBanner.textContent = 'Cargando Rival.glb…';
    let rivalGltf = null;
    try {
      rivalGltf = await loadGltf('assets/models/Rival.glb');
    } catch (e) {
      console.warn('Rival.glb failed, using Fighter', e);
      rivalGltf = fighterGltf;
    }
    templates.rival.scene = rivalGltf.scene;
    templates.rival.animations = rivalGltf.animations || [];

    playerActor = createFighter(templates.fighter, 1, null);
    rivalActor = createFighter(templates.rival, -1, 0xc45c26);
    if (playerActor) scene.add(playerActor.root);
    if (rivalActor) scene.add(rivalActor.root);
    placeFighters();

    assetsReady = true;
    loadBanner?.classList.add('hidden');
    hintEl.textContent = 'Luchadores GLB listos · Idle/Walk/Run + arena 3D';
    refreshHud();
  } catch (err) {
    console.error(err);
    if (loadBanner) loadBanner.textContent = 'Error cargando GLB — recarga la página';
    showToast('Error 3D', 'No se pudieron cargar los modelos GLB', false);
  }
}

boot();
