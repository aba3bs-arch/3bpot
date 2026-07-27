/**
 * Calle Runner — mundo 3D (Three.js).
 * Misma lógica de carrera en game.js; aquí solo se visualiza.
 */
(function (global) {
    'use strict';

    const SCALE = 0.045;
    const ROAD_HALF = 3.2;
    const SIDEWALK = 1.4;
    const PLAYER_X_GAME = 160;
    const GROUND_Y_GAME = 340;

    let THREE;
    let renderer;
    let scene;
    let camera;
    let canvas;
    let ready = false;

    let roadGroup;
    let decorGroup;
    let dynamicGroup;
    let playerRoot;
    let playerParts = {};
    let roadMesh;
    let roadLines = [];
    let sunLight;
    let hemiLight;
    let ambientLight;
    let neonLights = [];
    let skyMesh;
    let sunMesh;
    let moonMesh;

    let builtKey = '';
    let coinMeshes = [];
    let powerMeshes = [];
    let obstacleMeshes = [];
    let goalMesh = null;
    let idleZ = 0;

    const mats = {};

    function hex(c) {
        return new THREE.Color(c);
    }

    function makeMat(key, opts) {
        if (mats[key]) return mats[key];
        mats[key] = new THREE.MeshStandardMaterial(opts);
        return mats[key];
    }

    function box(w, h, d, mat, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    function cyl(rTop, rBot, h, mat, x, y, z, seg) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 12), mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    function init(targetCanvas) {
        THREE = global.THREE;
        if (!THREE || !targetCanvas) return false;
        canvas = targetCanvas;

        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(canvas.width, canvas.height, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a2744);
        scene.fog = new THREE.Fog(0x1a2744, 22, 78);

        // Cámara chase bien lateral: se nota la profundidad 3D al instante
        camera = new THREE.PerspectiveCamera(58, canvas.width / canvas.height, 0.1, 220);
        camera.position.set(-11.5, 6.4, -6.5);

        ambientLight = new THREE.AmbientLight(0x9eb6d8, 0.55);
        scene.add(ambientLight);

        hemiLight = new THREE.HemisphereLight(0xb8d8ff, 0x3a3a40, 0.7);
        scene.add(hemiLight);

        sunLight = new THREE.DirectionalLight(0xffe2b0, 1.55);
        sunLight.position.set(-18, 28, 10);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.camera.near = 2;
        sunLight.shadow.camera.far = 80;
        sunLight.shadow.camera.left = -30;
        sunLight.shadow.camera.right = 30;
        sunLight.shadow.camera.top = 30;
        sunLight.shadow.camera.bottom = -20;
        scene.add(sunLight);

        roadGroup = new THREE.Group();
        decorGroup = new THREE.Group();
        dynamicGroup = new THREE.Group();
        scene.add(roadGroup);
        scene.add(decorGroup);
        scene.add(dynamicGroup);

        buildSky();
        buildRoad();
        buildPlayer();
        ready = true;
        buildDemoCity();

        window.addEventListener('resize', onResize);
        return true;
    }

    function buildDemoCity() {
        // Demo de noche con neón: se distingue del 2D al primer vistazo
        const night = true;
        applyTheme({ sky: '#1b2450', ground: '#2c2f3a', id: 'noche' });
        clearDecor();
        // Ciudad densa cerca del origen (visible al abrir el juego)
        for (let i = 0; i < 48; i++) {
            const b = {
                x: i * 140 + (i % 3) * 20,
                w: 150 + (i % 5) * 28,
                h: 160 + (i % 7) * 32,
                tone: (i % 10) / 10,
                windows: true,
                neon: i % 3 !== 2,
                antenna: i % 3 === 0,
                roof: i % 3,
                accent: (i % 9) / 9,
                shop: i % 2 === 0,
            };
            decorGroup.add(makeBuilding(b, -1, night));
            decorGroup.add(makeBuilding(Object.assign({}, b, {
                tone: (b.tone + 0.37) % 1,
                neon: i % 2 === 0,
                shop: i % 3 === 0,
                x: b.x + 40,
            }), 1, night));
        }
        for (let i = 0; i < 18; i++) {
            decorGroup.add(makeLamp(i * 16, night));
            const right = makeLamp(i * 16 + 2, night);
            right.position.x = ROAD_HALF + 0.35;
            decorGroup.add(right);
        }
        // Autos estacionados para dar vida
        for (let i = 0; i < 10; i++) {
            decorGroup.add(makeProp({
                x: 400 + i * 380,
                kind: 'car',
                tone: (i % 3) / 3,
                flip: i % 2 === 0,
            }));
        }
    }

    function makeFacadeTexture(tone, night, neon) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 256;
        const g = c.getContext('2d');
        const palette = night
            ? [
                [28, 34, 58], [36, 42, 72], [22, 48, 62],
                [48, 30, 58], [30, 52, 48], [52, 38, 32],
            ]
            : [
                [92, 110, 138], [120, 98, 82], [78, 120, 118],
                [140, 120, 96], [86, 96, 120], [110, 88, 108],
            ];
        const base = palette[Math.floor(tone * palette.length) % palette.length];
        g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        g.fillRect(0, 0, 128, 256);

        // Planta baja / local
        g.fillStyle = night ? '#1a1528' : '#3a3348';
        g.fillRect(0, 200, 128, 56);
        g.fillStyle = night ? '#ffb347' : '#6ec6ff';
        g.globalAlpha = night ? 0.85 : 0.55;
        g.fillRect(14, 214, 40, 28);
        g.fillRect(70, 214, 40, 28);
        g.globalAlpha = 1;

        // Ventanas en rejilla
        const cols = 4;
        const rows = 7;
        for (let r = 0; r < rows; r++) {
            for (let ccol = 0; ccol < cols; ccol++) {
                const x = 10 + ccol * 28;
                const y = 12 + r * 26;
                const lit = night ? ((r + ccol + (tone * 10 | 0)) % 5 !== 0) : true;
                if (night) {
                    g.fillStyle = lit ? '#ffd27a' : '#121826';
                    if (lit) {
                        g.shadowColor = '#ffb347';
                        g.shadowBlur = 8;
                    }
                } else {
                    g.fillStyle = lit ? 'rgba(160,210,255,0.75)' : 'rgba(30,40,55,0.55)';
                    g.shadowBlur = 0;
                }
                g.fillRect(x, y, 18, 16);
                g.shadowBlur = 0;
                g.strokeStyle = 'rgba(0,0,0,0.35)';
                g.strokeRect(x, y, 18, 16);
            }
        }

        if (neon) {
            const neonCol = tone < 0.33 ? '#ff5ea8' : tone < 0.66 ? '#5ce1ff' : '#b8ff5c';
            g.fillStyle = neonCol;
            g.shadowColor = neonCol;
            g.shadowBlur = 16;
            g.fillRect(18, 168, 92, 10);
            g.shadowBlur = 0;
            g.fillStyle = '#fff';
            g.font = 'bold 10px sans-serif';
            g.fillText('OPEN', 48, 177);
        }

        // Cornisa
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, 0, 128, 6);

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
    }

    function onResize() {
        if (!ready || !canvas) return;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        const rw = canvas.width;
        const rh = canvas.height;
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
        renderer.setSize(rw, rh, false);
    }

    function buildSky() {
        const geo = new THREE.SphereGeometry(160, 24, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x7ec8e3, side: THREE.BackSide });
        skyMesh = new THREE.Mesh(geo, mat);
        scene.add(skyMesh);

        sunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(2.4, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffe39a })
        );
        sunMesh.position.set(-40, 42, 30);
        scene.add(sunMesh);

        moonMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1.8, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xe8eeff })
        );
        moonMesh.position.set(36, 38, 20);
        moonMesh.visible = false;
        scene.add(moonMesh);
    }

    function buildRoad() {
        const asphalt = makeMat('asphalt', { color: 0x3a3d46, roughness: 0.82, metalness: 0.08 });
        const curb = makeMat('curb', { color: 0x9aa3af, roughness: 0.7, metalness: 0.05 });
        const walk = makeMat('walk', { color: 0x8a929e, roughness: 0.75, metalness: 0.04 });
        const yellow = makeMat('yellow', { color: 0xffd05a, roughness: 0.45, metalness: 0.1, emissive: 0x664400, emissiveIntensity: 0.15 });

        const len = 220;
        roadMesh = box(ROAD_HALF * 2, 0.18, len, asphalt, 0, -0.09, 0);
        roadMesh.receiveShadow = true;
        roadGroup.add(roadMesh);

        // Banquetas (locales; el grupo sigue a la cámara)
        roadGroup.add(box(SIDEWALK, 0.28, len, walk, -(ROAD_HALF + SIDEWALK / 2), 0.05, 0));
        roadGroup.add(box(SIDEWALK, 0.28, len, walk, (ROAD_HALF + SIDEWALK / 2), 0.05, 0));
        roadGroup.add(box(0.22, 0.34, len, curb, -ROAD_HALF, 0.08, 0));
        roadGroup.add(box(0.22, 0.34, len, curb, ROAD_HALF, 0.08, 0));

        roadLines = [];
        for (let i = 0; i < 36; i++) {
            const line = box(0.28, 0.04, 2.2, yellow, 0, 0.02, -90 + i * 6);
            roadGroup.add(line);
            roadLines.push(line);
        }
    }

    function buildPlayer() {
        playerRoot = new THREE.Group();
        scene.add(playerRoot);

        const skin = makeMat('skin', { color: 0xf4c9a0, roughness: 0.65 });
        const shirt = makeMat('shirt', { color: 0x2f6ed6, roughness: 0.55 });
        const pants = makeMat('pants', { color: 0x243049, roughness: 0.7 });
        const cap = makeMat('cap', { color: 0xe0453a, roughness: 0.5 });
        const shoe = makeMat('shoe', { color: 0xe94f37, roughness: 0.55 });
        const pack = makeMat('pack', { color: 0x6b45b8, roughness: 0.55 });

        playerParts.body = box(0.55, 0.72, 0.38, shirt, 0, 1.15, 0);
        playerParts.head = cyl(0.28, 0.28, 0.36, skin, 0, 1.78, 0.02, 14);
        playerParts.cap = cyl(0.3, 0.3, 0.14, cap, 0, 1.96, 0, 14);
        playerParts.bill = box(0.34, 0.06, 0.22, cap, 0, 1.92, 0.22);
        playerParts.pack = box(0.28, 0.42, 0.18, pack, 0, 1.2, -0.28);
        playerParts.legL = box(0.18, 0.55, 0.22, pants, -0.14, 0.45, 0);
        playerParts.legR = box(0.18, 0.55, 0.22, pants, 0.14, 0.45, 0);
        playerParts.shoeL = box(0.22, 0.12, 0.32, shoe, -0.14, 0.14, 0.04);
        playerParts.shoeR = box(0.22, 0.12, 0.32, shoe, 0.14, 0.14, 0.04);
        playerParts.armL = box(0.14, 0.48, 0.14, skin, -0.4, 1.2, 0);
        playerParts.armR = box(0.14, 0.48, 0.14, skin, 0.4, 1.2, 0);
        playerParts.badge = box(0.16, 0.16, 0.06, makeMat('badge', { color: 0xffd05a, emissive: 0xaa8800, emissiveIntensity: 0.35 }), 0, 1.2, 0.2);

        Object.values(playerParts).forEach((p) => playerRoot.add(p));

        playerParts.aura = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xb9ff8a, transparent: true, opacity: 0.18 })
        );
        playerParts.aura.visible = false;
        playerRoot.add(playerParts.aura);

        playerParts.shield = new THREE.Mesh(
            new THREE.SphereGeometry(1.05, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.16, wireframe: true })
        );
        playerParts.shield.visible = false;
        playerRoot.add(playerParts.shield);
    }

    function clearGroup(g) {
        while (g.children.length) {
            const c = g.children[0];
            g.remove(c);
            c.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
            });
        }
    }

    function clearDynamics() {
        clearGroup(dynamicGroup);
        coinMeshes = [];
        powerMeshes = [];
        obstacleMeshes = [];
        goalMesh = null;
    }

    function clearDecor() {
        clearGroup(decorGroup);
        neonLights.forEach((l) => scene.remove(l));
        neonLights = [];
    }

    function buildingColor(tone, night) {
        const r = 0.18 + tone * (night ? 0.12 : 0.22);
        const g = 0.2 + tone * (night ? 0.14 : 0.2);
        const b = 0.28 + tone * (night ? 0.28 : 0.22);
        return new THREE.Color(r, g, b);
    }

    function makeBuilding(b, side, night) {
        const group = new THREE.Group();
        const depth = 3.6 + b.tone * 2.8;
        const width = Math.max(2.6, b.w * SCALE * 0.95);
        const height = Math.max(5.2, b.h * SCALE * 1.55);
        const facade = makeFacadeTexture(b.tone, night, !!(b.neon && night));
        const sideCol = buildingColor(b.tone, night);
        const sideMat = new THREE.MeshStandardMaterial({
            color: sideCol,
            roughness: 0.9,
            metalness: 0.06,
        });
        const frontMat = new THREE.MeshStandardMaterial({
            map: facade,
            roughness: 0.72,
            metalness: 0.08,
            emissive: night ? 0x22180a : 0x000000,
            emissiveIntensity: night ? 0.22 : 0,
        });
        // Box materials: +x -x +y -y +z -z — fachada hacia la calle
        const matsBox = side < 0
            ? [frontMat, sideMat, sideMat, sideMat, sideMat, sideMat]
            : [sideMat, frontMat, sideMat, sideMat, sideMat, sideMat];
        const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), matsBox);
        body.position.set(0, height / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roofMat = makeMat('roof', { color: 0x1a2030, roughness: 0.92 });
        if (b.roof === 1) {
            const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, 1.2, 4), roofMat);
            roof.position.y = height + 0.5;
            roof.rotation.y = Math.PI / 4;
            group.add(roof);
        } else {
            group.add(box(width + 0.25, 0.28, depth + 0.25, roofMat, 0, height + 0.12, 0));
            if (b.roof === 2) {
                group.add(box(width * 0.4, 1.1, depth * 0.4, roofMat, width * 0.15, height + 0.7, 0));
            }
        }

        if (b.antenna) {
            group.add(box(0.06, 1.6, 0.06, makeMat('metal', { color: 0xb0b8c8, metalness: 0.6, roughness: 0.35 }), width * 0.2, height + 1.0, 0));
            const tip = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xff5555 })
            );
            tip.position.set(width * 0.2, height + 1.85, 0);
            group.add(tip);
        }

        if (b.neon && night) {
            const neonCol = b.accent < 0.33 ? 0xff5ea8 : b.accent < 0.66 ? 0x5ce1ff : 0xb8ff5c;
            const light = new THREE.PointLight(neonCol, 1.25, 16, 2);
            light.position.set(side * (ROAD_HALF + SIDEWALK + width / 2 + 0.3), height * 0.45, b.x * SCALE);
            scene.add(light);
            neonLights.push(light);
        }

        const x = side * (ROAD_HALF + SIDEWALK + 0.55 + width / 2 + b.tone * 0.8);
        group.position.set(x, 0, b.x * SCALE);
        return group;
    }

    function makeLamp(z, night) {
        const g = new THREE.Group();
        const metal = makeMat('lamp', { color: 0x2c3444, roughness: 0.55, metalness: 0.4 });
        g.add(cyl(0.08, 0.12, 4.2, metal, 0, 2.1, 0, 8));
        g.add(box(1.1, 0.08, 0.12, metal, 0.45, 4.15, 0));
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 10, 10),
            new THREE.MeshStandardMaterial({
                color: 0xffe6a1,
                emissive: 0xffcc66,
                emissiveIntensity: night ? 1.2 : 0.35,
            })
        );
        bulb.position.set(0.95, 4.05, 0);
        g.add(bulb);
        if (night) {
            const pl = new THREE.PointLight(0xffe0a0, 0.75, 16, 2);
            pl.position.copy(bulb.position);
            g.add(pl);
        }
        g.position.set(-(ROAD_HALF + 0.35), 0, z);
        return g;
    }

    function makeProp(p) {
        const g = new THREE.Group();
        const z = p.x * SCALE;
        if (p.kind === 'car') {
            const bodyCol = p.tone < 0.33 ? 0x3d6fd6 : p.tone < 0.66 ? 0xc94b3a : 0x2f9d6a;
            const body = makeMat('car' + (bodyCol | 0), { color: bodyCol, roughness: 0.4, metalness: 0.35 });
            g.add(box(1.7, 0.55, 3.4, body, 0, 0.55, 0));
            g.add(box(1.5, 0.45, 1.6, body, 0, 1.05, -0.1));
            const glass = makeMat('glass', { color: 0xaad4ff, transparent: true, opacity: 0.55, metalness: 0.3, roughness: 0.15 });
            g.add(box(1.35, 0.35, 1.3, glass, 0, 1.1, -0.05));
            const tire = makeMat('tire', { color: 0x15181e, roughness: 0.9 });
            [[-0.7, -1.1], [0.7, -1.1], [-0.7, 1.1], [0.7, 1.1]].forEach(([x, zz]) => {
                const w = cyl(0.28, 0.28, 0.18, tire, x, 0.28, zz, 10);
                w.rotation.z = Math.PI / 2;
                g.add(w);
            });
            g.position.set(p.flip ? ROAD_HALF + 1.5 : -(ROAD_HALF + 1.5), 0, z);
            g.rotation.y = p.flip ? Math.PI : 0;
        } else if (p.kind === 'bin') {
            g.add(box(0.55, 0.85, 0.55, makeMat('bin', { color: 0x3a6b52, roughness: 0.7 }), 0, 0.45, 0));
            g.position.set(-(ROAD_HALF + 0.9), 0.15, z);
        } else {
            const bush = makeMat('bush', { color: 0x3f8f5a, roughness: 0.9 });
            g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), bush));
            g.children[0].position.y = 0.45;
            g.position.set(ROAD_HALF + 0.9, 0.15, z);
        }
        return g;
    }

    function makeCoin() {
        const g = new THREE.Group();
        const mat = makeMat('coin', {
            color: 0xffd76b,
            emissive: 0xaa7700,
            emissiveIntensity: 0.45,
            metalness: 0.7,
            roughness: 0.25,
        });
        const mesh = cyl(0.28, 0.28, 0.08, mat, 0, 0, 0, 20);
        mesh.rotation.x = Math.PI / 2;
        g.add(mesh);
        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.28, 0.04, 8, 20),
            makeMat('coinRim', { color: 0xc88910, metalness: 0.8, roughness: 0.3 })
        );
        g.add(rim);
        return g;
    }

    function makePower(kind) {
        const color = kind === 'shield' ? 0x7fd8ff : kind === 'magnet' ? 0xff9ad1 : 0xffd05a;
        const g = new THREE.Group();
        const core = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.38, 0),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.7,
                roughness: 0.35,
                metalness: 0.25,
            })
        );
        g.add(core);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.55, 0.05, 8, 20),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 })
        );
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        g.userData.ring = ring;
        return g;
    }

    function makeObstacle(o) {
        const g = new THREE.Group();
        if (o.type === 'duck') {
            const pole = makeMat('pole', { color: 0x1c2433, metalness: 0.4, roughness: 0.5 });
            g.add(cyl(0.08, 0.1, 5.2, pole, 0, 2.6, 0, 8));
            const signMat = new THREE.MeshStandardMaterial({
                color: 0xc8352c,
                emissive: 0x551010,
                emissiveIntensity: 0.35,
                roughness: 0.55,
            });
            const sign = box(1.6, 2.4, 0.18, signMat, 0, 3.6, 0);
            g.add(sign);
            g.userData.kind = 'duck';
            return g;
        }

        if (o.kind === 'cono') {
            g.add(cyl(0.08, 0.45, 1.1, makeMat('cone', { color: 0xff7a2f, roughness: 0.55 }), 0, 0.55, 0, 12));
            g.add(box(0.7, 0.08, 0.7, makeMat('coneBase', { color: 0x2a2f38 }), 0, 0.04, 0));
            const stripe = cyl(0.22, 0.28, 0.12, makeMat('coneW', { color: 0xffffff }), 0, 0.55, 0, 12);
            g.add(stripe);
        } else if (o.kind === 'bote') {
            g.add(box(1.1, 1.35, 0.9, makeMat('bote', { color: 0x3f7d5c, roughness: 0.7 }), 0, 0.7, 0));
            g.add(box(1.25, 0.18, 1.0, makeMat('boteLid', { color: 0x54a179 }), 0, 1.45, 0));
        } else if (o.kind === 'caja') {
            g.add(box(1.15, 1.05, 1.15, makeMat('caja', { color: 0xb1793f, roughness: 0.85 }), 0, 0.55, 0));
        } else if (o.kind === 'hidrante') {
            g.add(cyl(0.22, 0.28, 1.15, makeMat('hyd', { color: 0xd1362b, roughness: 0.45, metalness: 0.25 }), 0, 0.6, 0, 10));
            g.add(box(0.7, 0.18, 0.28, makeMat('hyd2', { color: 0xb02820 }), 0, 0.85, 0));
        } else if (o.kind === 'llanta') {
            const tire = new THREE.Mesh(
                new THREE.TorusGeometry(0.55, 0.22, 10, 18),
                makeMat('llanta', { color: 0x22252c, roughness: 0.9 })
            );
            tire.position.y = 0.55;
            g.add(tire);
        } else {
            // valla
            g.add(box(2.4, 0.18, 0.18, makeMat('valla', { color: 0xe0e4ea }), 0, 0.45, 0));
            g.add(box(2.4, 0.18, 0.18, makeMat('valla', { color: 0xe0e4ea }), 0, 0.95, 0));
            g.add(box(0.2, 1.2, 0.2, makeMat('vallaP', { color: 0xff7a2f }), -1.0, 0.6, 0));
            g.add(box(0.2, 1.2, 0.2, makeMat('vallaP', { color: 0xff7a2f }), 1.0, 0.6, 0));
        }
        g.userData.kind = o.kind;
        return g;
    }

    function makeGoal(z) {
        const g = new THREE.Group();
        const pole = makeMat('goalPole', { color: 0x1a1f2a, metalness: 0.5, roughness: 0.4 });
        g.add(cyl(0.1, 0.12, 5.5, pole, 0, 2.75, 0, 8));
        const flag = new THREE.Group();
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 8; c++) {
                const col = (r + c) % 2 ? 0xffffff : 0x111318;
                flag.add(box(0.28, 0.28, 0.05, new THREE.MeshStandardMaterial({ color: col }), c * 0.28, -r * 0.28, 0));
            }
        }
        flag.position.set(1.15, 5.0, 0);
        g.add(flag);
        g.userData.flag = flag;
        const glow = new THREE.PointLight(0xffd05a, 1.1, 18, 2);
        glow.position.set(0, 2, 0);
        g.add(glow);
        g.position.set(0, 0, z);
        return g;
    }

    function applyTheme(theme) {
        const night = theme && (theme.id === 'noche' || theme.id === 'lluvia');
        const sky = theme && theme.sky ? theme.sky : '#7ec8e3';
        const ground = theme && theme.ground ? theme.ground : '#4d5057';

        skyMesh.material.color.set(sky);
        scene.background = new THREE.Color(sky);
        scene.fog.color.set(sky);
        scene.fog.near = night ? 16 : 28;
        scene.fog.far = night ? 65 : 95;

        if (mats.asphalt) mats.asphalt.color.set(ground);
        sunMesh.visible = !night;
        moonMesh.visible = night;

        ambientLight.intensity = night ? 0.22 : 0.45;
        hemiLight.intensity = night ? 0.25 : 0.55;
        sunLight.intensity = night ? 0.25 : 1.35;
        sunLight.color.set(night ? 0x8899cc : 0xffe2b0);
        renderer.toneMappingExposure = night ? 0.9 : 1.08;
        return night;
    }

    function rebuild(track, theme) {
        if (!ready || !track) return;
        const key = (track.cfg && track.cfg.seed) + ':' + track.goalPx + ':' + ((theme && theme.id) || '');
        if (key === builtKey) return;
        builtKey = key;

        clearDynamics();
        clearDecor();

        const night = applyTheme(theme || {});

        const buildings = track.buildings || [];
        for (let i = 0; i < buildings.length; i += 1) {
            if (i % 2 === 1) continue; // densidad media
            const b = buildings[i];
            const side = (i % 4 === 0) ? -1 : 1;
            decorGroup.add(makeBuilding(b, side, night));
            const mirror = Object.assign({}, b, { tone: (b.tone + 0.35) % 1, neon: night && i % 6 === 0 });
            decorGroup.add(makeBuilding(mirror, -side, night));
        }

        (track.lamps || []).forEach((l, i) => {
            if (i % 2 !== 0) return;
            decorGroup.add(makeLamp(l.x * SCALE, night));
            const right = makeLamp(l.x * SCALE + 1.5, night);
            right.position.x = ROAD_HALF + 0.35;
            decorGroup.add(right);
        });

        (track.props || []).forEach((p, i) => {
            if (i % 2 !== 0) return;
            decorGroup.add(makeProp(p));
        });

        (track.coins || []).forEach((c) => {
            const mesh = makeCoin();
            mesh.userData.ref = c;
            dynamicGroup.add(mesh);
            coinMeshes.push(mesh);
        });
        (track.powers || []).forEach((p) => {
            const mesh = makePower(p.kind);
            mesh.userData.ref = p;
            dynamicGroup.add(mesh);
            powerMeshes.push(mesh);
        });
        (track.obstacles || []).forEach((o) => {
            const mesh = makeObstacle(o);
            mesh.userData.ref = o;
            dynamicGroup.add(mesh);
            obstacleMeshes.push(mesh);
        });
        goalMesh = makeGoal(track.goalPx * SCALE);
        dynamicGroup.add(goalMesh);
    }

    function gameYToWorld(gameY) {
        // gameY is canvas Y (0 top). Coins use absolute canvas y; player jump uses run.y up from ground.
        return Math.max(0.3, (GROUND_Y_GAME - gameY) * SCALE);
    }

    function updatePlayer(run) {
        if (!run) {
            playerRoot.position.set(0, 0, idleZ + PLAYER_X_GAME * SCALE);
            return;
        }
        const z = (run.x + PLAYER_X_GAME) * SCALE;
        const y = run.y * SCALE;
        const ducking = run.ducking && run.y === 0;
        const swing = Math.sin(run.phase) * (run.y > 0 ? 0.25 : 1);

        playerRoot.position.set(0, y, z);
        playerRoot.scale.set(1, ducking ? 0.62 : 1, 1);
        playerRoot.rotation.z = ducking ? 0.35 : Math.sin(run.phase) * 0.04;

        playerParts.legL.rotation.x = swing * 0.9;
        playerParts.legR.rotation.x = -swing * 0.9;
        playerParts.armL.rotation.x = -swing * 0.8;
        playerParts.armR.rotation.x = swing * 0.8;

        if (mats.shirt) mats.shirt.color.set(run.hero > 0 ? 0x7ee081 : 0x2f6ed6);
        if (mats.cap) mats.cap.color.set(run.hero > 0 ? 0x2f6ed6 : 0xe0453a);

        playerParts.aura.visible = run.hero > 0;
        playerParts.shield.visible = run.shield > 0;
        if (run.shield > 0) playerParts.shield.rotation.y += 0.08;

        playerRoot.visible = true;
        if (run.invuln > 0) {
            playerRoot.visible = Math.floor(run.invuln * 12) % 2 === 0;
        }
    }

    function updateDynamics(run, t) {
        const camZ = run ? (run.x + PLAYER_X_GAME) * SCALE : idleZ;

        coinMeshes.forEach((m) => {
            const c = m.userData.ref;
            if (!c || c.taken) {
                m.visible = false;
                return;
            }
            m.visible = Math.abs(c.x * SCALE - camZ) < 60;
            m.position.set(0.2, gameYToWorld(c.y), c.x * SCALE);
            m.rotation.y = c.spin || t * 3;
        });

        powerMeshes.forEach((m) => {
            const p = m.userData.ref;
            if (!p || p.taken) {
                m.visible = false;
                return;
            }
            m.visible = Math.abs(p.x * SCALE - camZ) < 60;
            const bob = Math.sin(t * 3 + p.x) * 0.15;
            m.position.set(-0.15, gameYToWorld(p.y) + bob, p.x * SCALE);
            m.rotation.y = t * 2;
            if (m.userData.ring) m.userData.ring.rotation.z = t * 3;
        });

        obstacleMeshes.forEach((m) => {
            const o = m.userData.ref;
            if (!o || o.dead) {
                m.visible = false;
                return;
            }
            m.visible = Math.abs(o.x * SCALE - camZ) < 70;
            if (o.type === 'duck') {
                m.position.set(0, 0, o.x * SCALE);
            } else {
                m.position.set(0, 0, o.x * SCALE);
            }
        });

        if (goalMesh) {
            goalMesh.visible = Math.abs(goalMesh.position.z - camZ) < 80;
            if (goalMesh.userData.flag) {
                goalMesh.userData.flag.rotation.y = Math.sin(t * 4) * 0.15;
            }
        }

        // Carretera infinita: el grupo sigue al jugador; las líneas ciclan en local
        roadGroup.position.z = camZ;
        roadLines.forEach((line, i) => {
            let lz = -90 + i * 6 - (camZ % 6);
            if (lz < -96) lz += 216;
            if (lz > 120) lz -= 216;
            line.position.z = lz;
        });
    }

    function updateCamera(run, theme) {
        const z = run ? (run.x + PLAYER_X_GAME) * SCALE : idleZ;
        const speedBoost = run && (run.turbo > 0 || run.hero > 0) ? 1.15 : 1;
        const shake = run && run.shake > 0 ? run.shake : 0;
        const sx = (Math.random() - 0.5) * shake * 0.6;
        const sy = (Math.random() - 0.5) * shake * 0.4;

        const target = new THREE.Vector3(
            -12.2 * speedBoost + sx,
            6.8 + sy + (run && run.y > 0 ? 0.5 : 0),
            z - 7.2
        );
        camera.position.lerp(target, 0.16);
        camera.lookAt(0.2, 2.1 + (run ? run.y * SCALE * 0.35 : 0), z + 14);

        if (run && run.flash > 0) {
            renderer.toneMappingExposure = 1.6;
        } else {
            const night = theme && (theme.id === 'noche' || theme.id === 'lluvia');
            renderer.toneMappingExposure = night ? 0.9 : 1.08;
        }
    }

    function sync(state) {
        if (!ready) return false;
        const { run, track, session, dt } = state || {};
        const theme = (session && session.theme) || { sky: '#7ec8e3', ground: '#4d5057', id: 'barrio' };
        const t = performance.now() / 1000;

        if (track) rebuild(track, theme);
        else applyTheme(theme);

        if (!run) {
            // Recorre un tramo de ciudad en bucle (no se va al vacío)
            idleZ = (idleZ + (dt || 0.016) * 9) % 180;
            updatePlayer(null);
            updateDynamics(null, t);
            updateCamera(null, theme);
        } else {
            updatePlayer(run);
            updateDynamics(run, t);
            updateCamera(run, theme);
            if (run.state === 'crashed') {
                renderer.setClearColor(0x3a1010, 1);
            } else {
                renderer.setClearColor(theme.sky || 0x7ec8e3, 1);
            }
        }

        // Sky follows camera
        if (skyMesh) skyMesh.position.copy(camera.position);
        renderer.render(scene, camera);
        return true;
    }

    function isReady() {
        return ready;
    }

    function resetTrack() {
        builtKey = '';
        clearDynamics();
        clearDecor();
    }

    global.CalleRunner3D = {
        init,
        sync,
        resetTrack,
        isReady,
    };
})(typeof window !== 'undefined' ? window : globalThis);
