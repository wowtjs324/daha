import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/OutputPass.js';
import { Line2 } from 'https://unpkg.com/three@0.158.0/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'https://unpkg.com/three@0.158.0/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'https://unpkg.com/three@0.158.0/examples/jsm/lines/LineGeometry.js';
import {
  buildAutoLinks, clusterNodes, initSearch,
  trackEvent, buildActivityMap, showTimelinePanel, makeEditPanel,
} from './vault-features.js';
import { syncFromCloud, saveToCloud, isConfigured as cloudEnabled } from './cloud-sync.js';

// ===== 카테고리 색상 =====
const CAT_COLORS = {
  AETHER: '#7fb3ff', ARC: '#4dd8e0',  ASTRAL: '#a080ff',
  CIPHER: '#4fcc88', CORE: '#ff8844', ECHO: '#44eeff',
  LUMEN: '#ffee55', MEMORY: '#ff88aa', NEON: '#88ff88',
  NEXUS: '#ff4466', ORBIT: '#88ccff', PULSE: '#ff44ff',
  QUANTUM: '#aaf066', SHADOW: '#889999', SIGNAL: '#aaff44',
  SPECTRAL: '#ffaa00', SYNTH: '#00ffaa', VOID: '#7799cc',
  ZENITH: '#dde8ff',
  // 파일 타입 카테고리
  IMAGE: '#ff88cc', CAD: '#44ffcc', DESIGN: '#ffaa55',
  DOCUMENT: '#ffdd66', MEDIA: '#bb88ff',
  OTHER: '#aaaaaa',
};

// ===== 호버 라벨 =====
const label = document.createElement('div');
Object.assign(label.style, {
  position: 'absolute', color: 'white', fontFamily: 'sans-serif',
  fontSize: '13px', pointerEvents: 'none', display: 'none',
  padding: '5px 10px', background: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: '8px',
});
document.body.appendChild(label);

// ===== 우측 슬라이드 사이드 패널 =====
const sidePanel = document.createElement('div');
Object.assign(sidePanel.style, {
  position: 'fixed', right: '-360px', top: '0',
  width: '320px', height: '100vh',
  background: 'rgba(8,12,24,0.96)',
  backdropFilter: 'blur(24px)', webkitBackdropFilter: 'blur(24px)',
  borderLeft: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
  transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
  zIndex: '210', overflowY: 'auto', overflowX: 'hidden',
  color: 'white', fontFamily: "'Helvetica Neue',Helvetica,sans-serif",
  boxSizing: 'border-box',
});
document.body.appendChild(sidePanel);

// ===== 접기 토글 버튼 =====
const toggleBtn = document.createElement('button');
Object.assign(toggleBtn.style, {
  position: 'absolute', left: '20px', top: '20px',
  padding: '6px 14px',
  background: 'rgba(0,0,0,0.5)',
  backdropFilter: 'blur(20px)', webkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  color: 'rgba(255,255,255,0.65)',
  cursor: 'pointer', zIndex: '160',
  fontSize: '11px', letterSpacing: '2px',
  fontFamily: 'sans-serif', fontWeight: '700',
});
toggleBtn.textContent = 'VAULT ▾';
document.body.appendChild(toggleBtn);

// ===== 좌측 네비게이션 패널 =====
const navPanel = document.createElement('div');
Object.assign(navPanel.style, {
  position: 'absolute', left: '20px', top: '56px',
  width: '200px',
  maxHeight: 'calc(100vh - 76px)',
  borderRadius: '16px',
  backdropFilter: 'blur(20px)', webkitBackdropFilter: 'blur(20px)',
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white', fontFamily: 'sans-serif',
  zIndex: '150', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  transition: 'max-height 0.35s ease, opacity 0.25s ease',
});
document.body.appendChild(navPanel);

let panelOpen = true;
toggleBtn.addEventListener('click', e => {
  e.stopPropagation();
  panelOpen = !panelOpen;
  navPanel.style.maxHeight = panelOpen ? 'calc(100vh - 76px)' : '0px';
  navPanel.style.opacity = panelOpen ? '1' : '0';
  toggleBtn.textContent = panelOpen ? 'VAULT ▾' : 'VAULT ▸';
});

// ===== ④ 배경 그라디언트 — CSS + 투명 캔버스 =====
document.body.style.background = 'linear-gradient(170deg, #080c18 0%, #0b1228 45%, #080e1c 100%)';
document.body.style.minHeight = '100vh';

// ===== Scene =====
const scene = new THREE.Scene();
const nodeGroup = new THREE.Group();
scene.add(nodeGroup);
// scene.background 제거 → CSS gradient가 배경
scene.fog = new THREE.FogExp2(0x080c18, 0.005);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 20000);
camera.position.set(0, 10, 80);
camera.lookAt(0, 6, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,                   // ④ CSS 그라디언트 배경 투과
  logarithmicDepthBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // ① bloom용 HDR 톤매핑
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x080c18, 1);                  // 다크 네이비 배경
document.body.appendChild(renderer.domElement);

// ===== ① Bloom — EffectComposer =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.75,   // strength  (골드+이미시브 강조)
  0.55,   // radius
  0.72    // threshold (더 낮게 → 이미시브 더 잘 빔)
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ===== 조명 =====
scene.add(new THREE.AmbientLight(0xf5ede0, 1.4));

const skyFill = new THREE.DirectionalLight(0xd0e8f8, 1.6);
skyFill.position.set(-40, 80, 60);
scene.add(skyFill);

const topLight = new THREE.SpotLight(0xfff6e0, 2200);
topLight.position.set(55, 280, -60);
topLight.angle = Math.PI * 0.09;
topLight.penumbra = 0.12;
topLight.decay = 1.0;
topLight.distance = 10000;
topLight.castShadow = true;
topLight.shadow.mapSize.set(4096, 4096);
topLight.shadow.bias = -0.0005;
const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, 0);
scene.add(lightTarget);
topLight.target = lightTarget;
scene.add(topLight);

const sunLight = new THREE.DirectionalLight(0xfff0cc, 5);
sunLight.position.set(55, 280, -60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 800;
sunLight.shadow.camera.left  = -80;
sunLight.shadow.camera.right =  80;
sunLight.shadow.camera.top   =  80;
sunLight.shadow.camera.bottom = -80;
scene.add(sunLight.target);
scene.add(sunLight);

// ===== 공기 파티클 =====
const PARTICLE_COUNT = 420;
const pPositions  = new Float32Array(PARTICLE_COUNT * 3);
const pVelocities = new Float32Array(PARTICLE_COUNT * 3);
const pPhases     = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const i3 = i * 3;
  pPositions[i3]   = (Math.random() - 0.5) * 80;
  pPositions[i3+1] = Math.random() * 55 - 14;
  pPositions[i3+2] = (Math.random() - 0.5) * 80;
  pVelocities[i3]   = (Math.random() - 0.5) * 0.007;
  pVelocities[i3+1] = Math.random() * 0.005 + 0.0015;
  pVelocities[i3+2] = (Math.random() - 0.5) * 0.007;
  pPhases[i] = Math.random() * Math.PI * 2;
}
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0xc8e4ff, size: 0.13, transparent: true, opacity: 0.30,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const dustParticles = new THREE.Points(particleGeo, particleMat);
scene.add(dustParticles);

// ===== 바닥 반사 플레인 =====
const reflPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshPhysicalMaterial({
    color: 0xfff5ea, metalness: 0.85, roughness: 0.08,
    transparent: true, opacity: 0.20, reflectivity: 1.0,
  })
);
reflPlane.rotation.x = -Math.PI / 2;
reflPlane.position.y = -10.3;
scene.add(reflPlane);

// ===== 바닥 그리스 키(메안더) 무늬 =====
const floorPatternMesh = (() => {
  const W = 2048, H = 2048;
  const cx = W / 2, cy = H / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // N=86 → 밴드 폭 ≈ 28.5px (N=43의 절반)
  const N       = 86;
  const rCenter = 780;
  const s       = (2 * Math.PI * rCenter) / (4 * N);  // ≈ 14.25px
  const rOuter  = rCenter + s;                          // ≈ 808
  const rInner  = rCenter - s;                          // ≈ 751
  const a0      = -Math.PI / 2;

  function toXY(tStep, rStep) {
    const angle = a0 + (tStep * s) / rCenter;
    const r     = rCenter + rStep * s;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function drawAll(lineW, blur, color) {
    ctx.lineWidth   = lineW;
    ctx.strokeStyle = color;
    ctx.shadowColor = 'rgba(255,150,0,0.95)';
    ctx.shadowBlur  = blur;
    ctx.lineCap     = 'square';
    ctx.lineJoin    = 'miter';
    ctx.beginPath();
    const [sx, sy] = toXY(0, 0);
    ctx.moveTo(sx, sy);
    for (let i = 0; i < N; i++) {
      const t = i * 4;
      for (const [ts, rs] of [
        [t+1,  0], [t+1,  1], [t+3,  1],
        [t+3, -1], [t+4, -1], [t+4,  0],
      ]) {
        const [x, y] = toXY(ts, rs);
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    // 내·외 테두리 원
    ctx.lineCap   = 'round';
    ctx.lineWidth = s * 0.38;
    ctx.beginPath(); ctx.arc(cx, cy, rOuter + s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rInner - s * 0.28, 0, Math.PI * 2); ctx.stroke();
  }

  drawAll(s * 0.80, 22, 'rgba(255,205,60,0.85)');  // 글로우 패스
  ctx.shadowBlur = 0;
  drawAll(s * 0.60,  0, 'rgba(255,250,200,1.0)');   // 선명 코어 패스

  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.01,
      depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -8.0, 0); // 링(y=-8)과 동일 높이
  mesh.renderOrder = 999;
  scene.add(mesh);
  return mesh;
})();

// ===== ③ 노드 글로우 스프라이트 공유 텍스처 =====
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// ===== 텍스처 + GLB 로더 =====
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const wallTex = textureLoader.load('./wall.jpg');
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(1, 1);

const marbleTex = textureLoader.load('./marble.jpg');
marbleTex.wrapS = marbleTex.wrapT = THREE.RepeatWrapping;
marbleTex.repeat.set(8, 8);

loader.load('./20260601 ai space.glb', gltf => {
  const model = gltf.scene;
  model.scale.set(2, 2, 2);
  model.position.set(0, -6, -6);
  model.traverse(child => {
    if (child.isMesh) {
      child.castShadow = child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
        if (!mat) return;
        mat.map = wallTex;
        mat.color = new THREE.Color(0xf2ede4);
        mat.roughness = 0.7;
        mat.metalness = 0.0;
        mat.needsUpdate = true;
      });
    }
  });
  scene.add(model);
});

loader.load('./floor_v2.glb', gltf => {
  const floor = gltf.scene;
  floor.scale.set(2, 2, 2);
  floor.position.set(0, -10, -6);
  floor.traverse(child => {
    if (child.isMesh) { child.castShadow = false; child.receiveShadow = true; }
  });
  scene.add(floor);

  const ringGeo = new THREE.TorusGeometry(20, 0.1, 16, 120);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.9 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -8;
  scene.add(ring);

  const baseGeo = new THREE.TorusGeometry(50, 0.3, 16, 180);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.8 }));
  base.scale.set(1, 1.3, 1);
  base.rotation.x = Math.PI / 2;
  scene.add(base);
});

// ===== 바닥 황금 글로우 =====
const floorGlow = new THREE.PointLight(0xffb030, 6, 100);
floorGlow.position.set(0, -3, 0);
scene.add(floorGlow);


// ===== 천장 기어/기계식 링 구조 =====
{
  const gMat = (op) => new THREE.MeshBasicMaterial({
    color: 0xd4a030, transparent: true, opacity: op,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // 동심 링 4개
  [
    { r: 18, t: 0.22, y: 64 },
    { r: 30, t: 0.18, y: 67 },
    { r: 44, t: 0.14, y: 62 },
    { r: 58, t: 0.10, y: 65 },
  ].forEach(({ r, t, y }) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 120), gMat(0.75));
    m.rotation.x = Math.PI / 2; m.position.y = y; scene.add(m);
  });

  // 방사형 스포크
  for (let i = 0; i < 16; i++) {
    const a   = (i / 16) * Math.PI * 2;
    const len = i % 4 === 0 ? 40 : i % 2 === 0 ? 28 : 20;
    const m   = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, len, 5),
      gMat(i % 4 === 0 ? 0.65 : 0.4)
    );
    m.position.set(Math.cos(a) * len / 2, 65, Math.sin(a) * len / 2);
    m.rotation.z = Math.PI / 2; m.rotation.y = a;
    scene.add(m);
  }

  // 중심 허브
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.5, 32), gMat(0.9));
  hub.position.y = 65; scene.add(hub);
}

// ===== 사이드 기어링 (좌우 벽면 오러리) =====
{
  const sgMat = (op) => new THREE.MeshBasicMaterial({
    color: 0xc8a030, transparent: true, opacity: op,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  function addGear(bx, by, bz, rings, spokeN) {
    rings.forEach(({ r, t, op = 0.50 }) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 64), sgMat(op));
      m.position.set(bx, by, bz);
      m.rotation.y = Math.PI / 2;   // 벽면 방향
      scene.add(m);
    });
    const outerR = rings[rings.length - 1].r;
    for (let i = 0; i < spokeN; i++) {
      const a    = (i / spokeN) * Math.PI * 2;
      const len  = outerR * 1.25;
      const half = len / 2;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, len, 5),
        sgMat(i % 4 === 0 ? 0.50 : 0.28)
      );
      m.position.set(bx, by + Math.cos(a) * half, bz + Math.sin(a) * half);
      m.rotation.x = -a;
      scene.add(m);
    }
    const hubM = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), sgMat(0.8));
    hubM.position.set(bx, by, bz);
    scene.add(hubM);
  }

  [-1, 1].forEach(side => {
    const bx = side * 62;

    // 큰 기어 (중앙~하단)
    addGear(bx, 12, -5, [
      { r: 14, t: 0.20 }, { r: 22, t: 0.14 }, { r: 30, t: 0.10 }, { r: 38, t: 0.07 }
    ], 12);

    // 작은 기어 (상단)
    addGear(bx, 35, -8, [
      { r: 9, t: 0.16 }, { r: 15, t: 0.11 }, { r: 21, t: 0.08 }
    ], 8);

    // 연결 링 (두 기어 사이)
    const connM = new THREE.Mesh(new THREE.TorusGeometry(5, 0.07, 6, 30), sgMat(0.35));
    connM.position.set(bx, 23, -6.5);
    connM.rotation.y = Math.PI / 2;
    scene.add(connM);

    // 행성/구 장식 (오러리 느낌)
    [
      { y: 17, z: 22,  r: 2.5 },
      { y: 30, z: -20, r: 1.8 },
      { y: 38, z:  7,  r: 1.2 },
    ].forEach(({ y, z, r }) => {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(r, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0x7090c0, roughness: 0.65, metalness: 0.25 })
      );
      p.position.set(bx, y, z);
      scene.add(p);
    });
  });
}

// ===== 딥 우주 스카이돔 (딥 네이비 + 청록 성운 + 별자리) =====
let spaceSkydome = null;
const spaceDecor = [];   // animate에서 회전시킬 성운 링들

{
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // ── 딥 네이비 베이스 ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    '#010612'); bg.addColorStop(0.35, '#020b1e');
  bg.addColorStop(0.65, '#030e24'); bg.addColorStop(1,    '#01080e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // ── 성운 헬퍼 ──
  const neb = (cx, cy, rx, ry, r, g, b, a) => {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0,    `rgba(${r},${g},${b},${a})`);
    gr.addColorStop(0.45, `rgba(${r},${g},${b},${(a*0.35).toFixed(2)})`);
    gr.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.save(); ctx.scale(1, ry / rx);
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.arc(cx, cy * rx / ry, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // 청록/시안 성운 (주인공)
  neb(280,  430, 420, 280, 0, 195, 215, 0.58);
  neb(730,  285, 310, 215, 0, 170, 190, 0.50);
  neb(1490, 530, 400, 260, 0, 180, 200, 0.55);
  neb(1900, 370, 270, 190, 0, 160, 180, 0.44);
  neb(1060, 205, 190, 140, 0, 205, 225, 0.40);
  neb(580,  840, 220, 155, 0, 175, 200, 0.38);
  // 보라/인디고 성운 (깊이감 포인트)
  neb(510,  175, 230, 165, 115, 45, 195, 0.44);
  neb(1260, 730, 300, 210, 130, 35, 215, 0.50);
  neb(960,  490, 170, 130,  90, 20, 170, 0.35);
  neb(1730, 690, 320, 215,  28, 68, 215, 0.54);

  // 은하수 밴드 (대각 흐름)
  const mw = ctx.createLinearGradient(0, H * 0.22, W, H * 0.78);
  mw.addColorStop(0,    'rgba(0,0,0,0)');      mw.addColorStop(0.25, 'rgba(10,40,80,0.16)');
  mw.addColorStop(0.5,  'rgba(15,65,105,0.26)'); mw.addColorStop(0.75, 'rgba(10,40,80,0.16)');
  mw.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = mw; ctx.fillRect(0, 0, W, H);

  // ── 별 산포 (청록 + 흰색 혼합) ──
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const big  = Math.random() < 0.04;
    const r    = big ? Math.random() * 2.2 + 0.9 : Math.random() * 0.55 + 0.1;
    const v    = Math.floor(200 + Math.random() * 55);
    const cyan = Math.random() < 0.14;
    const [sr, sg, sb] = cyan ? [80, v, v] : [v, Math.floor(v * 0.87), 255];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${sr},${sg},${sb},${(Math.random() * 0.6 + 0.4).toFixed(2)})`; ctx.fill();
  }

  // 밝은 별 글로우 (시안 + 흰색)
  for (let i = 0; i < 26; i++) {
    const x  = Math.random() * W, y = Math.random() * H, sz = Math.random() * 14 + 5;
    const cyan = Math.random() < 0.38;
    const g  = ctx.createRadialGradient(x, y, 0, x, y, sz);
    if (cyan) {
      g.addColorStop(0, 'rgba(200,255,255,0.98)'); g.addColorStop(0.3, 'rgba(0,215,235,0.42)'); g.addColorStop(1, 'rgba(0,165,195,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(0.3, 'rgba(175,215,255,0.42)'); g.addColorStop(1, 'rgba(65,140,255,0)');
    }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
  }

  // ── 별자리 ──
  const constell = (stars, edges) => {
    ctx.strokeStyle = 'rgba(100,220,240,0.30)'; ctx.lineWidth = 0.85; ctx.setLineDash([4, 10]);
    edges.forEach(([a, b]) => {
      ctx.beginPath(); ctx.moveTo(stars[a][0], stars[a][1]);
      ctx.lineTo(stars[b][0], stars[b][1]); ctx.stroke();
    });
    ctx.setLineDash([]);
    stars.forEach(([x, y]) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 8);
      gr.addColorStop(0, 'rgba(210,250,255,0.95)'); gr.addColorStop(0.35, 'rgba(80,215,235,0.50)'); gr.addColorStop(1, 'rgba(0,175,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    });
  };
  // 오리온
  constell([[1375,645],[1455,600],[1345,555],[1428,512],[1390,682],[1452,762],[1318,758],[1390,718],[1418,708],[1362,708]],[[0,4],[1,3],[4,7],[7,8],[8,9],[9,7],[4,5],[4,6],[0,1]]);
  // 큰곰자리
  constell([[195,198],[282,177],[355,196],[426,236],[458,297],[406,358],[322,380]],[[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]);
  // 카시오페이아
  constell([[895,115],[972,180],[1046,126],[1116,182],[1188,116]],[[0,1],[1,2],[2,3],[3,4]]);
  // 전갈자리
  constell([[1698,192],[1760,246],[1720,306],[1778,356],[1746,416],[1696,456],[1646,476],[1696,516],[1746,546]],[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]]);
  // 거문고자리 (베가)
  constell([[655,496],[632,556],[706,577],[716,517]],[[0,1],[1,2],[2,3],[3,0]]);
  // 페가수스
  constell([[1548,298],[1648,278],[1678,378],[1578,398]],[[0,1],[1,2],[2,3],[3,0]]);

  spaceSkydome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 64, 32),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, depthWrite: false })
  );
  scene.add(spaceSkydome);

  // 실내 시안 별 파티클
  const N = 320;
  const sPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r     = 18 + Math.random() * 55;
    sPos[i*3]   = r * Math.cos(theta);
    sPos[i*3+1] = Math.random() * 68 - 8;
    sPos[i*3+2] = r * Math.sin(theta);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
    color: 0x90eeff, size: 0.24, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // 실내 청록 성운 링 (천천히 회전)
  [
    { r: 58, y: 28, rx: Math.PI * 0.08, ry: 0,            op: 0.14, col: 0x00d8f0 },
    { r: 48, y: 42, rx: Math.PI * 0.12, ry: Math.PI * 0.3, op: 0.10, col: 0x00c8e0 },
    { r: 72, y: 14, rx: Math.PI * 0.05, ry: Math.PI * 0.6, op: 0.08, col: 0x30d4ec },
  ].forEach(({ r, y, rx, ry, op, col }) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.35, 8, 120),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = rx; m.rotation.y = ry; m.position.y = y;
    spaceDecor.push(m); scene.add(m);
  });
}

// ===== [REMOVED placeholder] =====
if (false) {
  // 패널 텍스처: 중앙이 밝고 가장자리로 갈수록 투명한 그라디언트
  const panTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0,   'rgba(255,255,255,0)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.55)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512);
    return new THREE.CanvasTexture(c);
  })();

  const mkPanelMat = () => new THREE.MeshBasicMaterial({
    map: panTex, color: 0xffffff,
    transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // 레퍼런스처럼 나선형으로 배치 — 반지름, 시작각, 호 길이, 높이, y위치
  const panels = [
    { r: 38, start: -0.3,        span: Math.PI * 0.68, h: 100, y: 20 },
    { r: 32, start: Math.PI*0.5, span: Math.PI * 0.62, h:  82, y: 24 },
    { r: 44, start: Math.PI*1.1, span: Math.PI * 0.72, h:  88, y: 14 },
    { r: 27, start: Math.PI*1.8, span: Math.PI * 0.52, h:  65, y: 30 },
    { r: 50, start: Math.PI*0.2, span: Math.PI * 0.45, h:  70, y:  8 },
  ];
  for (const { r, start, span, h, y } of panels) {
    const geo = new THREE.CylinderGeometry(r, r, h, 80, 1, true, start, span);
    const m = new THREE.Mesh(geo, mkPanelMat());
    m.position.y = y;
    scene.add(m);
  }
}

// ===== [REMOVED: constellation panels] =====
if (false) {
  const makeConstellTex = (seed) => {
    const W = 512, H = 768;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(4,8,22,0.92)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,130,230,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = 'rgba(80,130,230,0.15)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(12, 12, W - 24, H - 24);

    // 별 위치 (seed로 패턴 변형)
    const rng = (n) => ((Math.sin(n * seed * 127.1 + 311.7) * 43758.5) % 1 + 1) % 1;
    const stars = Array.from({ length: 22 }, (_, i) => [
      40 + rng(i * 3) * (W - 80),
      40 + rng(i * 3 + 1) * (H - 80),
    ]);
    const edges = [[0,1],[1,2],[2,3],[3,4],[4,5],[2,6],[6,7],[7,8],[0,9],[9,10],[10,11],[5,12],[12,13],[8,14],[14,15]];

    ctx.strokeStyle = 'rgba(100,160,255,0.22)';
    ctx.lineWidth = 0.8;
    for (const [a, b] of edges) {
      if (!stars[a] || !stars[b]) continue;
      ctx.beginPath(); ctx.moveTo(stars[a][0], stars[a][1]);
      ctx.lineTo(stars[b][0], stars[b][1]); ctx.stroke();
    }
    for (const [x, y] of stars) {
      const r = 1.5 + rng(x) * 2.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(180,210,255,0.4)');
      g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,180,255,0.55)';
    ctx.font = '10px monospace';
    ctx.fillText(seed === 1 ? 'ORION · ΔRA 05h 35m' : 'BOÖTES · VIRGO ΔRA 14h', 18, H - 28);
    ctx.fillStyle = 'rgba(80,140,220,0.40)';
    ctx.fillText('CONSTELLATION MAP', 18, H - 14);
    return new THREE.CanvasTexture(c);
  };

  const panelGeo = new THREE.PlaneGeometry(9, 13);
  [-1, 1].forEach((side, idx) => {
    const mat = new THREE.MeshBasicMaterial({
      map: makeConstellTex(idx + 1),
      transparent: true, opacity: 0.82,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(panelGeo, mat);
    m.position.set(side * 34, 6, -12);
    m.rotation.y = side * -0.45;
    scene.add(m);
  });
}

// ===== [REMOVED: ceiling rings] =====
if (false) {
  const gold = new THREE.MeshBasicMaterial({
    color: 0xd4a030, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dimGold = new THREE.MeshBasicMaterial({
    color: 0xa07820, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // 동심 링 3개
  [{ r:20, t:0.22, y:62 }, { r:32, t:0.16, y:66 }, { r:46, t:0.12, y:60 }].forEach(({ r, t, y }) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, t, 8, 120),
      gold.clone()
    );
    m.rotation.x = Math.PI / 2; m.position.y = y;
    scene.add(m);
  });

  // 스포크 (기어 느낌)
  for (let a = 0; a < 12; a++) {
    const angle = (a / 12) * Math.PI * 2;
    const len = a % 3 === 0 ? 30 : 18;
    const geo = new THREE.CylinderGeometry(0.09, 0.09, len, 6);
    const m = new THREE.Mesh(geo, dimGold.clone());
    m.position.set(Math.cos(angle) * (len / 2), 63, Math.sin(angle) * (len / 2));
    m.rotation.z = Math.PI / 2; m.rotation.y = angle;
    scene.add(m);
  }

  // 중심 작은 허브
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 0.8, 32),
    gold.clone()
  );
  hub.position.y = 63; scene.add(hub);
}

// ===== 상태 변수 =====
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const noteNodes = {};
const allSpheres = [];
const lineObjects = [];
const glowRings   = [];
let mouseX = 0, mouseY = 0;
let currentX = 0, currentY = 0;
let targetRotY = 0, targetRotX = 0;
let isDragging = false, prevMouseX = 0, prevMouseY = 0;
let categorizedData = {};
let lastInteractionTime = Date.now(); // ② 자동 공전용

// ===== 마우스 이벤트 =====
document.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  mouseX = (e.clientX / innerWidth) * 2 - 1;
  mouseY = (e.clientY / innerHeight) * 2 - 1;
  lastInteractionTime = Date.now(); // ② 인터랙션 시간 갱신
  if (isDragging) {
    targetRotY += (e.clientX - prevMouseX) * 0.005;
    targetRotX += (e.clientY - prevMouseY) * 0.005;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }
});

document.addEventListener('mousedown', e => {
  isDragging = true;
  lastInteractionTime = Date.now();
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
});

document.addEventListener('mouseup', () => { isDragging = false; });

document.addEventListener('click', e => {
  if (e.target !== renderer.domElement) return;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allSpheres, false);
  // title이 있는 실제 노드만 (스프라이트·링 자식 오브젝트 제외)
  const hit = hits.find(h => h.object.userData.title !== undefined);
  if (hit) showNotePopup(hit.object.userData);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.setSize(innerWidth, innerHeight);
  bloomPass.resolution.set(innerWidth, innerHeight);
  lineObjects.forEach(({ line }) => {
    if (line.material.resolution) line.material.resolution.set(innerWidth, innerHeight);
  });
});

// ===== 볼트 초기화 / 재로드 =====
let _vaultSetupDone = false;

function clearVaultNodes() {
  // 씬에서 노드그룹 자식 제거
  const toRemove = [...nodeGroup.children];
  toRemove.forEach(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      (Array.isArray(child.material) ? child.material : [child.material])
        .forEach(m => m.dispose());
    }
    nodeGroup.remove(child);
  });
  allSpheres.length = 0;
  lineObjects.length = 0;
  glowRings.length = 0;
  Object.keys(noteNodes).forEach(k => delete noteNodes[k]);
  Object.keys(categorizedData).forEach(k => delete categorizedData[k]);
  sidePanel.style.right = '-360px';
}

function buildVaultFromData(data) {
  // ① 자동 유사도 링크 (TF-IDF cosine similarity)
  buildAutoLinks(data, 0.18, 5);
  // ② k-means 클러스터링 — 포지션 배치에 사용
  clusterNodes(data, 7);

  data.forEach(note => {
    if (!categorizedData[note.category]) categorizedData[note.category] = [];
    categorizedData[note.category].push(note);
  });

  // 노드 생성
  data.forEach(note => {
    const size = 0.12 + note.importance * 0.022;
    const geo  = new THREE.IcosahedronGeometry(size, 0);
    const pos  = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      v.multiplyScalar(size * (i % 12 === 0 ? 1.18 : 1.0));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();

    const emissive          = note.importance >= 15 ? 0xffcc33 : note.importance >= 8 ? 0x33ddff : 0xaa77ff;
    const emissiveIntensity = note.importance >= 15 ? 2.2     : note.importance >= 8 ? 1.6      : 1.0;
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, emissive, emissiveIntensity,
      roughness: 0.55, metalness: 0.9, reflectivity: 1,
      iridescence: 1, iridescenceIOR: 1.2,
      transparent: true, opacity: 0.9,
      flatShading: true, clearcoat: 1, clearcoatRoughness: 0,
    });

    const sphere = new THREE.Mesh(geo, mat);
    sphere.userData = {
      title: note.title, content: note.content, thumbnail: note.thumbnail ?? null,
      links: note.links, importance: note.importance, category: note.category,
      floatOffset: Math.random() * Math.PI * 2, dimmed: false, selected: false,
    };

    // ② 클러스터 각도 섹터 배치 — 같은 클러스터끼리 인접
    const clusterK   = 7;
    const sectorSize = (Math.PI * 2) / clusterK;
    const baseAngle  = ((note.cluster ?? 0) / clusterK) * Math.PI * 2;
    const angle      = baseAngle + (Math.random() - 0.5) * sectorSize * 0.8;
    const radius     = 6 + Math.random() * 14;
    sphere.position.set(
      Math.cos(angle) * radius,
      (Math.random() - 0.5) * 24 + 8,
      Math.sin(angle) * radius,
    );
    sphere.userData.baseY = sphere.position.y;

    nodeGroup.add(sphere);
    noteNodes[note.title] = sphere;
    allSpheres.push(sphere);

    const spriteSize    = size * 11;
    const spriteOpacity = note.importance >= 15 ? 0.22 : note.importance >= 8 ? 0.15 : 0.10;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: emissive,
      transparent: true, opacity: spriteOpacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    sprite.scale.set(spriteSize, spriteSize, 1);
    sprite.renderOrder = -1;
    sprite.userData.baseOpacity = spriteOpacity;
    sphere.add(sprite);

    if (note.importance >= 15) {
      const r = size;
      const ringMesh1 = new THREE.Mesh(
        new THREE.TorusGeometry(r * 2.4, r * 0.11, 8, 64),
        new THREE.MeshBasicMaterial({
          color: note.importance >= 25 ? 0xffcc33 : 0x55ddff,
          transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      ringMesh1.rotation.x = Math.PI / 2;
      ringMesh1.userData.baseOpacity = 0.55;
      sphere.add(ringMesh1);
      glowRings.push({ ring: ringMesh1, speed: 0.55 + Math.random() * 0.3, phase: Math.random() * Math.PI * 2 });

      const ringMesh2 = new THREE.Mesh(
        new THREE.TorusGeometry(r * 3.6, r * 0.065, 8, 64),
        new THREE.MeshBasicMaterial({
          color: note.importance >= 25 ? 0xff9933 : 0x33aaff,
          transparent: true, opacity: 0.32,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      ringMesh2.rotation.x = Math.PI / 3;
      ringMesh2.rotation.z = Math.PI / 5 + Math.random();
      ringMesh2.userData.baseOpacity = 0.32;
      sphere.add(ringMesh2);
      glowRings.push({ ring: ringMesh2, speed: -(0.35 + Math.random() * 0.25), phase: Math.random() * Math.PI * 2 });
    }
  });

  // 선 생성
  data.forEach(note => {
    const src = noteNodes[note.title];
    if (!src) return;
    (note.links || []).forEach(link => {
      if (!link || !link.target) return;
      const tgt = noteNodes[link.target];
      if (!tgt) return;
      const sim    = (link && typeof link === 'object' && link.similarity) ? link.similarity : 1;
      const avgImp = (src.userData.importance + tgt.userData.importance) / 2;
      const lw     = 0.4 + sim * 0.2;
      const lineGeo = new LineGeometry();
      lineGeo.setPositions([
        src.position.x, src.position.y, src.position.z,
        tgt.position.x, tgt.position.y, tgt.position.z,
      ]);
      const lineMat = new LineMaterial({
        color: 0x4bb8ff, linewidth: lw, transparent: true, opacity: 0.08,
        resolution: new THREE.Vector2(innerWidth, innerHeight),
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new Line2(lineGeo, lineMat);
      line.computeLineDistances();
      line.userData.phase  = Math.random() * Math.PI * 2;
      line.userData.dimmed = false;
      line.userData.baseLW = lw;
      line.renderOrder = 1;
      nodeGroup.add(line);
      lineObjects.push({ line, src, tgt });
    });
  });

  buildCategoryView();
}

// ===== 카테고리 화면 =====
function buildCategoryView() {
  navPanel.innerHTML = '';

  const total    = Object.values(categorizedData).flat().length;
  const catCount = Object.keys(categorizedData).length;

  navPanel.insertAdjacentHTML('beforeend', `
    <div style="padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
      <div style="font-size:9px;letter-spacing:3px;opacity:0.4;margin-bottom:3px;">KNOWLEDGE</div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:17px;font-weight:700;letter-spacing:2px;">VAULT</div>
        <div style="display:flex;gap:5px;">
          <button id="nav-search" title="검색 (/ 키)"
            style="background:rgba(77,150,255,0.10);border:1px solid rgba(77,150,255,0.20);
                   color:rgba(120,180,255,0.6);border-radius:6px;padding:3px 8px;
                   cursor:pointer;font-size:11px;transition:all 0.15s;">🔍</button>
          <button id="nav-activity" title="활동 내역"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);
                   color:rgba(255,255,255,0.4);border-radius:6px;padding:3px 8px;
                   cursor:pointer;font-size:11px;transition:all 0.15s;">📊</button>
          <button id="nav-reload" title="다른 볼트 열기"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);
                   color:rgba(255,255,255,0.4);border-radius:6px;padding:3px 8px;
                   cursor:pointer;font-size:11px;transition:all 0.15s;">⟳</button>
        </div>
      </div>
      <div style="font-size:10px;opacity:0.35;margin-top:3px;">
        ${total} nodes &nbsp;·&nbsp; ${catCount} categories
      </div>
    </div>
  `);

  // ③ 검색 버튼
  document.getElementById('nav-search')?.addEventListener('click', e => {
    e.stopPropagation();
    if (window._vaultSearchOpen) window._vaultSearchOpen();
  });

  // ④ 활동 내역 버튼
  document.getElementById('nav-activity')?.addEventListener('click', e => {
    e.stopPropagation();
    showTimelinePanel(sidePanel);
    sidePanel.style.right = '0px';
  });

  // 볼트 변경 버튼
  document.getElementById('nav-reload')?.addEventListener('click', async e => {
    e.stopPropagation();
    clearVaultNodes();
    const newData = await runVaultSetup();
    buildVaultFromData(newData);
  });

  const grid = document.createElement('div');
  grid.style.cssText = 'padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;overflow-y:auto;flex:1;min-height:0;';

  const sorted = Object.entries(categorizedData).sort((a, b) => b[1].length - a[1].length);
  sorted.forEach(([cat, files]) => {
    const color = CAT_COLORS[cat] || '#aaa';
    const card = document.createElement('div');
    card.style.cssText = `
      background:rgba(255,255,255,0.04);
      border:1px solid ${color}28;
      border-radius:10px;padding:9px 8px;cursor:pointer;
      transition:background 0.15s,border-color 0.15s;
    `;
    card.innerHTML = `
      <div style="font-size:7px;font-weight:700;letter-spacing:2px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cat}</div>
      <div style="font-size:20px;font-weight:700;margin-top:3px;line-height:1;">${files.length}</div>
      <div style="font-size:7px;opacity:0.3;margin-top:2px;">nodes</div>
    `;
    card.addEventListener('mouseenter', () => {
      card.style.background = `${color}15`;
      card.style.borderColor = `${color}55`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(255,255,255,0.04)';
      card.style.borderColor = `${color}28`;
    });
    card.addEventListener('click', e => {
      e.stopPropagation();
      filterByCategory(cat);
      buildFileView(cat, files);
    });
    grid.appendChild(card);
  });

  navPanel.appendChild(grid);
}

// ===== 파일 목록 화면 =====
function buildFileView(cat, files) {
  navPanel.innerHTML = '';
  const color = CAT_COLORS[cat] || '#aaa';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:8px;flex-shrink:0;';
  const back = document.createElement('button');
  back.innerHTML = '←';
  back.style.cssText = `
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
    color:white;border-radius:7px;padding:3px 10px;cursor:pointer;font-size:12px;flex-shrink:0;
  `;
  back.addEventListener('click', e => {
    e.stopPropagation();
    resetVisibility();
    sidePanel.style.right = '-360px';
    buildCategoryView();
  });
  hdr.appendChild(back);
  hdr.insertAdjacentHTML('beforeend', `
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:${color};">${cat}</div>
      <div style="font-size:10px;opacity:0.35;">${files.length} nodes</div>
    </div>
  `);
  navPanel.appendChild(hdr);

  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;flex:1;padding:8px;min-height:0;';

  const sorted = [...files].sort((a, b) => b.importance - a.importance);
  sorted.forEach(note => {
    const impColor = note.importance >= 15 ? '#ffe88a' : note.importance >= 8 ? '#9fd0ff' : 'rgba(255,255,255,0.35)';
    const item = document.createElement('div');
    item.style.cssText = `
      padding:7px 10px;border-radius:8px;cursor:pointer;margin-bottom:4px;
      border:1px solid transparent;transition:all 0.15s;
    `;
    item.innerHTML = `
      <div style="font-size:10px;font-weight:600;letter-spacing:0.5px;word-break:break-all;">${note.title}</div>
      <div style="font-size:9px;color:${impColor};margin-top:2px;">★ ${note.importance}</div>
    `;

    item.addEventListener('mouseenter', e => {
      if (item.dataset.active !== '1') {
        item.style.background = `${color}12`;
        item.style.borderColor = `${color}35`;
      }
      const s = noteNodes[note.title];
      if (s) s.material.emissiveIntensity = 3.5;
    });
    item.addEventListener('mouseleave', () => {
      if (item.dataset.active !== '1') {
        item.style.background = 'transparent';
        item.style.borderColor = 'transparent';
      }
      const s = noteNodes[note.title];
      if (s && !s.userData.selected) s.material.emissiveIntensity = 1.2;
    });
    item.addEventListener('click', e => {
      e.stopPropagation();
      list.querySelectorAll('[data-active="1"]').forEach(el => {
        el.dataset.active = '0';
        el.style.background = 'transparent';
        el.style.borderColor = 'transparent';
      });
      item.dataset.active = '1';
      item.style.background = `${color}20`;
      item.style.borderColor = `${color}55`;

      Object.values(noteNodes).forEach(s => { s.userData.selected = false; });
      const s = noteNodes[note.title];
      if (s) { s.userData.selected = true; s.material.emissiveIntensity = 4.0; }

      showNotePopup(note);
    });

    list.appendChild(item);
  });

  navPanel.appendChild(list);
}

// ===== 사이드 패널 =====
function showNotePopup(note) { showSidePanel(note); } // 하위 호환 alias

function showSidePanel(note) {
  if (!note || note.title == null) return;

  // ④ 방문 시간 기록
  trackEvent('visit', { title: note.title });

  const title      = note.title;
  const importance = note.importance ?? 0;
  const category   = note.category  ?? 'OTHER';
  const color      = CAT_COLORS[category] || '#aaa';
  const impColor   = importance >= 15 ? '#ffcc33' : importance >= 8 ? '#33ddff' : '#aa77ff';

  const links = (note.links || [])
    .map(l => (typeof l === 'string' ? l : l.target))
    .filter(l => l);

  const memoKey     = `_vaultMemo_${title}`;
  const memoTimeKey = `_vaultMemoTime_${title}`;
  const savedMemo   = localStorage.getItem(memoKey)     || '';
  const savedTime   = localStorage.getItem(memoTimeKey) || '';

  // 카테고리별 placeholder SVG (썸네일 없을 때)
  const catIconMap = {
    IMAGE:    { icon:'🖼',  color:'#6688cc' },
    CAD:      { icon:'📐', color:'#44aacc' },
    DOCUMENT: { icon:'📄', color:'#2255cc' },
    DESIGN:   { icon:'🎨', color:'#ff6688' },
    MEDIA:    { icon:'▶',  color:'#dd3366' },
    OTHER:    { icon:'📁', color:'#556677' },
  };
  function makePlaceholderThumb(cat, title) {
    const { icon, color } = catIconMap[cat] || catIconMap.OTHER;
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 140" width="300" height="140">
      <rect width="300" height="140" fill="#080f1e" rx="6"/>
      <rect x="1" y="1" width="298" height="138" fill="none" stroke="${color}22" stroke-width="1" rx="6"/>
      <text x="150" y="72" text-anchor="middle" font-size="44" font-family="serif">${icon}</text>
      <text x="150" y="105" text-anchor="middle" font-size="9" font-family="monospace"
            fill="${color}99" letter-spacing="1">${esc((cat||'').toUpperCase())}</text>
      <text x="150" y="122" text-anchor="middle" font-size="8" font-family="monospace"
            fill="rgba(255,255,255,0.2)">${esc((title||'').slice(0,36))}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  const thumbSrc = note.thumbnail || makePlaceholderThumb(note.category, note.title);
  const thumbHTML = `<div style="border-radius:8px;overflow:hidden;
                   border:1px solid rgba(255,255,255,0.08);margin-bottom:18px;">
         <img src="${thumbSrc}" style="width:100%;display:block;max-height:160px;
              object-fit:contain;background:rgba(0,0,0,0.3);"
              onerror="this.style.display='none'">
       </div>`;

  sidePanel.innerHTML = `
    <div style="padding:22px 20px 36px;">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  margin-bottom:14px;">
        <div style="flex:1;min-width:0;">
          <div style="display:inline-block;font-size:9px;letter-spacing:2px;font-weight:700;
                      color:${color};background:${color}18;border:1px solid ${color}35;
                      border-radius:4px;padding:2px 8px;margin-bottom:8px;">${category}</div>
          <h2 style="margin:0;font-size:16px;font-weight:700;letter-spacing:0.5px;
                     color:#fff;word-break:break-all;line-height:1.3;">${title}</h2>
          <div style="margin-top:5px;color:${impColor};font-size:11px;">★ ${importance}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:10px;">
          <button id="sp-edit" title="노드 편집"
            style="background:rgba(77,150,255,0.10);border:1px solid rgba(77,150,255,0.25);
                   color:rgba(120,180,255,0.7);border-radius:6px;padding:4px 9px;
                   cursor:pointer;font-size:11px;transition:all 0.15s;">✎</button>
          <button id="sp-close" style="background:rgba(255,255,255,0.06);
                   border:1px solid rgba(255,255,255,0.10);color:rgba(255,255,255,0.45);
                   border-radius:6px;padding:4px 9px;cursor:pointer;font-size:13px;
                   transition:all 0.15s;">✕</button>
        </div>
      </div>

      <div style="height:1px;background:linear-gradient(90deg,rgba(143,211,255,0.2),transparent);
                  margin-bottom:16px;"></div>

      ${thumbHTML}

      ${note.content ? `
        <div style="font-size:12px;color:rgba(255,255,255,0.38);line-height:1.75;
                    margin-bottom:18px;padding-bottom:16px;
                    border-bottom:1px solid rgba(255,255,255,0.05);">${note.content}</div>` : ''}

      <!-- 메모 -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    margin-bottom:8px;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.22);">MEMO</div>
          <div id="sp-save-tag" style="font-size:9px;color:rgba(100,220,120,0.7);
               letter-spacing:1px;opacity:0;transition:opacity 0.3s;"></div>
        </div>
        <div id="sp-memo-view"
          style="min-height:60px;font-size:12px;color:rgba(255,255,255,0.62);
                 line-height:1.75;cursor:text;border-radius:8px;padding:10px 12px;
                 border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);
                 white-space:pre-wrap;word-break:break-word;">
          ${savedMemo
            ? savedMemo.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
            : '<span style="opacity:0.25;font-style:italic;font-size:11px;">더블클릭으로 메모 작성...</span>'}
        </div>
        <textarea id="sp-memo-edit"
          style="display:none;width:100%;min-height:96px;
                 background:rgba(80,130,255,0.06);border:1px solid rgba(80,130,255,0.4);
                 border-radius:8px;padding:10px 12px;color:#e8eeff;font-size:12px;
                 line-height:1.75;resize:vertical;box-sizing:border-box;
                 font-family:inherit;outline:none;">${savedMemo}</textarea>
      </div>

      <!-- 연결 노드 -->
      ${links.length ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.22);
                      margin-bottom:8px;">CONNECTED (${links.length})</div>
          <div id="sp-links" style="display:flex;flex-direction:column;gap:4px;"></div>
        </div>` : ''}

      <div id="sp-time" style="font-size:9px;color:rgba(255,255,255,0.18);letter-spacing:1px;">
        ${savedTime ? '메모 수정 · ' + savedTime : ''}
      </div>
    </div>
  `;

  sidePanel.style.right = '0px';

  // 닫기
  document.getElementById('sp-close').addEventListener('click', () => {
    sidePanel.style.right = '-360px';
    Object.values(noteNodes).forEach(s => {
      s.userData.selected = false;
      s.material.emissiveIntensity = s.userData.dimmed ? 0.2 : 1.2;
    });
  });

  // ⑤ 편집 버튼
  document.getElementById('sp-edit')?.addEventListener('click', () => {
    makeEditPanel(note, noteNodes, (oldTitle, updated) => {
      // 세션 내 데이터 업데이트
      const allNotes = Object.values(categorizedData).flat();
      const existing = allNotes.find(n => n.title === oldTitle);
      if (existing) Object.assign(existing, updated);
      // userData 동기화
      const sphere = noteNodes[oldTitle];
      if (sphere) {
        Object.assign(sphere.userData, {
          title:      updated.title,
          content:    updated.content,
          importance: updated.importance,
          category:   updated.category,
          links:      updated.links,
        });
        // 중요도 변경 시 emissive 갱신
        const ei = updated.importance >= 15 ? 2.2 : updated.importance >= 8 ? 1.6 : 1.0;
        sphere.material.emissiveIntensity = ei;
      }
      showSidePanel(updated);
    });
  });

  // 메모 더블클릭 편집
  const memoView = document.getElementById('sp-memo-view');
  const memoEdit = document.getElementById('sp-memo-edit');
  const saveTag  = document.getElementById('sp-save-tag');
  const timeEl   = document.getElementById('sp-time');
  let saveTimer  = null;

  memoView.addEventListener('dblclick', () => {
    memoView.style.display = 'none';
    memoEdit.style.display = 'block';
    memoEdit.focus();
    memoEdit.setSelectionRange(memoEdit.value.length, memoEdit.value.length);
  });

  memoEdit.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTag.textContent = '저장 중...'; saveTag.style.opacity = '1';
    saveTimer = setTimeout(() => {
      const val = memoEdit.value;
      localStorage.setItem(memoKey, val);
      const now = new Date().toLocaleString('ko-KR',
        { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      localStorage.setItem(memoTimeKey, now);
      trackEvent('memo_save', { title }); // ④
      saveToCloud(localStorage.getItem('_vaultName') || '', title, val); // ☁
      saveTag.textContent = '✓ 저장됨';
      timeEl.textContent  = '메모 수정 · ' + now;
      setTimeout(() => { saveTag.style.opacity = '0'; }, 2000);
    }, 600);
  });

  memoEdit.addEventListener('blur', () => {
    const val = memoEdit.value;
    memoView.innerHTML = val
      ? val.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
      : '<span style="opacity:0.25;font-style:italic;font-size:11px;">더블클릭으로 메모 작성...</span>';
    memoView.style.display = 'block';
    memoEdit.style.display = 'none';
    if (val !== savedMemo) {
      localStorage.setItem(memoKey, val);
      const now = new Date().toLocaleString('ko-KR',
        { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      localStorage.setItem(memoTimeKey, now);
      timeEl.textContent = '메모 수정 · ' + now;
    }
  });

  // 연결 노드 클릭
  const linksEl = document.getElementById('sp-links');
  if (linksEl) {
    links.forEach(target => {
      const tgtNote  = Object.values(categorizedData).flat().find(n => n.title === target);
      const tgtColor = tgtNote ? (CAT_COLORS[tgtNote.category] || '#aaa') : '#aaa';
      const item = document.createElement('div');
      item.style.cssText = `cursor:pointer;padding:7px 10px;border-radius:6px;
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
        display:flex;align-items:center;gap:8px;transition:all 0.15s;`;
      item.innerHTML = `
        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;
                     background:${tgtColor};"></span>
        <span style="font-size:11px;color:rgba(255,255,255,0.55);
                     word-break:break-all;">${target}</span>`;
      item.addEventListener('mouseenter', () => {
        item.style.background  = 'rgba(255,255,255,0.07)';
        item.style.borderColor = 'rgba(255,255,255,0.13)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background  = 'rgba(255,255,255,0.03)';
        item.style.borderColor = 'rgba(255,255,255,0.06)';
      });
      item.addEventListener('click', () => {
        if (tgtNote) showSidePanel(tgtNote);
        Object.values(noteNodes).forEach(s => {
          const sel = s.userData.title === target;
          s.userData.selected = sel;
          s.material.emissiveIntensity = sel ? 4.0 : (s.userData.dimmed ? 0.2 : 1.2);
        });
      });
      linksEl.appendChild(item);
    });
  }
}

// ===== 카테고리 필터링 =====
function filterByCategory(cat) {
  Object.values(noteNodes).forEach(sphere => {
    const inCat = sphere.userData.category === cat;
    sphere.userData.dimmed = !inCat;
    sphere.userData.selected = false;
    sphere.material.emissiveIntensity = inCat ? 1.2 : 0.2;
    sphere.material.opacity = inCat ? 0.9 : 0.18;
    sphere.children.forEach(child => {
      if (child.isMesh && child.userData.baseOpacity !== undefined) {
        child.material.opacity = inCat ? child.userData.baseOpacity : 0.04;
      }
      if (child.isSprite) {
        child.material.opacity = inCat ? child.userData.baseOpacity : 0.03;
      }
    });
  });
  lineObjects.forEach(({ line, src, tgt }) => {
    const connected = src.userData.category === cat || tgt.userData.category === cat;
    line.userData.dimmed = !connected;
    line.material.opacity = connected ? 0.55 : 0.02;
  });
}

function resetVisibility() {
  Object.values(noteNodes).forEach(s => {
    s.userData.dimmed = false;
    s.userData.selected = false;
    s.material.emissiveIntensity = 1.2;
    s.material.opacity = 0.9;
    s.children.forEach(child => {
      if ((child.isMesh || child.isSprite) && child.userData.baseOpacity !== undefined) {
        child.material.opacity = child.userData.baseOpacity;
      }
    });
  });
  lineObjects.forEach(({ line }) => {
    line.userData.dimmed = false;
    line.material.opacity = 0.18;
  });
}

// ===== 애니메이션 루프 =====
function animate() {
  requestAnimationFrame(animate);

  const t = Date.now() * 0.0003;

  // 부유 애니메이션
  allSpheres.forEach(s => {
    s.position.y = s.userData.baseY + Math.sin(t + s.userData.floatOffset) * 3;
  });

  // 글로우 링 회전
  glowRings.forEach(({ ring, speed, phase }) => {
    ring.rotation.z = t * speed + phase;
  });

  // 바닥 그리스 키 무늬 — 고정 (회전 없음), 은은한 숨쉬기만
  if (floorPatternMesh) {
    floorPatternMesh.material.opacity = 0.82 + Math.sin(t * 0.5) * 0.18;
  }

  // 연결선 펄스
  lineObjects.forEach(({ line, src, tgt }) => {
    line.geometry.setPositions([
      src.position.x, src.position.y, src.position.z,
      tgt.position.x, tgt.position.y, tgt.position.z,
    ]);
    if (!line.userData.dimmed) {
      const pulse = Math.sin(t * 2.2 + line.userData.phase);
      line.material.opacity = 0.35 + pulse * 0.15;
      line.material.color.setHSL(0.57 + pulse * 0.04, 1.0, 0.70);
    }
  });

  // 파티클 드리프트
  const pArr = particleGeo.attributes.position.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    pArr[i3]   += pVelocities[i3]   + Math.sin(t * 0.25 + pPhases[i]) * 0.0018;
    pArr[i3+1] += pVelocities[i3+1];
    pArr[i3+2] += pVelocities[i3+2] + Math.cos(t * 0.25 + pPhases[i]) * 0.0018;
    if (pArr[i3+1] > 40) {
      pArr[i3+1] = -14;
      pArr[i3]   = (Math.random() - 0.5) * 80;
      pArr[i3+2] = (Math.random() - 0.5) * 80;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;

  // 우주 배경 서서히 회전 (인터랙티브 느낌)
  if (spaceSkydome) spaceSkydome.rotation.y += 0.000055;
  spaceDecor.forEach((m, i) => { m.rotation.z += (i % 2 === 0 ? 1 : -1) * 0.00038; });

  // ② 자동 공전 — 마우스 정지 2.5초 후 천천히 회전
  if (!isDragging && (Date.now() - lastInteractionTime) > 2500) {
    targetRotY += 0.00020;
  }

  // 노드 그룹 회전
  const autoY = mouseX * 0.2;
  const autoX = mouseY * 0.08;
  currentY += ((targetRotY + autoY) - currentY) * 0.05;
  currentX += ((-targetRotX - autoX) - currentX) * 0.05;
  nodeGroup.rotation.y = currentY;
  nodeGroup.rotation.x = currentX * 0.3;

  // 카메라 부드러운 이동
  camera.position.x += (mouseX * 2 - camera.position.x) * 0.03;
  camera.position.y += (2 + mouseY * 1.5 - camera.position.y) * 0.015;
  camera.position.z += ((35 + mouseY * 0.5) - camera.position.z) * 0.015;
  camera.lookAt(0, 3, 0);

  // 호버 라벨
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allSpheres, false);
  if (hits.length > 0) {
    const obj = hits[0].object;
    label.style.display = 'block';
    label.innerText = obj.userData.title ?? '';
    const imp = obj.userData.importance;
    label.style.color = imp >= 15 ? '#ffcc33' : imp >= 8 ? '#33ddff' : '#aa77ff';
    label.style.boxShadow = imp >= 15
      ? '0 0 20px rgba(255,204,51,0.6)'
      : imp >= 8
        ? '0 0 20px rgba(51,221,255,0.5)'
        : '0 0 12px rgba(170,119,255,0.4)';
    const sp = obj.position.clone().project(camera);
    label.style.left = ((sp.x * 0.5 + 0.5) * innerWidth + 20) + 'px';
    label.style.top  = ((-sp.y * 0.5 + 0.5) * innerHeight) + 'px';
  } else {
    label.style.display = 'none';
  }

  // ① bloom composer로 렌더
  composer.render();
}

// ===== 로그인 + 폴더 선택 플로우 =====
function runVaultSetup() {
  return new Promise(resolve => {
    const CATS = ['AETHER','ARC','ASTRAL','CIPHER','CORE','ECHO','LUMEN','MEMORY',
                  'NEON','NEXUS','ORBIT','PULSE','QUANTUM','SHADOW','SIGNAL',
                  'SPECTRAL','SYNTH','VOID','ZENITH'];

    // placeholder 스타일 전역 주입
    const st = document.createElement('style');
    st.textContent = `
      .vi-input::placeholder { color: rgba(255,255,255,0.2); }
      .vi-input:focus { border-color:rgba(80,130,255,0.55)!important;
                        background:rgba(80,130,255,0.07)!important; outline:none; }
      @keyframes viFadeIn { from{opacity:0;transform:translateY(10px)}
                             to{opacity:1;transform:translateY(0)} }
    `;
    document.head.appendChild(st);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:#080c18;
      display:flex;align-items:center;justify-content:center;
      z-index:9999;font-family:'Helvetica Neue',Helvetica,sans-serif;
    `;
    document.body.appendChild(overlay);

    // ── 공통 버튼 hover 효과 ──
    function hoverBtn(btn, onC, offC) {
      btn.addEventListener('mouseenter', () => btn.style.cssText += onC);
      btn.addEventListener('mouseleave', () => btn.style.cssText += offC);
    }

    // ═══════════════════════════════
    // ① 로그인 화면 (이름만)
    // ═══════════════════════════════
    function showLogin() {
      const savedName = localStorage.getItem('_vaultName') || '';

      overlay.innerHTML = `
        <div style="animation:viFadeIn 0.5s ease;text-align:center;
                    display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:10px;letter-spacing:5px;color:rgba(100,150,255,0.45);
                      margin-bottom:10px;">KNOWLEDGE</div>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;
                      color:#fff;margin-bottom:4px;">VAULT</div>
          <div style="font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.15);
                      margin-bottom:${savedName ? '24px' : '48px'};">CURIOSITY EMPORIUM</div>

          ${savedName ? `
            <div style="font-size:12px;letter-spacing:1px;color:rgba(150,200,255,0.5);
                        margin-bottom:22px;">
              다시 오셨군요,
              <span style="color:#8fd3ff;font-weight:600;">${savedName}</span>님
            </div>` : ''}

          <input id="vi-name" class="vi-input" type="text"
            placeholder="이름을 입력하세요" value="${savedName}"
            style="width:260px;padding:13px 16px;margin-bottom:28px;
                   background:rgba(255,255,255,0.04);
                   border:1px solid rgba(255,255,255,0.10);border-radius:8px;
                   color:#fff;font-size:13px;letter-spacing:2px;
                   box-sizing:border-box;transition:all 0.2s;text-align:center;">

          <button id="vi-enter"
            style="width:260px;padding:13px;
                   background:rgba(80,130,255,0.12);
                   border:1px solid rgba(80,130,255,0.30);border-radius:8px;
                   color:#8fb4ff;font-size:11px;letter-spacing:4px;
                   cursor:pointer;transition:all 0.2s;">ENTER</button>

          <div id="vi-err"
            style="color:#ff6677;font-size:10px;letter-spacing:1px;
                   margin-top:14px;opacity:0;transition:opacity 0.25s;
                   min-height:14px;"></div>
        </div>
      `;

      const enterBtn = document.getElementById('vi-enter');
      hoverBtn(enterBtn,
        'background:rgba(80,130,255,0.25);border-color:rgba(80,130,255,0.55);',
        'background:rgba(80,130,255,0.12);border-color:rgba(80,130,255,0.30);'
      );

      function tryLogin() {
        const name = document.getElementById('vi-name').value.trim();
        const err  = document.getElementById('vi-err');
        if (!name) {
          err.textContent  = '이름을 입력해주세요';
          err.style.opacity = '1';
          return;
        }
        localStorage.setItem('_vaultName', name);
        showGreeting(name);
      }

      // 인사 화면 → 폴더 선택으로 전환
      function showGreeting(name) {
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity    = '0';
        setTimeout(() => {
          overlay.innerHTML = `
            <div style="animation:viFadeIn 0.45s ease;text-align:center;
                        display:flex;flex-direction:column;align-items:center;">
              <div style="font-size:12px;letter-spacing:4px;
                          color:rgba(255,255,255,0.3);margin-bottom:14px;">안녕하세요</div>
              <div style="font-size:42px;font-weight:700;letter-spacing:3px;color:#fff;
                          margin-bottom:6px;">
                ${name}<span style="color:rgba(100,150,255,0.65);font-weight:400;">님</span>
              </div>
              <div style="width:40px;height:1px;background:rgba(100,150,255,0.35);
                          margin:18px 0;"></div>
              <div style="font-size:10px;letter-spacing:3px;
                          color:rgba(255,255,255,0.18);">VAULT에 오신 것을 환영합니다</div>
            </div>
          `;
          overlay.style.opacity = '1';
          // 1.6초 후 폴더 선택으로 이동
          setTimeout(() => {
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity    = '0';
            setTimeout(() => {
              overlay.style.opacity = '1';
              showFolderPicker(name);
            }, 500);
          }, 1600);
        }, 300);
      }

      enterBtn.addEventListener('click', tryLogin);
      document.getElementById('vi-name').addEventListener('keydown',
        e => { if (e.key === 'Enter') tryLogin(); });
    }

    // ═══════════════════════════════
    // ② 폴더 선택 화면
    // ═══════════════════════════════
    function showFolderPicker(userName = '') {
      overlay.innerHTML = `
        <div style="animation:viFadeIn 0.5s ease;width:340px;
                    display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:10px;letter-spacing:5px;
                      color:rgba(100,150,255,0.45);margin-bottom:10px;">KNOWLEDGE VAULT</div>
          <div style="font-size:22px;font-weight:600;letter-spacing:5px;
                      color:#fff;margin-bottom:6px;">SELECT VAULT</div>
          <div style="font-size:10px;letter-spacing:1px;
                      color:rgba(255,255,255,0.18);margin-bottom:28px;">
            ${userName
              ? `<span style="color:rgba(140,190,255,0.55);">${userName}님의 </span>볼트를 선택해주세요`
              : 'md · txt · png · jpg · pdf · psd · dwg 등 모든 파일'
            }</div>

          <div id="vf-zone"
            style="width:300px;height:120px;
                   border:1.5px dashed rgba(80,130,255,0.25);border-radius:14px;
                   display:flex;flex-direction:column;align-items:center;
                   justify-content:center;gap:8px;
                   color:rgba(255,255,255,0.25);cursor:pointer;
                   transition:all 0.2s;margin-bottom:14px;">
            <div style="font-size:22px;opacity:0.5;">📁</div>
            <div style="font-size:11px;letter-spacing:2px;">SELECT FOLDER</div>
          </div>

          <!-- LOCAL AI 토글 -->
          <div id="vf-ai-row" style="width:300px;display:flex;align-items:center;
               justify-content:space-between;padding:10px 14px;border-radius:10px;
               border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03);
               margin-bottom:8px;cursor:pointer;user-select:none;">
            <span style="font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.45);">
              🤖 LOCAL AI 분석</span>
            <div id="vf-ai-badge" style="font-size:9px;padding:2px 9px;border-radius:20px;
                 letter-spacing:1px;background:rgba(255,255,255,0.06);
                 color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.10);
                 transition:all 0.25s;">OFF</div>
          </div>

          <div id="vf-ai-panel" style="width:300px;display:none;padding:12px;
               background:rgba(255,255,255,0.02);border-radius:10px;
               border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
            <div id="vf-ai-detect" style="font-size:9px;letter-spacing:1px;
                 color:rgba(150,200,255,0.5);margin-bottom:8px;">감지 중...</div>
            <div id="vf-ai-models" style="display:none;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.3);
                            margin-bottom:4px;">TEXT</div>
                <select id="vf-sel-t" style="width:100%;background:rgba(0,0,0,0.5);
                  border:1px solid rgba(255,255,255,0.12);border-radius:6px;
                  color:#fff;font-size:9px;padding:4px 6px;"></select>
              </div>
              <div>
                <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.3);
                            margin-bottom:4px;">VISION (이미지용)</div>
                <select id="vf-sel-v" style="width:100%;background:rgba(0,0,0,0.5);
                  border:1px solid rgba(255,255,255,0.12);border-radius:6px;
                  color:#fff;font-size:9px;padding:4px 6px;"></select>
              </div>
            </div>
            <div id="vf-ai-custom" style="display:none;">
              <input id="vf-ep" class="vi-input" placeholder="엔드포인트 (예: http://localhost:11434)"
                style="width:100%;padding:7px 10px;background:rgba(255,255,255,0.04);
                       border:1px solid rgba(255,255,255,0.10);border-radius:7px;
                       color:#fff;font-size:10px;box-sizing:border-box;margin-bottom:6px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <input id="vf-mdl-t" class="vi-input" placeholder="텍스트 모델명"
                  style="padding:7px 8px;background:rgba(255,255,255,0.04);
                         border:1px solid rgba(255,255,255,0.10);border-radius:7px;
                         color:#fff;font-size:10px;box-sizing:border-box;">
                <input id="vf-mdl-v" class="vi-input" placeholder="비전 모델명"
                  style="padding:7px 8px;background:rgba(255,255,255,0.04);
                         border:1px solid rgba(255,255,255,0.10);border-radius:7px;
                         color:#fff;font-size:10px;box-sizing:border-box;">
              </div>
            </div>
          </div>

          <div id="vf-list"
            style="width:300px;max-height:90px;overflow-y:auto;
                   margin-bottom:10px;display:none;
                   scrollbar-width:thin;scrollbar-color:rgba(80,130,255,0.3) transparent;">
          </div>

          <div id="vf-status"
            style="font-size:10px;letter-spacing:1px;width:300px;text-align:center;
                   color:rgba(100,160,255,0.55);margin-bottom:18px;min-height:14px;"></div>

          <button id="vf-load" disabled
            style="width:260px;padding:13px;
                   background:rgba(255,255,255,0.03);
                   border:1px solid rgba(255,255,255,0.08);border-radius:8px;
                   color:rgba(255,255,255,0.2);font-size:11px;letter-spacing:4px;
                   cursor:not-allowed;transition:all 0.3s;">LOAD VAULT</button>
        </div>
      `;

      const zone      = document.getElementById('vf-zone');
      const statusEl  = document.getElementById('vf-status');
      const listEl    = document.getElementById('vf-list');
      const loadBtn   = document.getElementById('vf-load');
      const aiRow     = document.getElementById('vf-ai-row');
      const aiBadge   = document.getElementById('vf-ai-badge');
      const aiPanel   = document.getElementById('vf-ai-panel');
      const aiDetect  = document.getElementById('vf-ai-detect');
      const modelsDiv = document.getElementById('vf-ai-models');
      const customDiv = document.getElementById('vf-ai-custom');
      let parsedData    = null;
      let aiEnabled     = false;
      let aiCfg         = null; // { endpoint, textModel, visionModel }
      let previewServer = false; // 변환 서버 연결 여부

      // ── 변환 서버 상태 확인 ──
      fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) })
        .then(r => r.json()).then(d => {
          if (d.ok) {
            previewServer = true;
            statusEl.textContent = '✦ 미리보기 서버 연결됨';
            statusEl.style.color = 'rgba(80,220,140,0.8)';
            setTimeout(() => {
              statusEl.textContent = 'DROP FILES OR CLICK TO SELECT';
              statusEl.style.color = '';
            }, 2000);
          }
        }).catch(() => {
          statusEl.textContent = '⚠ 미리보기 서버 없음 — 이미지만 미리보기 가능 (start.bat 실행 권장)';
          statusEl.style.color = 'rgba(255,180,60,0.8)';
          statusEl.style.fontSize = '9px';
        });

      // ── zone hover ──
      zone.addEventListener('mouseenter', () => {
        zone.style.borderColor = 'rgba(80,130,255,0.55)';
        zone.style.color       = 'rgba(255,255,255,0.6)';
        zone.style.background  = 'rgba(80,130,255,0.05)';
      });
      zone.addEventListener('mouseleave', () => {
        zone.style.borderColor = 'rgba(80,130,255,0.25)';
        zone.style.color       = 'rgba(255,255,255,0.25)';
        zone.style.background  = 'transparent';
      });

      // ── AI 토글 ──
      aiRow.addEventListener('click', async () => {
        aiEnabled = !aiEnabled;
        if (aiEnabled) {
          aiBadge.textContent      = 'ON';
          aiBadge.style.background = 'rgba(80,200,120,0.15)';
          aiBadge.style.color      = '#88ffaa';
          aiBadge.style.borderColor= 'rgba(80,200,120,0.35)';
          aiPanel.style.display    = 'block';
          aiDetect.textContent     = 'Ollama 감지 중...';
          aiDetect.style.color     = 'rgba(150,200,255,0.5)';

          // UI 렌더링 먼저 처리 후 fetch
          await new Promise(r => setTimeout(r, 0));

          try {
            const r = await fetch('http://localhost:11434/api/tags',
                                  { signal: AbortSignal.timeout(1200) });
            const { models = [] } = await r.json();
            const names = models.map(m => m.name);
            if (!names.length) throw new Error('no models');

            aiDetect.textContent = `✓ Ollama 연결 · ${names.length}개 모델`;
            aiDetect.style.color = 'rgba(100,255,150,0.7)';
            modelsDiv.style.display = 'grid';
            customDiv.style.display = 'none';

            const selT = document.getElementById('vf-sel-t');
            const selV = document.getElementById('vf-sel-v');
            names.forEach(n => {
              selT.insertAdjacentHTML('beforeend', `<option>${n}</option>`);
              selV.insertAdjacentHTML('beforeend', `<option>${n}</option>`);
            });
            // 비전 모델 자동 선택
            const VIS_KW = ['llava','bakllava','moondream','minicpm','vision'];
            const vDef   = names.find(n => VIS_KW.some(k => n.toLowerCase().includes(k))) || names[0];
            selV.value = vDef;
            aiCfg = { endpoint:'http://localhost:11434', textModel:selT.value, visionModel:vDef };
            selT.addEventListener('change', () => { aiCfg.textModel   = selT.value; });
            selV.addEventListener('change', () => { aiCfg.visionModel = selV.value; });

          } catch {
            aiDetect.textContent = 'Ollama 없음 — 직접 입력 (LM Studio 등도 가능)';
            aiDetect.style.color = 'rgba(255,200,100,0.7)';
            modelsDiv.style.display = 'none';
            customDiv.style.display = 'block';
            function syncCfg() {
              aiCfg = {
                endpoint:    document.getElementById('vf-ep')?.value.trim()    || 'http://localhost:11434',
                textModel:   document.getElementById('vf-mdl-t')?.value.trim() || 'llama3',
                visionModel: document.getElementById('vf-mdl-v')?.value.trim() || 'llava',
              };
            }
            ['vf-ep','vf-mdl-t','vf-mdl-v'].forEach(id =>
              document.getElementById(id)?.addEventListener('input', syncCfg));
            syncCfg();
          }

        } else {
          aiEnabled = false; aiCfg = null;
          aiBadge.textContent      = 'OFF';
          aiBadge.style.background = 'rgba(255,255,255,0.06)';
          aiBadge.style.color      = 'rgba(255,255,255,0.25)';
          aiBadge.style.borderColor= 'rgba(255,255,255,0.10)';
          aiPanel.style.display    = 'none';
        }
      });

      // ── OpenAI-compatible API 호출 (Ollama / LM Studio / Jan 등) ──
      async function callAI(prompt, imageDataUrl = null) {
        if (!aiCfg) return null;
        const model   = imageDataUrl ? aiCfg.visionModel : aiCfg.textModel;
        const baseUrl = aiCfg.endpoint.replace(/\/$/, '');
        const content = imageDataUrl
          ? [{ type:'text', text:prompt },
             { type:'image_url', image_url:{ url:imageDataUrl } }]
          : prompt;
        try {
          const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({
              model,
              messages: [{ role:'user', content }],
              temperature: 0.2,
            }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data.choices?.[0]?.message?.content ?? null;
        } catch { return null; }
      }

      // ── 파일 1개 → AI 분석 → {title, importance, content} ──
      async function aiExtractNode(file, textContent = '', imageDataUrl = null) {
        const ext     = (file.name.split('.').pop() || '').toUpperCase();
        const sizeStr = file.size > 1_000_000
          ? (file.size/1_000_000).toFixed(1)+' MB'
          : (file.size/1_000).toFixed(0)+' KB';
        const hasBinary = !textContent && !imageDataUrl;
        const prompt =
`파일을 분석해서 아래 JSON만 반환하세요 (설명·마크다운 없이):
{"title":"영문대문자_언더스코어만","importance":숫자1에서30,"content":"내용요약200자이내"}

파일명: ${file.name}
형식: ${ext} (${sizeStr})
${textContent ? '내용:\n'+textContent.substring(0,2000)
              : hasBinary ? '(바이너리 파일 — 파일명·형식에서 내용과 중요도를 추론)' : ''}`;
        const raw = await callAI(prompt, imageDataUrl);
        if (!raw) return null;
        try {
          const m = raw.match(/\{[\s\S]*?\}/);
          if (m) {
            const p = JSON.parse(m[0]);
            if (p.title && p.importance) return p;
          }
        } catch {}
        return null;
      }

      // ── 파일 처리 ──
      async function handleFiles(files) {
        const readable = [...files].filter(f => {
          if (f.name.startsWith('.')) return false;
          return /\.(md|markdown|txt|text|png|jpg|jpeg|gif|webp|svg|bmp|ico|tif|tiff|stl|obj|dxf|dwg|step|stp|igs|iges|3dm|fbx|gltf|glb|psd|ai|sketch|xd|fig|eps|pdf|docx|doc|pptx|ppt|xlsx|xls|mp4|mov|avi|mkv|webm|mp3|wav|flac|aac|ogg)$/i.test(f.name);
        });
        if (!readable.length) { statusEl.textContent = '인식 가능한 파일이 없어요'; return; }

        listEl.style.display = 'block';
        listEl.innerHTML     = '';

        parsedData = await parseMDFiles(
          readable,
          aiEnabled ? aiExtractNode : null,
          (i, total, name) => {
            statusEl.textContent = `[${i}/${total}] ${aiEnabled ? '🤖 ' : ''}${name}`;
          }
        );

        listEl.innerHTML = parsedData.slice(0,8).map(n =>
          `<div style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.3);
                       padding:3px 8px;border-bottom:1px solid rgba(255,255,255,0.04);">
             <span style="color:rgba(100,160,255,0.6);">${n.category}</span>
             &nbsp;·&nbsp;${n.title}
             &nbsp;<span style="opacity:0.4;">imp:${n.importance}</span>
           </div>`
        ).join('') + (parsedData.length > 8
          ? `<div style="font-size:9px;text-align:center;padding:6px;
                         color:rgba(255,255,255,0.2);">+ ${parsedData.length-8} more</div>` : '');

        statusEl.textContent = `✓  ${parsedData.length} NOTES READY`;
        loadBtn.disabled          = false;
        loadBtn.style.background  = 'rgba(80,130,255,0.15)';
        loadBtn.style.borderColor = 'rgba(80,130,255,0.40)';
        loadBtn.style.color       = '#8fb4ff';
        loadBtn.style.cursor      = 'pointer';
        hoverBtn(loadBtn,
          'background:rgba(80,130,255,0.28);border-color:rgba(80,130,255,0.65);',
          'background:rgba(80,130,255,0.15);border-color:rgba(80,130,255,0.40);'
        );
      }

      // ── 재귀 파일 수집 ──
      async function collectFiles(dirHandle) {
        const result = [];
        const EXTS = [
          '.md','.markdown','.txt','.text',
          '.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.tif','.tiff',
          '.stl','.obj','.dxf','.dwg','.step','.stp','.igs','.iges','.3dm','.fbx','.gltf','.glb',
          '.psd','.ai','.sketch','.xd','.fig','.eps','.indd','.cdr','.afdesign',
          '.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls',
          '.mp4','.mov','.avi','.mkv','.webm','.mp3','.wav','.flac','.aac','.ogg',
        ];
        try {
          for await (const [, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
              const low = handle.name.toLowerCase();
              if (!handle.name.startsWith('.') && EXTS.some(e => low.endsWith(e)))
                result.push(await handle.getFile());
            } else if (handle.kind === 'directory') {
              result.push(...await collectFiles(handle));
            }
          }
        } catch {}
        return result;
      }

      zone.addEventListener('click', async () => {
        if (window.showDirectoryPicker) {
          try {
            const dir = await window.showDirectoryPicker();
            statusEl.textContent = 'SCANNING...';
            const files = await collectFiles(dir);
            await handleFiles(files);
          } catch (e) {
            if (e.name !== 'AbortError') statusEl.textContent = 'FOLDER ACCESS DENIED';
          }
        } else {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.multiple = true;
          inp.accept = '.md,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.psd,.ai,.pdf,.docx,.dwg,.dxf,.step,.stl,.obj,.fbx,.mp4,.mp3';
          inp.setAttribute('webkitdirectory', '');
          inp.addEventListener('change', () => handleFiles(inp.files));
          inp.click();
        }
      });

      loadBtn.addEventListener('click', () => {
        if (!parsedData) return;
        overlay.style.transition = 'opacity 0.7s';
        overlay.style.opacity    = '0';
        setTimeout(() => { overlay.remove(); resolve(parsedData); }, 700);
      });
    }

    // ═══════════════════════════════
    // ③ 파일 → node 데이터 변환
    //    .md/.markdown  : 풀 파싱
    //    .txt/.text     : 자동 MD화
    //    이미지          : 썸네일 + 해상도
    //    CAD/디자인/문서 : 파일명+크기 → 노드
    // ═══════════════════════════════
    // aiExtract: async (file, textContent, imageDataUrl) => {title,importance,content}|null
    // onProgress: (i, total, filename) => void
    async function parseMDFiles(files, aiExtract = null, onProgress = null) {

      // 확장자 → 카테고리 매핑
      const EXT_CAT = {
        png:'IMAGE', jpg:'IMAGE', jpeg:'IMAGE', gif:'IMAGE',
        webp:'IMAGE', svg:'IMAGE', bmp:'IMAGE', ico:'IMAGE', tif:'IMAGE', tiff:'IMAGE',
        stl:'CAD', obj:'CAD', dxf:'CAD', dwg:'CAD', step:'CAD',
        stp:'CAD', igs:'CAD', iges:'CAD', '3dm':'CAD', fbx:'CAD', gltf:'CAD', glb:'CAD',
        psd:'DESIGN', ai:'DESIGN', sketch:'DESIGN', xd:'DESIGN',
        fig:'DESIGN', eps:'DESIGN', indd:'DESIGN', cdr:'DESIGN', afdesign:'DESIGN',
        pdf:'DOCUMENT', docx:'DOCUMENT', doc:'DOCUMENT',
        pptx:'DOCUMENT', ppt:'DOCUMENT', xlsx:'DOCUMENT', xls:'DOCUMENT',
        mp4:'MEDIA', mov:'MEDIA', avi:'MEDIA', mkv:'MEDIA', webm:'MEDIA',
        mp3:'MEDIA', wav:'MEDIA', flac:'MEDIA', aac:'MEDIA', ogg:'MEDIA',
      };

      // 파일 크기 → 중요도
      function sizeToImportance(bytes) {
        if (bytes <    50_000) return  3;
        if (bytes <   500_000) return  8;
        if (bytes < 5_000_000) return 15;
        if (bytes <50_000_000) return 22;
        return 28;
      }

      // 이미지 파일을 DataURL로 읽기
      function readAsDataURL(file) {
        return new Promise((res, rej) => {
          const r = new FileReader();
          r.onload  = e => res(e.target.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }

      // 텍스트 내용 → 미니 SVG 썸네일
      function makeTextPreviewSVG(text, label) {
        const lines = text.replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .split('\n').slice(0, 10);
        const lineEls = lines.map((l, i) =>
          `<text x="12" y="${22 + i * 14}" font-size="8.5" fill="rgba(180,210,255,0.75)"
           font-family="monospace">${l.slice(0, 42)}</text>`
        ).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 175" width="300" height="175">
  <rect width="300" height="175" fill="#080f1e" rx="6"/>
  <rect x="0" y="0" width="300" height="16" fill="#1a2a44" rx="6"/>
  <text x="8" y="11" font-size="9" fill="#6699cc" font-family="monospace" font-weight="bold">${label}</text>
  ${lineEls}
</svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      }

      // 표 데이터 → 미니 SVG 썸네일
      function makeTablePreviewSVG(rows, sheetName) {
        const maxCols = 5;
        const rowEls  = (rows || []).slice(0, 7).map((row, ri) => {
          const cells = (row || []).slice(0, maxCols).map((cell, ci) => {
            const x    = 8 + ci * 58;
            const y    = 28 + ri * 19;
            const fill = ri === 0 ? '#22aa55' : 'rgba(160,220,180,0.7)';
            const bg   = ri === 0 ? '#0a2015' : (ri%2===0?'#0d1a10':'#0a1810');
            return `<rect x="${x-1}" y="${y-12}" width="56" height="16" fill="${bg}" rx="2"/>
<text x="${x}" y="${y}" font-size="7.5" fill="${fill}" font-family="monospace">${String(cell??'').slice(0,9).replace(/</g,'&lt;')}</text>`;
          }).join('');
          return cells;
        }).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 175" width="300" height="175">
  <rect width="300" height="175" fill="#080f1e" rx="6"/>
  <rect x="0" y="0" width="300" height="16" fill="#0d2a15" rx="6"/>
  <text x="8" y="11" font-size="9" fill="#22cc66" font-family="monospace" font-weight="bold">XLSX · ${(sheetName||'').slice(0,20)}</text>
  ${rowEls}
</svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      }

      const notes = [];
      const CONVERT_URL  = 'http://localhost:3001';
      const PREVIEW_TIMEOUT = 3000; // 파일당 최대 3초 (이전 8초 → 단축)
      const PARALLEL_LIMIT  = 6;    // 동시 처리 최대 6개

      // PDF.js 브라우저 직접 파싱
      let _pdfLib = null;
      async function getPdfLib() {
        if (_pdfLib) return _pdfLib;
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
          mod.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
          _pdfLib = mod;
        } catch { _pdfLib = null; }
        return _pdfLib;
      }

      async function extractPdfText(file) {
        try {
          const lib = await getPdfLib();
          if (!lib) return null;
          const buf = await file.arrayBuffer();
          const pdf = await lib.getDocument({ data: buf }).promise;
          const maxPages = Math.min(pdf.numPages, 5); // 최대 5페이지만
          let text = '';
          for (let p = 1; p <= maxPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            text += content.items.map(i => i.str).join(' ') + '\n';
          }
          return { pages: pdf.numPages, text: text.slice(0, 1000) };
        } catch { return null; }
      }

      // 로컬 서버 생존 여부 (한 번만 체크, 캐시)
      let _serverAlive = null;
      async function isServerAlive() {
        if (_serverAlive !== null) return _serverAlive;
        try {
          await fetch(CONVERT_URL + '/health', { signal: AbortSignal.timeout(1500) });
          _serverAlive = true;
        } catch { _serverAlive = false; }
        return _serverAlive;
      }

      // 미리보기 fetch (단일 파일, 타임아웃 짧게)
      async function fetchPreview(file, ext) {
        // PDF는 브라우저에서 직접 처리
        if (ext === 'pdf') {
          const result = await extractPdfText(file);
          if (result) return { type: 'text', text: result.text, ext: 'PDF', pages: result.pages };
          return null;
        }
        // 로컬 서버 필요한 파일들 — 서버 없으면 즉시 스킵
        if (!await isServerAlive()) return null;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const endpoint = /^(dwg|dxf)$/i.test(ext) ? '/convert' : '/preview';
          const r = await fetch(CONVERT_URL + endpoint, {
            method: 'POST', body: fd,
            signal: AbortSignal.timeout(PREVIEW_TIMEOUT),
          });
          if (!r.ok) return null;
          if (endpoint === '/convert') {
            const svg = await r.text();
            return { type: 'svg-raw', svg };
          }
          return await r.json();
        } catch { return null; }
      }

      // 바이너리 파일 1개 → note 객체
      async function processBinary(file) {
        const ext      = (file.name.split('.').pop() || '').toLowerCase();
        const rawName  = file.name.replace(/\.[^.]+$/i, '');
        let title      = rawName.toUpperCase().replace(/[\s\-]+/g,'_').replace(/[^A-Z0-9_]/g,'');
        if (!title) return null;

        const category  = EXT_CAT[ext] || 'OTHER';
        const sizeStr   = file.size > 1_000_000
          ? (file.size/1_000_000).toFixed(1)+' MB'
          : (file.size/1_000).toFixed(0)+' KB';
        let importance  = sizeToImportance(file.size);
        let content     = `${ext.toUpperCase()} 파일 · ${sizeStr}`;
        let thumbnail   = null;
        let imageDataUrl = null;

        if (category === 'IMAGE') {
          try { imageDataUrl = thumbnail = await readAsDataURL(file); } catch {}
        } else {
          const res = await fetchPreview(file, ext);
          if (res) {
            if (res.type === 'svg-raw') {
              thumbnail = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(res.svg)));
              content   = `${ext.toUpperCase()} 도면 · ${sizeStr}`;
            } else if (res.type === 'image') {
              thumbnail = res.dataUrl;
              if (res.pages) content = `${ext.toUpperCase()} · ${res.pages}페이지 · ${sizeStr}`;
            } else if (res.type === 'svg') {
              thumbnail = res.dataUrl;
            } else if (res.type === 'text') {
              thumbnail = makeTextPreviewSVG(res.text, res.ext || ext.toUpperCase());
              content   = res.text.slice(0, 200);
            } else if (res.type === 'table') {
              thumbnail = makeTablePreviewSVG(res.rows, res.sheetName);
              content   = res.preview;
            }
          }
        }

        // AI 분석
        if (aiExtract) {
          const ai = await aiExtract(file, '', imageDataUrl);
          if (ai) {
            const t = String(ai.title||'').toUpperCase().replace(/[\s\-]+/g,'_').replace(/[^A-Z0-9_]/g,'');
            if (t)             title = t;
            if (ai.importance) importance = Math.min(30, Math.max(1, Number(ai.importance)));
            if (ai.content)    content    = String(ai.content);
          }
        }

        return { title, category, importance, content, links: [], thumbnail };
      }

      // ── 1단계: 파일 분류 ──
      const binaryFiles = [];
      const textFiles   = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (/^(md|markdown|txt|text)$/.test(ext)) textFiles.push(f);
        else binaryFiles.push(f);
      }

      let processed = 0;
      const total   = files.length;

      // ── 2단계: 바이너리 파일 병렬 처리 (PARALLEL_LIMIT개씩) ──
      for (let i = 0; i < binaryFiles.length; i += PARALLEL_LIMIT) {
        const chunk = binaryFiles.slice(i, i + PARALLEL_LIMIT);
        onProgress?.(processed + 1, total, chunk[0].name);
        const results = await Promise.all(chunk.map(f => processBinary(f)));
        results.forEach(n => { if (n) notes.push(n); });
        processed += chunk.length;
        onProgress?.(processed, total, '');
      }

      // ── 3단계: 텍스트 파일 처리 (순서 유지) ──
      for (const file of textFiles) {
        onProgress?.(++processed, total, file.name);
        const ext    = (file.name.split('.').pop() || '').toLowerCase();
        const isText = true;

        // ══ 텍스트 파일 파싱 ══
        let text;
        try { text = await file.text(); } catch { continue; }

        const isMD = /^(md|markdown)$/.test(ext);
        let importance = null;
        let links      = [];
        let content    = '';
        let title      = '';

        if (isMD) {
          // MD: frontmatter + H1 + [[links]]
          const fmM = text.match(/^---\n([\s\S]*?)\n---/);
          if (fmM) {
            const im = fmM[1].match(/importance:\s*(\d+)/);
            if (im) importance = parseInt(im[1]);
          }
          const titleM = text.match(/^#\s+(.+)$/m);
          const raw    = titleM ? titleM[1].trim() : file.name.replace(/\.[^.]+$/i, '');
          title = raw.toUpperCase().replace(/[\s\-]+/g, '_').replace(/[^A-Z0-9_]/g, '');
          links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => ({
            target: m[1].toUpperCase().replace(/[\s\-]+/g,'_').replace(/[^A-Z0-9_]/g,''),
            similarity: 1,
          }));
          content = text
            .replace(/^---[\s\S]*?---\n?/, '')
            .replace(/^#.*$/m, '')
            .replace(/\[\[.*?\]\]/g, '')
            .split('\n').map(l => l.trim()).filter(l => l).join(' ')
            .substring(0, 280);

        } else {
          // TXT: 첫 줄이 짧으면 제목, 아니면 파일명
          const lines     = text.split('\n').map(l => l.trim()).filter(l => l);
          const firstLine = lines[0] || '';
          const useName   = firstLine.length > 0 && firstLine.length <= 60;
          const raw       = useName ? firstLine : file.name.replace(/\.[^.]+$/i, '');
          title   = raw.toUpperCase().replace(/[\s\-]+/g,'_').replace(/[^A-Z0-9_]/g,'');
          content = lines.slice(useName ? 1 : 0).join(' ').substring(0, 280);

          // TXT도 AI로 향상
          if (aiExtract) {
            const ai = await aiExtract(file, text, null);
            if (ai) {
              const t = String(ai.title||'').toUpperCase()
                .replace(/[\s\-]+/g,'_').replace(/[^A-Z0-9_]/g,'');
              if (t)             title      = t;
              if (ai.importance) importance = Math.min(30, Math.max(1, Number(ai.importance)));
              if (ai.content)    content    = String(ai.content);
            }
          }
        }

        if (!title) continue;

        if (importance === null) {
          const wc = text.split(/\s+/).length;
          importance = Math.min(30, Math.max(1, Math.round(wc / 8 + links.length * 2)));
        }

        const prefix   = title.split('_')[0];
        const category = CATS.includes(title)  ? title
                       : CATS.includes(prefix) ? prefix
                       : 'OTHER';

        notes.push({ title, category,
          importance: Math.min(30, Math.max(1, importance)),
          content, links, thumbnail: null });
      }

      // 링크 정제: 이 볼트에 존재하는 노드만
      const titleSet = new Set(notes.map(n => n.title));
      notes.forEach(n => {
        n.links = n.links.filter(l => titleSet.has(l.target));
      });

      return notes;
    }

    // 첫 진입은 로그인, 이후 재선택은 폴더 피커로 바로
    if (_vaultSetupDone) {
      const savedName = localStorage.getItem('_vaultName') || '';
      showFolderPicker(savedName);
    } else {
      _vaultSetupDone = true;
      showLogin();
    }
  });
}

// ===== 데이터 로드 =====
animate();   // 파티클·바닥 무늬는 로그인 전부터 실행
const _vaultData = await runVaultSetup();
buildVaultFromData(_vaultData);

// ③ 검색 초기화 (/ 키 전역 단축키)
initSearch(noteNodes, showSidePanel, allSpheres);
// ④ 방문 기반 밝기 히트맵
buildActivityMap(noteNodes);
// ☁ 클라우드 메모 동기화 (Supabase 설정된 경우)
const _cloudUser = localStorage.getItem('_vaultName') || '';
if (cloudEnabled) syncFromCloud(_cloudUser);

// ── 아래는 buildVaultFromData 내부로 이동됨 (삭제 예정 더미 블록) ──
if (false) {
  const data = _vaultData;
  data.forEach(note => {
    if (!categorizedData[note.category]) categorizedData[note.category] = [];
    categorizedData[note.category].push(note);
  });

  // 노드 생성
  data.forEach(note => {
      const size = 0.12 + note.importance * 0.022;
      const geo = new THREE.IcosahedronGeometry(size, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        v.multiplyScalar(size * (i % 12 === 0 ? 1.18 : 1.0));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();

      const emissive = note.importance >= 15 ? 0xffcc33 : note.importance >= 8 ? 0x33ddff : 0xaa77ff;
      const emissiveIntensity = note.importance >= 15 ? 2.2 : note.importance >= 8 ? 1.6 : 1.0;
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, emissive, emissiveIntensity,
        roughness: 0.55, metalness: 0.9, reflectivity: 1,
        iridescence: 1, iridescenceIOR: 1.2,
        transparent: true, opacity: 0.9,
        flatShading: true, clearcoat: 1, clearcoatRoughness: 0,
      });

      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData = {
        title: note.title, content: note.content,
        links: note.links, importance: note.importance,
        category: note.category,
        floatOffset: Math.random() * Math.PI * 2,
        dimmed: false, selected: false,
      };

      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 14;
      sphere.position.set(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 24 + 8,
        Math.sin(angle) * radius,
      );
      sphere.userData.baseY = sphere.position.y;

      nodeGroup.add(sphere);
      noteNodes[note.title] = sphere;
      allSpheres.push(sphere);

      // ③ 노드 후광 스프라이트
      const spriteSize = size * 11;
      const spriteOpacity = note.importance >= 15 ? 0.22 : note.importance >= 8 ? 0.15 : 0.10;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: emissive,
        transparent: true,
        opacity: spriteOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }));
      sprite.scale.set(spriteSize, spriteSize, 1);
      sprite.renderOrder = -1;
      sprite.userData.baseOpacity = spriteOpacity;
      sphere.add(sprite);

      // 글로우 링 (중요도 ≥ 15)
      if (note.importance >= 15) {
        const r = size;
        const ringMesh1 = new THREE.Mesh(
          new THREE.TorusGeometry(r * 2.4, r * 0.11, 8, 64),
          new THREE.MeshBasicMaterial({
            color: note.importance >= 25 ? 0xffcc33 : 0x55ddff,
            transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        ringMesh1.rotation.x = Math.PI / 2;
        ringMesh1.userData.baseOpacity = 0.55;
        sphere.add(ringMesh1);
        glowRings.push({ ring: ringMesh1, speed: 0.55 + Math.random() * 0.3, phase: Math.random() * Math.PI * 2 });

        const ringMesh2 = new THREE.Mesh(
          new THREE.TorusGeometry(r * 3.6, r * 0.065, 8, 64),
          new THREE.MeshBasicMaterial({
            color: note.importance >= 25 ? 0xff9933 : 0x33aaff,
            transparent: true, opacity: 0.32,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        ringMesh2.rotation.x = Math.PI / 3;
        ringMesh2.rotation.z = Math.PI / 5 + Math.random();
        ringMesh2.userData.baseOpacity = 0.32;
        sphere.add(ringMesh2);
        glowRings.push({ ring: ringMesh2, speed: -(0.35 + Math.random() * 0.25), phase: Math.random() * Math.PI * 2 });
      }
    });

    // 선 생성
    data.forEach(note => {
      const src = noteNodes[note.title];
      if (!src) return;
      (note.links || []).forEach(link => {
        if (!link || !link.target) return;
        const tgt = noteNodes[link.target];
        if (!tgt) return;
        // 연관성(similarity) + 노드 중요도 기반 선 굵기
        const sim    = (link && typeof link === 'object' && link.similarity) ? link.similarity : 1;
        const avgImp = (src.userData.importance + tgt.userData.importance) / 2;
        const lw     = 0.8 + sim * 0.6 + avgImp * 0.09; // ~1–5px

        const lineGeo = new LineGeometry();
        lineGeo.setPositions([
          src.position.x, src.position.y, src.position.z,
          tgt.position.x, tgt.position.y, tgt.position.z,
        ]);
        const lineMat = new LineMaterial({
          color: 0x4bb8ff,
          linewidth: lw,
          transparent: true,
          opacity: 0.40,
          resolution: new THREE.Vector2(innerWidth, innerHeight),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const line = new Line2(lineGeo, lineMat);
        line.computeLineDistances();
        line.userData.phase    = Math.random() * Math.PI * 2;
        line.userData.dimmed   = false;
        line.userData.baseLW   = lw;
        line.renderOrder = 1;
        nodeGroup.add(line);
        lineObjects.push({ line, src, tgt });
      });
    });

    buildCategoryView();
  }
