(() => {
  'use strict';

  if (typeof THREE === 'undefined') {
    document.getElementById('subtitle').textContent = 'No se pudo cargar el motor 3D. Revisa tu conexión.';
    return;
  }

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [1, 2, 5, 10, 15, 20];
  const viewEl = document.getElementById('view3d');

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
    joystick: document.getElementById('joystick'),
    joyKnob: document.getElementById('joyKnob'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toastTitle'),
    toastText: document.getElementById('toastText'),
    compass: document.getElementById('compass'),
  };

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let session = null;
  let missionEnded = false;

  const keys = Object.create(null);
  const input = { x: 0, y: 0, firing: false };
  let joyActive = false;

  const loader = new THREE.TextureLoader();
  const texHero = loader.load('assets/hero.png');
  const texRivalA = loader.load('assets/rival-a.png');
  const texRivalB = loader.load('assets/rival-b.png');
  [texHero, texRivalA, texRivalB].forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fa8d4);
  scene.fog = new THREE.FogExp2(0x9ec4e0, 0.018);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewEl.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x3d5a28, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.45);
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
  const rim = new THREE.DirectionalLight(0x88ccff, 0.35);
  rim.position.set(-18, 10, -12);
  scene.add(rim);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

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
    zoneR: 18,
    zoneMax: 45,
    zoneT: 0,
    aimAssist: 0.25,
    enemyDmg: 8,
    startedAt: 0,
    clock: new THREE.Clock(),
  };

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
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = 'rgba(' + (50 + Math.random() * 40) + ',' + (90 + Math.random() * 50) + ',' + (30 + Math.random() * 30) + ',' + (0.15 + Math.random() * 0.35) + ')';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeOperative(faceTex, bodyColor, vestColor) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe3b392, roughness: 0.55, metalness: 0.05 });
    const cloth = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.72, metalness: 0.08 });
    const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.48, metalness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.8 });

    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 6, 10), dark);
    leftLeg.position.set(-0.14, 0.48, 0);
    leftLeg.castShadow = true;
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 6, 10), dark);
    rightLeg.position.set(0.14, 0.48, 0);
    rightLeg.castShadow = true;
    g.add(leftLeg, rightLeg);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 8, 12), cloth);
    torso.position.y = 1.28;
    torso.castShadow = true;
    g.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 0.36), vestMat);
    vest.position.y = 1.32;
    vest.castShadow = true;
    g.add(vest);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.16), new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.75 }));
    pack.position.set(0, 1.32, -0.26);
    g.add(pack);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), skin);
    head.position.y = 1.9;
    head.castShadow = true;
    g.add(head);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 32),
      new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.4, metalness: 0 })
    );
    face.position.set(0, 1.9, 0.18);
    g.add(face);

    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.65, roughness: 0.35 })
    );
    rifle.position.set(0.3, 1.22, 0.36);
    g.add(rifle);

    const hpBar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x6dff7a, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    hpBar.position.y = 2.35;
    g.add(hpBar);

    g.userData = { face, hpBar, leftLeg, rightLeg, body: torso };
    return g;
  }

  function clearWorld() {
    while (worldRoot.children.length) {
      const c = worldRoot.children[0];
      worldRoot.remove(c);
      c.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose?.();
      });
    }
    world.player = null;
    world.enemies = [];
    world.bullets = [];
    world.buildings = [];
    world.barrels = [];
    world.zoneMesh = null;
  }

  function buildArena(mapSize) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(mapSize + 12, mapSize + 12),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.92, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    worldRoot.add(ground);

    // ambient fill plate
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(mapSize * 0.48, mapSize * 0.52, 64),
      new THREE.MeshBasicMaterial({ color: 0x2a4030, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    worldRoot.add(rim);

    const rooms = [
      { x: -10, z: -8, w: 6, d: 5, h: 4.2 },
      { x: 9, z: -10, w: 7, d: 5.5, h: 4.8 },
      { x: -9, z: 9, w: 6.5, d: 5, h: 4 },
      { x: 10, z: 8, w: 6, d: 5, h: 4.4 },
      { x: 0, z: 0, w: 5, d: 4, h: 3.4 },
    ];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.65, metalness: 0.05 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x7ec8e8, emissive: 0x1a4060, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.4 });

    rooms.forEach((r) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h, r.d), wallMat);
      mesh.position.set(r.x, r.h / 2, r.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      worldRoot.add(mesh);
      for (let i = 0; i < 3; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.6), winMat);
        win.position.set(r.x - r.w / 2 + 1.25 + i * 1.45, 1.7, r.z + r.d / 2 + 0.03);
        worldRoot.add(win);
      }
      world.buildings.push({
        minX: r.x - r.w / 2, maxX: r.x + r.w / 2,
        minZ: r.z - r.d / 2, maxZ: r.z + r.d / 2,
      });
    });

    // trees
    for (let i = 0; i < 10; i++) {
      const tx = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      const tz = rand(-mapSize / 2 + 2, mapSize / 2 - 2);
      if (blocked(tx, tz, 1.2) || Math.hypot(tx, tz) < 6) continue;
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
        new THREE.MeshStandardMaterial({ color: 0xc62828, metalness: 0.45, roughness: 0.35 })
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
      color: 0x5ef0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    world.zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    world.zoneMesh.rotation.x = -Math.PI / 2;
    world.zoneMesh.position.y = 0.06;
    worldRoot.add(world.zoneMesh);
  }

  function blocked(x, z, r) {
    for (const b of world.buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
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
    world.ammo = 30;
    world.reserve = 120;
    world.reloadT = 0;
    world.startedAt = performance.now();
    missionEnded = false;
    buildArena(world.mapSize);

    const half = world.mapSize / 2 - 2;
    const pMesh = makeOperative(texHero, 0x4a6741, 0x2f5a28);
    pMesh.position.set(0, 0, 6);
    worldRoot.add(pMesh);
    world.player = {
      mesh: pMesh,
      x: 0, z: 6, r: 0.45,
      hp: data.playerHp,
      maxHp: data.playerMaxHp,
      angle: Math.PI,
      speed: 7.2,
      shootCd: 0,
    };

    world.enemies = [];
    const n = data.enemies || 4;
    for (let i = 0; i < n; i++) {
      let x; let z; let tries = 0;
      do {
        x = rand(-half, half);
        z = rand(-half, half);
        tries += 1;
      } while ((Math.hypot(x - world.player.x, z - world.player.z) < 8 || blocked(x, z, 0.5)) && tries < 50);

      const mesh = makeOperative(i % 2 ? texRivalB : texRivalA, 0x6a5a48, 0x8a6a3a);
      mesh.position.set(x, 0, z);
      worldRoot.add(mesh);
      world.enemies.push({
        mesh, x, z, r: 0.45,
        hp: data.enemyHp,
        maxHp: data.enemyHp,
        angle: 0,
        speed: 3.2 + data.level * 0.12,
        shootCd: rand(0.5, 1.3),
        strafe: Math.random() < 0.5 ? 1 : -1,
      });
    }

    world.running = true;
    els.hint.textContent = `Nivel ${data.level}: elimina ${n} rivales en 3D · premio ${mxn(data.prize)}`;
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

  function fireBullet(owner, ally, dmg, speed) {
    const dir = new THREE.Vector3(Math.sin(owner.angle), 0, Math.cos(owner.angle));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: ally ? 0xb8f000 : 0xff8a1e })
    );
    mesh.position.set(owner.x + dir.x * 0.7, 1.35, owner.z + dir.z * 0.7);
    worldRoot.add(mesh);
    world.bullets.push({
      mesh,
      x: mesh.position.x,
      y: 1.35,
      z: mesh.position.z,
      vx: dir.x * speed,
      vz: dir.z * speed,
      ally,
      dmg,
      life: 1.2,
      r: 0.12,
    });
  }

  function removeBullet(b) {
    worldRoot.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.material.dispose();
  }

  function syncActor(actor) {
    actor.mesh.position.x = actor.x;
    actor.mesh.position.z = actor.z;
    actor.mesh.rotation.y = actor.angle;
    const pct = Math.max(0.01, actor.hp / actor.maxHp);
    actor.mesh.userData.hpBar.scale.x = pct;
    actor.mesh.userData.hpBar.material.color.setHex(pct > 0.45 ? 0x22cc44 : 0xff4d4d);
    actor.mesh.userData.hpBar.lookAt(camera.position);
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

    let mx = input.x;
    let mz = input.y;
    if (keys.w || keys.arrowup) mz -= 1;
    if (keys.s || keys.arrowdown) mz += 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;

    // move relative to camera yaw (approx behind player)
    const camYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    const cos = Math.cos(camYaw);
    const sin = Math.sin(camYaw);
    let wx = mx * cos - mz * sin;
    let wz = mx * sin + mz * cos;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) { wx /= mag; wz /= mag; }

    let nx = p.x + wx * p.speed * dt;
    let nz = p.z + wz * p.speed * dt;
    nx = Math.max(-half, Math.min(half, nx));
    nz = Math.max(-half, Math.min(half, nz));
    if (!blocked(nx, p.z, p.r)) p.x = nx;
    if (!blocked(p.x, nz, p.r)) p.z = nz;

    const target = nearestEnemy(p);
    if (target) {
      const desired = Math.atan2(target.x - p.x, target.z - p.z);
      let diff = desired - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.angle += diff * Math.min(1, 8 * dt * (0.4 + world.aimAssist));
    } else if (mag > 0.1) {
      p.angle = Math.atan2(wx, wz);
    }

    // walk bob
    const bob = world.running && mag > 0.1 ? Math.sin(performance.now() * 0.012) * 0.04 : 0;
    p.mesh.userData.leftLeg.rotation.x = bob * 8;
    p.mesh.userData.rightLeg.rotation.x = -bob * 8;

    if (world.reloadT > 0) {
      world.reloadT -= dt;
      if (world.reloadT <= 0) {
        const need = 30 - world.ammo;
        const take = Math.min(need, world.reserve);
        world.ammo += take;
        world.reserve -= take;
      }
    }

    p.shootCd = Math.max(0, p.shootCd - dt);
    const wantFire = input.firing || keys[' '] || keys.enter;
    if (wantFire && p.shootCd <= 0 && world.reloadT <= 0) {
      if (world.ammo > 0) {
        world.ammo -= 1;
        p.shootCd = 0.13;
        fireBullet(p, true, 18, 28);
        if (world.ammo === 0 && world.reserve > 0) world.reloadT = 1.1;
      } else if (world.reserve > 0) world.reloadT = 1.1;
    }

    for (const e of world.enemies) {
      if (e.hp <= 0) {
        e.mesh.visible = false;
        continue;
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      e.angle = Math.atan2(dx, dz);

      let move = 0;
      if (dist > 9) move = 1;
      else if (dist < 5.5) move = -0.65;
      const sx = -dz / dist * e.strafe * 0.55;
      const sz = dx / dist * e.strafe * 0.55;
      let ex = e.x + (dx / dist * move + sx) * e.speed * dt;
      let ez = e.z + (dz / dist * move + sz) * e.speed * dt;
      ex = Math.max(-half, Math.min(half, ex));
      ez = Math.max(-half, Math.min(half, ez));
      if (!blocked(ex, e.z, e.r)) e.x = ex;
      if (!blocked(e.x, ez, e.r)) e.z = ez;

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
              e.mesh.visible = false;
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

    // third-person camera
    const back = 7.5;
    const height = 4.2;
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

  function idleRender() {
    camera.position.set(10, 9, 14);
    camera.lookAt(0, 1, 0);
  }

  function loop() {
    const dt = Math.min(0.033, world.clock.getDelta());
    if (world.running) update(dt);
    else if (!world.player) idleRender();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // preview ground
  (function preview() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x4d6b3a })
    );
    g.rotation.x = -Math.PI / 2;
    worldRoot.add(g);
    const demo = makeOperative(texHero, 0x4a6741, 0x2f5a28);
    demo.position.set(0, 0, 0);
    worldRoot.add(demo);
    const r1 = makeOperative(texRivalA, 0x6a5a48, 0x8a6a3a);
    r1.position.set(2.2, 0, -1.5);
    r1.rotation.y = -0.6;
    worldRoot.add(r1);
    const r2 = makeOperative(texRivalB, 0x6a5a48, 0x8a6a3a);
    r2.position.set(-2.4, 0, -1.2);
    r2.rotation.y = 0.7;
    worldRoot.add(r2);
  })();

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
    els.restartBtn.disabled = !session || busy || world.running;

    if (world.player) {
      const pct = Math.max(0, (world.player.hp / world.player.maxHp) * 100);
      els.hpFill.style.width = pct + '%';
      els.hpText.textContent = Math.ceil(world.player.hp) + '/' + world.player.maxHp;
    } else {
      els.hpFill.style.width = '100%';
      els.hpText.textContent = '—';
    }

    els.ammoText.textContent = world.ammo + '/' + world.reserve;
    els.killCount.textContent = String(world.kills);
    const alive = (world.player && world.player.hp > 0 ? 1 : 0) + world.enemies.filter((e) => e.hp > 0).length;
    els.aliveCount.textContent = world.running ? String(alive) : '0';
    const left = Math.max(0, Math.ceil(world.zoneMax - world.zoneT));
    els.zoneTimer.textContent = world.running ? String(left).padStart(2, '0') + 's' : '—';

    if (!playing) {
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
    if (!playing || busy || world.running) return;
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
    if (!session || busy || world.running) return;
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
    if (!isPlayerMode && !machineNumber) { loadBalance(); return; }
    if (credits < bet()) {
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Pide recarga al cajero.';
      return;
    }
    playing = true;
    els.overlay.classList.add('hidden');
    session = null;
    els.hint.textContent = 'Pulsa MISIÓN 1 para pagar y entrar a la zona 3D.';
    refreshHud();
  }

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  renderer.domElement.addEventListener('mousedown', () => { input.firing = true; });
  window.addEventListener('mouseup', () => { input.firing = false; });
  els.fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.firing = true; }, { passive: false });
  els.fireBtn.addEventListener('touchend', () => { input.firing = false; });
  els.fireBtn.addEventListener('mousedown', (e) => { e.preventDefault(); input.firing = true; });

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
    if (!playing || busy || world.running) return;
    if (!confirm('¿Reiniciar? Volverás al nivel 1.')) return;
    await startMission(true);
  });
  els.startBtn.addEventListener('click', beginPlay);
  els.betDown.addEventListener('click', () => { if (world.running) return; betIndex = Math.max(0, betIndex - 1); refreshHud(); });
  els.betUp.addEventListener('click', () => { if (world.running) return; betIndex = Math.min(BETS.length - 1, betIndex + 1); refreshHud(); });

  refreshHud();
  requestAnimationFrame(loop);
  loadBalance();
})();
