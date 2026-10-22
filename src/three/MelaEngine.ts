import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MelaInteractableSpec,
  PartnerStallData,
  RANGOLI_COLORS,
  THEME_COLORS,
  buildAllInteractables,
} from '../data/melaData';
import { MelaAudioEngine } from '../audio/melaAudio';
import {
  createCanopyStripeTexture,
  createContactShadowTexture,
  createRadialGlowTexture,
  createRangoliTexture,
  createSignboardTexture,
  createWoodPlankTexture,
} from './proceduralTextures';

export type MelaMode =
  | 'welcome'
  | 'entering'
  | 'walk'
  | 'balloon'
  | 'ring'
  | 'diya-game'
  | 'rangoli'
  | 'ride'
  | 'well'
  | 'stage'
  | 'firework-show'
  | 'temple-aarti'
  | 'finale';

export interface GameHudState {
  mode: 'balloon' | 'ring' | 'diya-game' | 'rangoli' | 'well' | 'temple-aarti';
  shotsLeft: number;
  score: number;
  totalTargets?: number;
  done: boolean;
  message: string;
  spectator?: boolean;
  selectedColor?: string;
  symmetry?: boolean;
}

export interface CinematicBanner {
  title: string;
  text: string;
  phase: string;
}

export interface PlayerStats {
  balloonsPopped: number;
  ringsLanded: number;
  diyasLit: number;
  ridesTaken: string[];
  foodTasted: string[];
  items: string[];
  finaleWatched: boolean;
  sparklerActive: boolean;
}

export interface MelaEngineCallbacks {
  onModeChange: (mode: MelaMode, activeSpec: MelaInteractableSpec | null) => void;
  onNearChange: (near: MelaInteractableSpec | null) => void;
  onTalk: (spec: MelaInteractableSpec) => void;
  onGameUpdate: (state: GameHudState | null) => void;
  onRideProgress: (progress: number, rideName: string) => void;
  onCinematic: (banner: CinematicBanner | null) => void;
  onStatsChange: (stats: PlayerStats) => void;
  onToast: (msg: string) => void;
  onOpenPhotoCard: (dataUrl: string) => void;
  onOpenDaanPeti: () => void;
}

// Pre-allocated math helpers outside the render loop (Zero GC in tick)
const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _color = new THREE.Color();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

interface FireworkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  size: number;
}

interface SkyLanternInstance {
  x: number;
  y: number;
  z: number;
  vy: number;
  driftPhase: number;
  scale: number;
}

interface MelaCrowdVisitor {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  head: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  greetingSprite: THREE.Sprite;
  role:
    | 'roaming'
    | 'sitting'
    | 'standing'
    | 'riding-wheel'
    | 'riding-carousel'
    | 'riding-ship'
    | 'well-spectator'
    | 'playing-balloon'
    | 'playing-ring';
  name: string;
  greetingText: string;
  voiceLine: string;
  walkSpeed: number;
  waypoints: { x: number; z: number }[];
  currentWaypoint: number;
  baseYaw: number;
  phase: number;
  waveTimer: number;
}


export class MelaEngine {
  private host: HTMLElement;
  private callbacks: MelaEngineCallbacks;
  public audio: MelaAudioEngine;
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public isSoftwareGl = false;

  public mode: MelaMode = 'welcome';
  public activeSpec: MelaInteractableSpec | null = null;
  public nearSpec: MelaInteractableSpec | null = null;
  public interactables: MelaInteractableSpec[] = [];

  // Player state
  public player = { x: 0, z: 54, yaw: 0, pitch: 0.04 };
  private keys = new Set<string>();
  public joystick = { x: 0, y: 0 };
  public isRunning = false;
  private dragState: { startX: number; startY: number; lastX: number; lastY: number; moved: number } | null = null;

  // Stats / Souvenir Jhola
  public stats: PlayerStats = {
    balloonsPopped: 0,
    ringsLanded: 0,
    diyasLit: 0,
    ridesTaken: [],
    foodTasted: [],
    items: ['Shubh Deepavali Entry Pass'],
    finaleWatched: false,
    sparklerActive: true,
  };

  // Dynamic 3D scene references
  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameId = 0;
  private disposed = false;

  private dynamicRoot = new THREE.Group();
  private shopkeeperArms: THREE.Object3D[] = [];
  private flameMeshes: THREE.Object3D[] = [];

  // Attractions for animation
  private ferrisWheelRim!: THREE.Group;
  private ferrisGondolas: THREE.Group[] = [];
  private carouselPlatform!: THREE.Group;
  private carouselHorses: THREE.Object3D[] = [];
  private pirateShipPivot!: THREE.Group;
  private pirateShipHull: THREE.Group | null = null;
  private wellRoot: THREE.Group | null = null;
  private wellBikes: { group: THREE.Group; angle: number; height: number; speed: number }[] = [];
  private wellRings: { mesh: THREE.Mesh; angle: number; height: number; collected: boolean }[] = [];

  // Mini-game objects
  private balloonTargets: { mesh: THREE.Mesh; basePos: THREE.Vector3; popped: boolean; color: number }[] = [];
  private npcBalloonSparkTimer = 0;
  private npcRingMesh: THREE.Mesh | null = null;
  private ringFlight: {
    mesh: THREE.Mesh;
    active: boolean;
    t: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    willWin: boolean;
  } | null = null;
  private mandapDiyas: { group: THREE.Group; flame: THREE.Object3D; lit: boolean; index: number }[] = [];
  private daanPetiCollider: THREE.Object3D | null = null;

  // Interactive 3D Floor Rangoli state
  private rangoliGroup: THREE.Group | null = null;
  private rangoliSegments: {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    ringIndex: number; // 0 = center, 1 = inner lotus, 2 = middle diamond, 3 = outer scallop
    petalIndex: number;
    filled: boolean;
    colorHex: string;
  }[] = [];
  private rangoliBowls: { mesh: THREE.Object3D; hex: string; name: string }[] = [];
  public selectedRangoliColor: string = RANGOLI_COLORS[0].hex;
  public rangoliSymmetry = true;

  // Mela Crowd Visitors (roaming, sitting & eating, standing at shops)
  private crowdVisitors: MelaCrowdVisitor[] = [];

  // Mandir Ghanti (Temple Bell) & Interactive Maha-Aarti Thali at 7 Diyas Mandap
  private mandapBellPivot: THREE.Group | null = null;
  private mandapBellTimer = 0;
  private mandapAartiThali: THREE.Group | null = null;
  private mandapAartiBasePos = new THREE.Vector3(0, 1.08, 3.95);
  private mandapAartiTimer = 0;

  // Grand Shri Laxmi-Ganesh Maha-Mandir (Temple, Colossal Idols & Interactive Aarti Thali)
  private templeGroup: THREE.Group | null = null;
  private templeBellPivot: THREE.Group | null = null;
  private templeBellTimer = 0;
  private templeAartiThali: THREE.Group | null = null;
  private templeAartiBasePos = new THREE.Vector3(0, 2.16, 2.85);
  private templeAartiTimer = 0;
  private templeAartiAngle = 0;
  private templeAartiCircles = 0;
  private templeHalos: THREE.Object3D[] = [];
  private templeFlagMesh: THREE.Object3D | null = null;
  private templePrasadGroup: THREE.Group | null = null;

  // Interactive 3D Ground Crackers (Anaar, Chakri, Sky Rocket)
  private groundCrackers: {
    group: THREE.Group;
    wheelMesh?: THREE.Object3D;
    kind: 'anaar' | 'chakri' | 'rocket';
    activeTimer: number;
    basePos: THREE.Vector3;
  }[] = [];

  // Floating Personalized Wish Sky Lanterns
  private wishLanterns: {
    group: THREE.Group;
    vy: number;
    phase: number;
  }[] = [];



  // Activity / Cinematic timers
  private entryStartTime = 0;
  private rideTimer = 0;
  private rideDuration = 16;
  private fireworkTimer = 0;
  private finaleTimer = 0;
  private finalePhase = '';

  // Well of Death rider state
  private wellState = {
    spectator: false,
    angle: 0,
    height: 3.4,
    speed: 6.2,
    score: 0,
    timeLeft: 22,
    verticalInput: 0,
    boost: false,
  };

  // Game state
  private gameState: GameHudState | null = null;

  // Fireworks & Sparkler particle systems
  private fwGeometry!: THREE.BufferGeometry;
  private fwPoints!: THREE.Points;
  private fwParticles: FireworkParticle[] = [];
  private readonly maxFwParticles = 900;

  // Sky Lanterns (Akashdeep) InstancedMesh
  private lanternMesh!: THREE.InstancedMesh;
  private lanterns: SkyLanternInstance[] = [];
  private readonly maxLanterns = 120;

  // Handheld Sparkler (Phuljhari)
  private sparklerGroup = new THREE.Group();
  private sparklerTipLight!: THREE.PointLight;

  // Shared textures
  private glowTexture!: THREE.CanvasTexture;
  private shadowTexture!: THREE.CanvasTexture;
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();

  constructor(host: HTMLElement, partners: PartnerStallData[], callbacks: MelaEngineCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.audio = new MelaAudioEngine();
    this.interactables = buildAllInteractables(partners);

    this.initRendererAndScene();
    this.buildStaticEnvironment();
    this.rebuildStallsAndAttractions();
    this.initParticleSystems();
    this.initHandheldSparkler();
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.callbacks.onStatsChange({ ...this.stats });
    this.tick();
  }

  private initRendererAndScene(): void {
    // 1. Software WebGL detection per Three.js skill directive
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.host.clientWidth || window.innerWidth, this.host.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D Diwali Mela. Use WASD or arrow keys to walk, drag to look, E to interact.'
    );
    this.renderer.domElement.className = 'w-full h-full block outline-none';
    this.renderer.domElement.tabIndex = 0;
    this.host.innerHTML = '';
    this.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0x0e1525);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.FogExp2(0x0e1525, 0.0115);

    this.camera = new THREE.PerspectiveCamera(
      62,
      (this.host.clientWidth || window.innerWidth) / (this.host.clientHeight || window.innerHeight),
      0.15,
      220
    );
    this.scene.add(this.camera);

    // Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Warm Key Light + Cool Indigo HemisphereLight
    const hemiLight = new THREE.HemisphereLight(0x3a4f7a, 0x6b4423, 0.85);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffd28a, 1.35);
    keyLight.position.set(28, 45, 32);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      const d = 55;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 130;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    // Warm bazaar fill lights along the main promenade
    const bazaarZ = [35, 10, -15, -40];
    for (const zPos of bazaarZ) {
      const point = new THREE.PointLight(0xffaa44, 28, 36, 1.7);
      point.position.set(0, 7.5, zPos);
      this.scene.add(point);
    }

    this.glowTexture = createRadialGlowTexture();
    this.shadowTexture = createContactShadowTexture();
    this.scene.add(this.dynamicRoot);
  }

  private addContactShadow(parent: THREE.Object3D, width: number, depth: number): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.02;
    parent.add(plane);
  }

  private buildStaticEnvironment(): void {
    // 1. Expansive Earthen Fairground Terrain
    const groundGeo = new THREE.CircleGeometry(140, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a1f18,
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Central Sandstone / Festive Brick Promenade Path (offset Y >= 0.02 to prevent Z-fighting)
    const mainPath = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 110),
      new THREE.MeshStandardMaterial({ color: 0x473325, roughness: 0.85, metalness: 0.08 })
    );
    mainPath.rotation.x = -Math.PI / 2;
    mainPath.position.set(0, 0.025, -8);
    mainPath.receiveShadow = true;
    this.scene.add(mainPath);

    // Cross Avenue for Games & Rides
    const crossPath1 = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 10),
      new THREE.MeshStandardMaterial({ color: 0x473325, roughness: 0.85, metalness: 0.08 })
    );
    crossPath1.rotation.x = -Math.PI / 2;
    crossPath1.position.set(0, 0.03, 8);
    this.scene.add(crossPath1);

    const crossPath2 = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 12),
      new THREE.MeshStandardMaterial({ color: 0x473325, roughness: 0.85, metalness: 0.08 })
    );
    crossPath2.rotation.x = -Math.PI / 2;
    crossPath2.position.set(0, 0.035, -24);
    this.scene.add(crossPath2);

    // 2. Three Giant Glowing Rangoli Mandala Courtyards (with polygonOffset)
    const rangoliTex1 = createRangoliTexture(this.renderer, '#ff9933', '#e62e6b', '#17a589');
    const rangoliTex2 = createRangoliTexture(this.renderer, '#f4b41a', '#c71585', '#2980b9');
    const rangoliPositions = [
      { x: 0, z: 38, size: 7.5, tex: rangoliTex1 },
      { x: 0, z: 22, size: 6.5, tex: rangoliTex2 },
      { x: 0, z: -10, size: 9.5, tex: rangoliTex1 },
      { x: 0, z: -24.5, size: 8.5, tex: rangoliTex2 },
      { x: 0, z: -62, size: 11.0, tex: rangoliTex2 },
    ];
    for (const r of rangoliPositions) {
      const rMat = new THREE.MeshStandardMaterial({
        map: r.tex,
        transparent: true,
        roughness: 0.6,
        metalness: 0.15,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(r.size, r.size), rMat);
      rMesh.rotation.x = -Math.PI / 2;
      rMesh.position.set(r.x, 0.045, r.z);
      this.scene.add(rMesh);
    }

    // 3. Grand Entrance Gate ("शुभ दीपावली · DIWALI MELA") at z = 44
    this.buildEntranceToranArch(0, 44);

    // 4. Overhead Fairy Light Canopies & Hanging Kandil Lanterns along the Bazaar
    this.buildOverheadFairyLights();

    // 5. Starry Diwali Night Sky & Natural Tree Grove Perimeter (InstancedMesh)
    this.buildStarrySkyAndPerimeterTrees();
  }

  private buildEntranceToranArch(x: number, z: number): void {
    const arch = new THREE.Group();
    arch.position.set(x, 0, z);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8c2323, roughness: 0.55, metalness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.28, metalness: 0.82 });
    const marigoldOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.7 });
    const marigoldYellowMat = new THREE.MeshStandardMaterial({ color: 0xffd11a, roughness: 0.7 });

    // Left and right composite pillars
    for (const side of [-1, 1]) {
      const px = side * 6.2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), goldMat);
      base.position.set(px, 0.5, 0);
      arch.add(base);

      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 7.5, 16), pillarMat);
      column.position.set(px, 4.25, 0);
      arch.add(column);

      // Golden rings on pillar
      for (const ry of [2.2, 4.2, 6.2]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 10, 20), goldMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(px, ry, 0);
        arch.add(ring);
      }

      // Top Kalash finial on each pillar
      const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), goldMat);
      kalash.position.set(px, 8.5, 0);
      arch.add(kalash);
    }

    // Crossbeam & Main Signboards
    const beam = new THREE.Mesh(new THREE.BoxGeometry(14.2, 1.8, 0.9), pillarMat);
    beam.position.set(0, 7.6, 0);
    arch.add(beam);

    const signTex = createSignboardTexture(
      this.renderer,
      'शुभ दीपावली · DIWALI MELA',
      'Diwali Mela chaloge mere sath? 🪔',
      '#4f121d',
      '#ffd27d',
      '#fff6de'
    );
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    for (const dir of [1, -1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.5), signMat);
      board.position.set(0, 7.8, dir * 0.48);
      if (dir === -1) board.rotation.y = Math.PI;
      arch.add(board);
    }

    // Scalloped Marigold Toran Garlands hanging under the beam
    for (let i = -5; i <= 5; i++) {
      const bola = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 10),
        i % 2 === 0 ? marigoldOrangeMat : marigoldYellowMat
      );
      bola.position.set(i * 1.05, 6.35 + Math.sin(i * 0.9) * 0.18, 0);
      arch.add(bola);
    }

    this.addContactShadow(arch, 15, 3.5);
    this.scene.add(arch);
  }

  private buildOverheadFairyLights(): void {
    // Glowing golden fairy bulbs & hanging Kandil lanterns crisscrossing the bazaar
    const bulbGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });

    const rowsZ = [40, 30, 20, 10, 0, -10, -20, -30, -42];
    const bulbsPerRow = 15;
    const totalBulbs = rowsZ.length * bulbsPerRow;
    const instancedBulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, totalBulbs);

    let idx = 0;
    for (const z of rowsZ) {
      for (let i = 0; i < bulbsPerRow; i++) {
        const t = i / (bulbsPerRow - 1);
        const x = THREE.MathUtils.lerp(-11, 11, t);
        const sag = Math.sin(t * Math.PI) * 1.15;
        const y = 6.8 - sag;
        _mat4.makeTranslation(x, y, z);
        instancedBulbs.setMatrixAt(idx, _mat4);
        _color.setHex(i % 3 === 0 ? 0xffb84d : i % 2 === 0 ? 0xffe8a3 : 0xff758f);
        instancedBulbs.setColorAt(idx, _color);
        idx++;
      }
    }
    instancedBulbs.instanceMatrix.needsUpdate = true;
    if (instancedBulbs.instanceColor) instancedBulbs.instanceColor.needsUpdate = true;
    instancedBulbs.computeBoundingSphere();
    this.scene.add(instancedBulbs);
  }

  private buildStarrySkyAndPerimeterTrees(): void {
    // Starfield points
    const starCount = 450;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.44;
      const r = 115;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) + 8;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xfff0cc, size: 0.55, transparent: true, opacity: 0.85 });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Natural perimeter tree grove (InstancedMesh trunks + foliage crowns)
    const treeCount = 64;
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 3.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.9 });
    const crownGeo = new THREE.IcosahedronGeometry(2.4, 1);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x1e382b, roughness: 0.75 });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      // Leave a welcoming gap behind the entrance gate on the south side
      const radius = 68 + (i % 3) * 8;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius - 8;
      const s = 0.85 + (i % 5) * 0.12;

      _quat.identity();
      _scale.set(s, s, s);
      _mat4.compose(_vec3.set(tx, 1.6 * s, tz), _quat, _scale);
      trunks.setMatrixAt(i, _mat4);

      _mat4.compose(_vec3.set(tx, 4.4 * s, tz), _quat, _scale);
      crowns.setMatrixAt(i, _mat4);
      _color.setHex(i % 2 === 0 ? 0x1d3b2a : 0x254232);
      crowns.setColorAt(i, _color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    this.scene.add(trunks);
    this.scene.add(crowns);
  }

  public updatePartnerStalls(partners: PartnerStallData[]): void {
    this.interactables = buildAllInteractables(partners);
    this.rebuildStallsAndAttractions();
  }

  private rebuildStallsAndAttractions(): void {
    // Clear previous dynamic children
    while (this.dynamicRoot.children.length > 0) {
      const child = this.dynamicRoot.children[0];
      this.dynamicRoot.remove(child);
    }
    this.shopkeeperArms = [];
    this.flameMeshes = [];
    this.balloonTargets = [];
    this.mandapDiyas = [];
    this.ferrisGondolas = [];
    this.carouselHorses = [];
    this.pirateShipHull = null;
    this.wellRoot = null;
    this.wellBikes = [];
    this.wellRings = [];
    this.npcRingMesh = null;
    this.rangoliSegments = [];
    this.rangoliBowls = [];
    this.rangoliGroup = null;
    this.crowdVisitors = [];
    this.mandapBellPivot = null;
    this.mandapAartiThali = null;
    this.templeGroup = null;
    this.templeBellPivot = null;
    this.templeAartiThali = null;
    this.templeHalos = [];
    this.templeFlagMesh = null;
    this.templePrasadGroup = null;
    this.groundCrackers = [];
    this.wishLanterns = [];



    for (const spec of this.interactables) {
      switch (spec.type) {
        case 'food':
        case 'toy':
        case 'diya-craft':
        case 'partner':
          this.buildMarketStall(spec);
          break;
        case 'balloon':
          this.buildBalloonGameStall(spec);
          break;
        case 'ring':
          this.buildRingTossStall(spec);
          break;
        case 'diya-game':
          this.buildDeepotsavMandap(spec);
          break;
        case 'daan-peti':
          this.buildDaanPeti(spec);
          break;
        case 'rangoli':
          this.buildRangoliArea(spec);
          break;
        case 'wheel':
          this.buildFerrisWheel(spec);
          break;
        case 'carousel':
          this.buildCarousel(spec);
          break;
        case 'pirate-ship':
          this.buildPirateShip(spec);
          break;
        case 'well':
          this.buildWellOfDeath(spec);
          break;
        case 'stage':
          this.buildCulturalStage(spec);
          break;
        case 'photo':
          this.buildPhotoBoothToran(spec);
          break;
        case 'fireworks':
          this.buildFireworksPavilion(spec);
          break;
        case 'temple':
          this.buildLaxmiGaneshTemple(spec);
          break;
        case 'finale':
          this.buildGrandAkashdeepTower(spec);
          break;
      }
    }

    // Populate the fairground with lively crowds: roaming families, people sitting & eating chaat/jalebi, and shoppers standing at stalls
    this.buildMelaCrowdsAndTables();

    // Build Interactive Patakha Chबूतरा (Click-to-light Anaar, Chakri & Rocket pad in the bazaar plaza)
    this.buildInteractivePatakhaPad(5.8, 1.5);
  }



  private createClayDiyaMesh(scale = 1, lit = true): { group: THREE.Group; flame: THREE.Object3D } {
    const group = new THREE.Group();
    const clayMat = new THREE.MeshStandardMaterial({ color: 0xb34b28, roughness: 0.72, metalness: 0.1 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.8 });

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.18 * scale, 0.18 * scale, 14), clayMat);
    bowl.position.y = 0.09 * scale;
    group.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31 * scale, 0.035 * scale, 8, 16), goldTrimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.18 * scale;
    group.add(rim);

    // Flame group
    const flameGroup = new THREE.Group();
    flameGroup.position.set(0, 0.26 * scale, 0.18 * scale);

    const flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 * scale, 0.26 * scale, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 })
    );
    flameGroup.add(flameMesh);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffaa33,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
    );
    sprite.scale.set(0.85 * scale, 0.85 * scale, 1);
    flameGroup.add(sprite);

    flameGroup.visible = lit;
    group.add(flameGroup);
    if (lit) {
      this.flameMeshes.push(flameGroup);
    }

    return { group, flame: flameGroup };
  }

  private createShopkeeper(themeHex: number): THREE.Group {
    const npc = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99b72, roughness: 0.65 });
    const kurtaMat = new THREE.MeshStandardMaterial({ color: themeHex, roughness: 0.55, metalness: 0.15 });
    const turbanMat = new THREE.MeshStandardMaterial({ color: 0xffb732, roughness: 0.45, metalness: 0.25 });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.15, 12), kurtaMat);
    torso.position.y = 1.15;
    npc.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skinMat);
    head.position.y = 1.95;
    npc.add(head);

    // Festive Pagdi / Turban
    const turban = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.09, 10, 16), turbanMat);
    turban.rotation.x = Math.PI / 2 - 0.15;
    turban.position.set(0, 2.1, -0.02);
    npc.add(turban);

    // Waving right arm
    const armPivot = new THREE.Group();
    armPivot.position.set(0.34, 1.55, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8), kurtaMat);
    arm.position.y = -0.22;
    armPivot.add(arm);
    armPivot.rotation.z = 2.4;
    npc.add(armPivot);
    this.shopkeeperArms.push(armPivot);

    return npc;
  }

  private buildMarketStall(spec: MelaInteractableSpec): void {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotY;
    group.userData.spec = spec;

    const themeInfo = THEME_COLORS[spec.theme] || THEME_COLORS.kesari;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4d3222, roughness: 0.85 });
    const counterMat = new THREE.MeshStandardMaterial({ color: themeInfo.hex, roughness: 0.55, metalness: 0.15 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.78 });

    // 4 Corner Bamboo/Timber Posts
    for (const [px, pz] of [
      [-2.1, -1.3],
      [2.1, -1.3],
      [-2.1, 1.3],
      [2.1, 1.3],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 3.6, 10), woodMat);
      post.position.set(px, 1.8, pz);
      group.add(post);
    }

    // Counter Table + Zari Trim
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 1.4), counterMat);
    counter.position.set(0, 0.525, 0.6);
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    const zariStrip = new THREE.Mesh(new THREE.BoxGeometry(4.26, 0.12, 1.44), goldMat);
    zariStrip.position.set(0, 1.02, 0.6);
    group.add(zariStrip);

    // Striped Festive Awning Roof
    const canopyTex = createCanopyStripeTexture(this.renderer, themeInfo.css);
    const roofMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.65 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.35, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 4.15, 0);
    group.add(roof);

    // Signboard
    const signTex = createSignboardTexture(
      this.renderer,
      spec.name,
      spec.hindiSub,
      '#3d101b',
      themeInfo.accent,
      '#fff5dd'
    );
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(4.1, 0.95),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 3.35, 1.36);
    group.add(signBoard);

    // Two Lit Clay Diyas on the Counter Corners
    for (const dx of [-1.75, 1.75]) {
      const { group: diya } = this.createClayDiyaMesh(0.65, true);
      diya.position.set(dx, 1.08, 1.05);
      group.add(diya);
    }

    // Counter Props based on stall type
    const propGroup = new THREE.Group();
    propGroup.position.set(0, 1.08, 0.6);
    if (spec.id === 'food-gola' || spec.id === 'food-kulfi') {
      // Traditional Red-Cloth Wrapped Matka Kulfi Pot & Rainbow Kala Khatta Syrup Bottles
      const redClothMat = new THREE.MeshStandardMaterial({ color: 0xc9182b, roughness: 0.65 });
      const matka = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), redClothMat);
      matka.position.set(-0.85, 0.34, 0);
      const matkaNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.16, 12), goldMat);
      matkaNeck.position.set(-0.85, 0.68, 0);
      propGroup.add(matka, matkaNeck);

      const syrupColors = [0xff1744, 0x00e676, 0xffea00, 0xd500f9, 0xff6d00];
      for (let b = 0; b < syrupColors.length; b++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.075, 0.34, 10),
          new THREE.MeshStandardMaterial({
            color: syrupColors[b],
            emissive: syrupColors[b],
            emissiveIntensity: 0.25,
            roughness: 0.2,
          })
        );
        bottle.position.set(0.15 + b * 0.26, 0.17, 0.1);
        propGroup.add(bottle);
      }
    } else if (spec.id === 'stall-bangles') {
      // Glittering Firozabad Glass Bangles (Choodiyan) Racks in Red, Green, Gold & Pink
      const bangleColors = [0xff1744, 0xffd600, 0x00c853, 0xff4081, 0x00b0ff];
      for (let r = -1; r <= 1; r++) {
        const standRod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 10), goldMat);
        standRod.rotation.z = Math.PI / 2;
        standRod.position.set(r * 1.05, 0.38, 0);
        propGroup.add(standRod);

        for (let c = -3; c <= 3; c++) {
          const bangle = new THREE.Mesh(
            new THREE.TorusGeometry(0.11, 0.022, 8, 16),
            new THREE.MeshStandardMaterial({
              color: bangleColors[Math.abs(c + r * 2) % bangleColors.length],
              metalness: 0.65,
              roughness: 0.2,
            })
          );
          bangle.rotation.y = Math.PI / 2;
          bangle.position.set(r * 1.05 + c * 0.08, 0.38, 0);
          propGroup.add(bangle);
        }
      }
    } else if (spec.type === 'food') {
      // Tiers of golden laddoos / jalebis / matkas
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xe6c27a, roughness: 0.25, metalness: 0.85 });
      const sweetMat = new THREE.MeshStandardMaterial({ color: 0xff9914, roughness: 0.45 });
      for (let i = -1; i <= 1; i++) {
        const thali = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.35, 0.06, 14), plateMat);
        thali.position.set(i * 0.95, 0.03, 0);
        propGroup.add(thali);

        const mound = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.35, 12), sweetMat);
        mound.position.set(i * 0.95, 0.22, 0);
        propGroup.add(mound);
      }
    } else if (spec.type === 'toy') {
      // Colorful Kandil lanterns & toy swords
      for (let i = -1; i <= 1; i++) {
        const kandil = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28, 0),
          new THREE.MeshStandardMaterial({
            color: i === 0 ? 0xffcc33 : 0xff4d79,
            emissive: i === 0 ? 0x664400 : 0x551122,
            roughness: 0.3,
          })
        );
        kandil.position.set(i * 0.9, 1.65, 0.4);
        propGroup.add(kandil);
      }
    } else {
      // Terracotta pots, brass urlis & partner displays
      for (let i = -1; i <= 1; i++) {
        const urli = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), goldMat);
        urli.scale.y = 0.55;
        urli.position.set(i * 0.9, 0.12, 0);
        propGroup.add(urli);
      }
    }

    group.add(propGroup);

    // Shopkeeper inside the stall
    const shopkeeper = this.createShopkeeper(themeInfo.hex);
    shopkeeper.position.set(0, 0, -0.35);
    group.add(shopkeeper);

    this.addContactShadow(group, 5.2, 3.6);
    this.dynamicRoot.add(group);
  }

  private buildBalloonGameStall(spec: MelaInteractableSpec): void {
    this.buildMarketStall(spec);

    const boardGroup = new THREE.Group();
    boardGroup.position.set(spec.x, 0, spec.z);
    boardGroup.rotation.y = spec.rotY;

    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.7, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x241529, roughness: 0.8 })
    );
    backboard.position.set(0, 2.05, -0.45);
    boardGroup.add(backboard);

    const balloonColors = [0xff4d6d, 0xffbe0b, 0x06d6a0, 0xb5179e, 0x4cc9f0, 0xff9f1c, 0xff595e, 0x8ac926, 0x9b5de5];
    const balloonGeo = new THREE.SphereGeometry(0.24, 16, 14);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col;
        const color = balloonColors[idx % balloonColors.length];
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.25,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(balloonGeo, mat);
        const bx = (col - 1) * 0.95;
        const by = 1.55 + row * 0.48;
        const bz = -0.32;
        mesh.position.set(bx, by, bz);
        mesh.scale.y = 1.18;
        mesh.userData.isBalloon = true;
        mesh.userData.balloonIndex = idx;
        boardGroup.add(mesh);

        this.balloonTargets.push({
          mesh,
          basePos: new THREE.Vector3(bx, by, bz),
          popped: false,
          color,
        });
      }
    }

    this.dynamicRoot.add(boardGroup);
  }

  private buildRingTossStall(spec: MelaInteractableSpec): void {
    this.buildMarketStall(spec);

    const ringGroup = new THREE.Group();
    ringGroup.position.set(spec.x, 0, spec.z);
    ringGroup.rotation.y = spec.rotY;

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffcf56, roughness: 0.22, metalness: 0.88 });
    const pegGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.42, 12);

    for (let row = 0; row < 2; row++) {
      for (let col = -1; col <= 1; col++) {
        const peg = new THREE.Mesh(pegGeo, goldMat);
        peg.position.set(col * 0.95, 1.28, 0.35 + row * 0.38);
        ringGroup.add(peg);
      }
    }

    // Flying ring mesh used during toss animation
    const tossRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 10, 24), goldMat);
    tossRing.rotation.x = Math.PI / 2;
    tossRing.visible = false;
    this.scene.add(tossRing);
    this.ringFlight = {
      mesh: tossRing,
      active: false,
      t: 0,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      willWin: true,
    };

    // Ambient NPC flying ring so visitors walking past see players tossing rings onto pegs
    const npcRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.032, 10, 22), goldMat);
    npcRing.rotation.x = Math.PI / 2;
    this.dynamicRoot.add(npcRing);
    this.npcRingMesh = npcRing;

    this.dynamicRoot.add(ringGroup);
  }

  private buildDeepotsavMandap(spec: MelaInteractableSpec): void {
    const mandap = new THREE.Group();
    mandap.position.set(spec.x, 0, spec.z);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.28, metalness: 0.82 });
    const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x7a1c24, roughness: 0.55 });

    // Raised circular platform
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 0.36, 24), crimsonMat);
    plinth.position.y = 0.18;
    plinth.receiveShadow = true;
    mandap.add(plinth);

    // Center Brass Urli & Lakshmi-Ganesh Deep Stambh
    const centerPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.8, 16), goldMat);
    centerPillar.position.y = 1.6;
    mandap.add(centerPillar);

    const topUrli = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.4, 0.45, 18), goldMat);
    topUrli.position.y = 3.1;
    mandap.add(topUrli);

    const { group: topDiya } = this.createClayDiyaMesh(1.4, true);
    topDiya.position.y = 3.32;
    mandap.add(topDiya);

    // 7 Interactive Earthen Diyas in a circle around the Mandap
    const count = 7;
    const radius = 3.4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.55, 14), goldMat);
      pedestal.position.set(dx, 0.62, dz);
      mandap.add(pedestal);

      // First 2 start lit for visual invitation; remaining 5 can be lit in the game
      const initiallyLit = i < 2;
      const { group: diyaGroup, flame } = this.createClayDiyaMesh(1.15, initiallyLit);
      diyaGroup.position.set(dx, 0.9, dz);
      diyaGroup.rotation.y = -angle - Math.PI / 2;
      diyaGroup.userData.diyaIndex = i;
      mandap.add(diyaGroup);

      this.mandapDiyas.push({
        group: diyaGroup,
        flame,
        lit: initiallyLit,
        index: i,
      });
    }

    // 8. Ornate Archway with Hanging Brass Temple Bell (Mandir Ghanti)
    for (const side of [-1, 1]) {
      const archPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.4, 12), goldMat);
      archPillar.position.set(side * 1.85, 2.38, 3.85);
      mandap.add(archPillar);
    }
    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.22, 0.26), goldMat);
    archBeam.position.set(0, 4.55, 3.85);
    mandap.add(archBeam);

    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 4.48, 3.85);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), goldMat);
    chain.position.y = -0.27;
    const bellDome = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.38, 0.48, 16), goldMat);
    bellDome.position.y = -0.72;
    const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 10, 20), goldMat);
    bellRim.rotation.x = Math.PI / 2;
    bellRim.position.y = -0.95;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), goldMat);
    clapper.position.y = -1.02;
    // Invisible click target around the Brass Bell
    const bellHitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 1.4, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    bellHitbox.position.y = -0.7;
    bellHitbox.userData.isMandapBell = true;
    bellPivot.add(chain, bellDome, bellRim, clapper, bellHitbox);
    mandap.add(bellPivot);
    this.mandapBellPivot = bellPivot;

    // 9. Interactive Golden Maha-Aarti Thali on Front Pedestal
    const aartiPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.72, 14), crimsonMat);
    aartiPedestal.position.set(0, 0.72, 3.95);
    mandap.add(aartiPedestal);

    const aartiThaliGroup = new THREE.Group();
    aartiThaliGroup.position.copy(this.mandapAartiBasePos);
    const thaliPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.05, 18), goldMat);
    const { group: aartiDiya, flame: aartiFlame } = this.createClayDiyaMesh(0.75, true);
    aartiDiya.position.set(0, 0.04, 0.08);
    this.flameMeshes.push(aartiFlame);
    const kalashLota = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), goldMat);
    kalashLota.position.set(-0.16, 0.1, -0.08);
    const kumkumKatori = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.06, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.5 })
    );
    kumkumKatori.position.set(0.16, 0.05, -0.08);
    const aartiHitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.9, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    aartiHitbox.userData.isMandapAarti = true;
    aartiThaliGroup.add(thaliPlate, aartiDiya, kalashLota, kumkumKatori, aartiHitbox);
    mandap.add(aartiThaliGroup);
    this.mandapAartiThali = aartiThaliGroup;

    this.stats.diyasLit = this.mandapDiyas.filter((d) => d.lit).length;
    this.addContactShadow(mandap, 11, 11);
    this.dynamicRoot.add(mandap);
  }


  private buildDaanPeti(spec: MelaInteractableSpec): void {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotY;
    group.userData.spec = spec;

    const teakMat = new THREE.MeshStandardMaterial({ color: 0x5c2c16, roughness: 0.65, metalness: 0.15 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.24, metalness: 0.88 });
    const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x7a1c24, roughness: 0.55 });
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x090b10 });

    // 1. Stepped Pedestal Base
    const baseStep1 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.25, 16), crimsonMat);
    baseStep1.position.y = 0.125;
    group.add(baseStep1);

    const baseStep2 = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.28, 16), brassMat);
    baseStep2.position.y = 0.38;
    group.add(baseStep2);

    // 2. Main Carved Teakwood & Brass Donation Chest (Daan Peti)
    const chestBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 0.95), teakMat);
    chestBody.position.y = 1.08;
    chestBody.castShadow = true;
    chestBody.receiveShadow = true;
    group.add(chestBody);

    // Brass Frame Bands around the Daan Peti
    const topRim = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.02), brassMat);
    topRim.position.y = 1.62;
    group.add(topRim);

    const bottomRim = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.02), brassMat);
    bottomRim.position.y = 0.56;
    group.add(bottomRim);

    // Arched Vault Lid on top of Daan Peti
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.36, 16, 1, false, 0, Math.PI), brassMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 1.66;
    group.add(lid);

    // Coin / Note Slot on top
    const coinSlot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.12), slotMat);
    coinSlot.position.set(0, 2.11, 0);
    group.add(coinSlot);

    // Traditional Brass Padlock (Tala) on front
    const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.08), brassMat);
    lockPlate.position.set(0, 1.18, 0.49);
    group.add(lockPlate);

    // Front Sign Plaque on the Chest
    const frontSignTex = createSignboardTexture(
      this.renderer,
      'दान पेटी · DAAN PETI',
      'असली दिवाली: किसी गरीब के घर जले खुशियों का दीया',
      '#4f121d',
      '#ffd27d',
      '#fff6de'
    );
    const frontPlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.44),
      new THREE.MeshBasicMaterial({ map: frontSignTex })
    );
    frontPlaque.position.set(0, 0.82, 0.485);
    group.add(frontPlaque);

    // Real Scannable QR Code Standee mounted on the Daan Peti
    const qrFrame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.86, 0.06), brassMat);
    qrFrame.position.set(0, 2.22, 0.12);
    group.add(qrFrame);

    const qrTex = new THREE.TextureLoader().load(
      '/assets/aistudio/WhatsApp_Image_2026-10-21_at_10.56.40_PM_a73914be.jpeg'
    );
    qrTex.colorSpace = THREE.SRGBColorSpace;
    const qrPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.76),
      new THREE.MeshBasicMaterial({ map: qrTex })
    );
    qrPlane.position.set(0, 2.22, 0.155);
    group.add(qrPlane);

    // 3. Two Brass Pillars holding the overhead Daan Peti Arch Banner
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.1, 10), brassMat);
      pole.position.set(side * 0.95, 1.8, -0.25);
      group.add(pole);

      // Flanking Lit Clay Diyas on the Pedestal
      const { group: diya } = this.createClayDiyaMesh(0.75, true);
      diya.position.set(side * 0.92, 0.52, 0.48);
      group.add(diya);
    }

    const headerTex = createSignboardTexture(
      this.renderer,
      'सेवा दान पेटी · SCAN QR FOR SEVA',
      'Click Box · Help Poor Families Celebrate Diwali 🪔',
      '#3d101b',
      '#f4b855',
      '#fff5de'
    );
    const headerBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.68),
      new THREE.MeshBasicMaterial({ map: headerTex, side: THREE.DoubleSide })
    );
    headerBoard.position.set(0, 3.18, -0.25);
    group.add(headerBoard);

    // Warm golden point light illuminating the Daan Peti & QR standee
    const petiLight = new THREE.PointLight(0xffbb44, 6.5, 8.5);
    petiLight.position.set(0, 2.4, 0.7);
    group.add(petiLight);

    // Invisible simplified proxy box for instant 3D click detection
    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 3.5, 2.1),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.set(0, 1.75, 0);
    group.add(collider);
    this.daanPetiCollider = collider;

    this.addContactShadow(group, 3.6, 3.6);
    this.dynamicRoot.add(group);
  }

  private buildRangoliArea(spec: MelaInteractableSpec): void {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.userData.spec = spec;
    this.rangoliGroup = group;

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b1d28, roughness: 0.78, metalness: 0.08 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.26, metalness: 0.85 });
    const chalkLineMat = new THREE.LineBasicMaterial({ color: 0xfff5de, transparent: true, opacity: 0.9 });

    // 1. Raised Circular Courtyard Base + Brass Outer Rim
    const courtyardBase = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.4, 0.14, 32), stoneMat);
    courtyardBase.position.y = 0.07;
    courtyardBase.receiveShadow = true;
    group.add(courtyardBase);

    const outerBrassRing = new THREE.Mesh(new THREE.TorusGeometry(3.26, 0.06, 10, 40), brassMat);
    outerBrassRing.rotation.x = Math.PI / 2;
    outerBrassRing.position.y = 0.14;
    group.add(outerBrassRing);

    // Helper to register a clickable 3D floor pattern segment with white kolam chalk outline
    const addFloorSegment = (
      geo: THREE.BufferGeometry,
      ringIndex: number,
      petalIndex: number,
      initialHex: string,
      filled: boolean,
      rotY = 0,
      yOffset = 0.155
    ) => {
      const mat = new THREE.MeshStandardMaterial({
        color: initialHex,
        emissive: initialHex,
        emissiveIntensity: filled ? 0.28 : 0.06,
        roughness: 0.52,
        metalness: 0.08,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = yOffset;

      const edges = new THREE.EdgesGeometry(geo, 15);
      const outline = new THREE.LineSegments(edges, chalkLineMat);
      mesh.add(outline);

      const segHolder = new THREE.Group();
      segHolder.rotation.y = rotY;
      segHolder.add(mesh);
      group.add(segHolder);

      const segRecord = {
        mesh,
        mat,
        ringIndex,
        petalIndex,
        filled,
        colorHex: initialHex,
      };
      mesh.userData.rangoliSegment = segRecord;
      this.rangoliSegments.push(segRecord);
    };

    // 2. Ring 0: Central Bindu Lotus Medallion (1 segment)
    const centerShape = new THREE.Shape();
    centerShape.absarc(0, 0, 0.46, 0, Math.PI * 2, false);
    const centerGeo = new THREE.ExtrudeGeometry(centerShape, { depth: 0.032, bevelEnabled: false });
    addFloorSegment(centerGeo, 0, 0, '#ffb703', true, 0, 0.155);

    // 3. Ring 1: 8 Sculpted Inner Ashtadala Lotus Petals
    const lotusPetalShape = new THREE.Shape();
    lotusPetalShape.moveTo(0, 0.52);
    lotusPetalShape.quadraticCurveTo(0.34, 0.88, 0, 1.38);
    lotusPetalShape.quadraticCurveTo(-0.34, 0.88, 0, 0.52);
    const lotusPetalGeo = new THREE.ExtrudeGeometry(lotusPetalShape, { depth: 0.028, bevelEnabled: false });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      // Start with first 2 petals pre-filled so visitors immediately see how vibrant it looks
      const preFilled = i % 4 === 0;
      addFloorSegment(
        lotusPetalGeo,
        1,
        i,
        preFilled ? '#e63946' : '#3a2938',
        preFilled,
        angle,
        0.152
      );
    }

    // 4. Ring 2: 8 Interleaved Geometric Star Diamonds (Konas)
    const diamondShape = new THREE.Shape();
    diamondShape.moveTo(0, 1.02);
    diamondShape.lineTo(0.32, 1.52);
    diamondShape.lineTo(0, 2.04);
    diamondShape.lineTo(-0.32, 1.52);
    diamondShape.closePath();
    const diamondGeo = new THREE.ExtrudeGeometry(diamondShape, { depth: 0.025, bevelEnabled: false });

    for (let i = 0; i < 8; i++) {
      const angle = ((i + 0.5) / 8) * Math.PI * 2;
      addFloorSegment(diamondGeo, 2, i, '#352535', false, angle, 0.15);
    }

    // 5. Ring 3: 8 Outer Scalloped Marigold Border Arcs
    const arcShape = new THREE.Shape();
    const halfSpan = Math.PI / 8 - 0.035;
    arcShape.absarc(0, 0, 2.52, -halfSpan + Math.PI / 2, halfSpan + Math.PI / 2, false);
    arcShape.absarc(0, 0, 2.08, halfSpan + Math.PI / 2, -halfSpan + Math.PI / 2, true);
    arcShape.closePath();
    const arcGeo = new THREE.ExtrudeGeometry(arcShape, { depth: 0.024, bevelEnabled: false });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      addFloorSegment(arcGeo, 3, i, '#2f2030', false, angle, 0.148);
    }

    // 6. 8 Brass Katori Bowls of Vibrant Gulal Powder around the Courtyard Perimeter
    for (let i = 0; i < RANGOLI_COLORS.length; i++) {
      const cSpec = RANGOLI_COLORS[i];
      const angle = (i / RANGOLI_COLORS.length) * Math.PI * 2 + 0.2;
      const bx = Math.cos(angle) * 2.92;
      const bz = Math.sin(angle) * 2.92;

      const bowlGroup = new THREE.Group();
      bowlGroup.position.set(bx, 0.14, bz);

      const katori = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.16, 14), brassMat);
      katori.position.y = 0.08;
      bowlGroup.add(katori);

      const powderCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.21, 0.18, 14),
        new THREE.MeshStandardMaterial({
          color: cSpec.hex,
          emissive: cSpec.hex,
          emissiveIntensity: 0.32,
          roughness: 0.6,
        })
      );
      powderCone.position.y = 0.19;
      bowlGroup.add(powderCone);

      bowlGroup.traverse((child) => {
        child.userData.rangoliBowlColor = cSpec.hex;
        child.userData.rangoliBowlName = cSpec.name;
      });

      group.add(bowlGroup);
      this.rangoliBowls.push({ mesh: bowlGroup, hex: cSpec.hex, name: cSpec.name });
    }

    // 7. 4 Lit Clay Diyas & Overhead Signboard Arch at back of the Rangoli Courtyard
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const { group: diya } = this.createClayDiyaMesh(0.75, true);
      diya.position.set(Math.cos(angle) * 3.15, 0.15, Math.sin(angle) * 3.15);
      group.add(diya);
    }

    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.8, 10), brassMat);
      pole.position.set(side * 1.45, 1.4, -3.1);
      group.add(pole);
    }

    const signTex = createSignboardTexture(
      this.renderer,
      'रंगोली आँगन · RANGOLI ART',
      'Click Floor Petals to Fill Colors · Pre-Defined Mandala',
      '#3d101b',
      '#ff6fa5',
      '#fff5de'
    );
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 0.72),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    signBoard.position.set(0, 2.75, -3.1);
    group.add(signBoard);

    const rangoliLight = new THREE.PointLight(0xffb85c, 6.5, 9.5);
    rangoliLight.position.set(0, 2.6, 0);
    group.add(rangoliLight);

    this.addContactShadow(group, 7.2, 7.2);
    this.dynamicRoot.add(group);
  }

  private buildFerrisWheel(spec: MelaInteractableSpec): void {
    const root = new THREE.Group();
    root.position.set(spec.x, 0, spec.z);
    root.rotation.y = spec.rotY;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe09f3e, roughness: 0.32, metalness: 0.75 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xc83e6b, roughness: 0.4, metalness: 0.4 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe599 });

    // A-frame support legs
    for (const zSide of [-1.8, 1.8]) {
      for (const xSide of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 16.5, 10), steelMat);
        leg.position.set(xSide * 4.2, 7.6, zSide);
        leg.rotation.z = xSide * 0.26;
        root.add(leg);
      }
    }

    // Rotating Wheel Rim Group at height 15m
    this.ferrisWheelRim = new THREE.Group();
    this.ferrisWheelRim.position.set(0, 15.2, 0);
    root.add(this.ferrisWheelRim);

    const wheelRadius = 10.5;
    for (const zRing of [-1.2, 1.2]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.18, 10, 36), steelMat);
      rim.position.z = zRing;
      this.ferrisWheelRim.add(rim);
    }

    // Hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 16), accentMat);
    hub.rotation.x = Math.PI / 2;
    this.ferrisWheelRim.add(hub);

    // 8 Spokes & 8 Swinging Gondolas
    const gondolaCount = 8;
    for (let i = 0; i < gondolaCount; i++) {
      const angle = (i / gondolaCount) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, wheelRadius * 2, 8), steelMat);
      spoke.rotation.z = angle;
      this.ferrisWheelRim.add(spoke);

      const gx = Math.cos(angle) * wheelRadius;
      const gy = Math.sin(angle) * wheelRadius;

      // Rim light bulb
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), glowMat);
      bulb.position.set(gx, gy, 1.35);
      this.ferrisWheelRim.add(bulb);

      // Gondola carriage
      const gondola = new THREE.Group();
      gondola.position.set(gx, gy, 0);

      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), steelMat);
      hanger.position.y = -0.7;
      gondola.add(hanger);

      const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.75, 1.1, 12),
        i % 2 === 0 ? accentMat : steelMat
      );
      basket.position.y = -1.65;
      gondola.add(basket);

      this.ferrisWheelRim.add(gondola);
      this.ferrisGondolas.push(gondola);
    }

    // Ticket booth signboard in front
    const signTex = createSignboardTexture(this.renderer, 'CHAND WALA JHOOLA', 'Giant Wheel · Free Ride');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.2), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 2.6, 5.5);
    root.add(sign);

    this.addContactShadow(root, 14, 8);
    this.dynamicRoot.add(root);
  }

  private buildCarousel(spec: MelaInteractableSpec): void {
    const root = new THREE.Group();
    root.position.set(spec.x, 0, spec.z);
    root.rotation.y = spec.rotY;

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.25, metalness: 0.85 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xc83e6b, roughness: 0.45 });
    const horseMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.35, metalness: 0.2 });

    // Base plinth
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.0, 0.45, 24), pinkMat);
    base.position.y = 0.225;
    root.add(base);

    this.carouselPlatform = new THREE.Group();
    this.carouselPlatform.position.y = 0.45;
    root.add(this.carouselPlatform);

    // Center column
    const centerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 4.8, 16), goldMat);
    centerCol.position.y = 2.4;
    this.carouselPlatform.add(centerCol);

    // Conical roof
    const canopyTex = createCanopyStripeTexture(this.renderer, '#c83e6b', '#ffd27d');
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(6.0, 2.4, 24),
      new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.55 })
    );
    roof.position.y = 5.8;
    this.carouselPlatform.add(roof);

    // 8 Carousel Horses on brass poles
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 4.1;
      const hx = Math.cos(angle) * r;
      const hz = Math.sin(angle) * r;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 8), goldMat);
      pole.position.set(hx, 2.3, hz);
      this.carouselPlatform.add(pole);

      // Composite Horse
      const horse = new THREE.Group();
      horse.position.set(hx, 1.6, hz);
      horse.rotation.y = -angle;
      horse.userData.phase = i * 0.8;

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 1.05), horseMat);
      horse.add(body);

      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.45), pinkMat);
      saddle.position.y = 0.22;
      horse.add(saddle);

      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.32), horseMat);
      neck.position.set(0, 0.35, 0.42);
      neck.rotation.x = 0.35;
      horse.add(neck);

      this.carouselPlatform.add(horse);
      this.carouselHorses.push(horse);
    }

    this.addContactShadow(root, 13, 13);
    this.dynamicRoot.add(root);
  }

  private buildPirateShip(spec: MelaInteractableSpec): void {
    const root = new THREE.Group();
    root.position.set(spec.x, 0, spec.z);
    root.rotation.y = spec.rotY;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d7874, roughness: 0.4, metalness: 0.6 });
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x8c2d19, roughness: 0.55 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.28, metalness: 0.82 });

    // A-Frame supports
    for (const xSide of [-2.4, 2.4]) {
      for (const zSide of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 11.5, 10), frameMat);
        leg.position.set(xSide, 5.2, zSide * 3.4);
        leg.rotation.x = zSide * -0.32;
        root.add(leg);
      }
    }

    // Swinging pivot at height 10.2m
    this.pirateShipPivot = new THREE.Group();
    this.pirateShipPivot.position.set(0, 10.2, 0);
    root.add(this.pirateShipPivot);

    for (const xSide of [-1.6, 1.6]) {
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7.2, 8), goldMat);
      hanger.position.set(xSide, -3.6, 0);
      this.pirateShipPivot.add(hanger);
    }

    // Composite Boat Hull
    const hull = new THREE.Group();
    hull.position.set(0, -7.2, 0);

    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 6.2), hullMat);
    hull.add(mainHull);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.2, 6.4), goldMat);
    trim.position.y = 0.65;
    hull.add(trim);

    // Prow finials
    for (const zEnd of [-3.3, 3.3]) {
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.6, 8), goldMat);
      prow.position.set(0, 0.9, zEnd);
      prow.rotation.x = zEnd > 0 ? 0.5 : -0.5;
      hull.add(prow);
    }

    this.pirateShipPivot.add(hull);
    this.pirateShipHull = hull;
    this.addContactShadow(root, 8, 10);
    this.dynamicRoot.add(root);
  }

  private buildWellOfDeath(spec: MelaInteractableSpec): void {
    const root = new THREE.Group();
    root.position.set(spec.x, 0, spec.z);
    this.wellRoot = root;

    const plankTex = createWoodPlankTexture(this.renderer);
    const wallMat = new THREE.MeshStandardMaterial({
      map: plankTex,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.8 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.4, metalness: 0.7 });

    const wellRadius = 7.2;
    const wellHeight = 7.0;

    // Open-ended wooden cylinder wall
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(wellRadius + 0.6, wellRadius - 0.4, wellHeight, 32, 1, true),
      wallMat
    );
    cylinder.position.y = wellHeight / 2;
    root.add(cylinder);

    // Top spectator balcony walkway deck & safety railings so crowds can stand on top and watch!
    const galleryDeck = new THREE.Mesh(
      new THREE.RingGeometry(wellRadius + 0.48, wellRadius + 1.75, 32),
      new THREE.MeshStandardMaterial({ color: 0x5c341d, roughness: 0.8, side: THREE.DoubleSide })
    );
    galleryDeck.rotation.x = -Math.PI / 2;
    galleryDeck.position.y = wellHeight - 0.04;
    root.add(galleryDeck);

    const topRim = new THREE.Mesh(new THREE.TorusGeometry(wellRadius + 0.65, 0.16, 10, 36), goldMat);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = wellHeight + 0.85;
    const outerRim = new THREE.Mesh(new THREE.TorusGeometry(wellRadius + 1.7, 0.14, 10, 36), goldMat);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = wellHeight + 0.85;
    root.add(topRim, outerRim);

    // Railing posts around the top spectator gallery
    for (let p = 0; p < 16; p++) {
      const a = (p / 16) * Math.PI * 2;
      const innerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), goldMat);
      innerPost.position.set(Math.cos(a) * (wellRadius + 0.65), wellHeight + 0.42, Math.sin(a) * (wellRadius + 0.65));
      const outerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), goldMat);
      outerPost.position.set(Math.cos(a) * (wellRadius + 1.7), wellHeight + 0.42, Math.sin(a) * (wellRadius + 1.7));
      root.add(innerPost, outerPost);
    }

    // Signboard outside the Well of Death
    const signTex = createSignboardTexture(
      this.renderer,
      'MAUT KA KUAN · मौत का कुआँ',
      'Watch the Daredevil Riders or Ride the Wall!'
    );
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.6), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(-4.5, 4.8, 6.8);
    sign.rotation.y = -Math.PI / 5;
    root.add(sign);

    // 2 Stunt Motorcycles with 3D Daredevil Riders racing inside the vertical wooden wall!
    for (let i = 0; i < 2; i++) {
      const bike = new THREE.Group();
      const bikeColor = i === 0 ? 0xff2a2a : 0xffbe0b;
      const bodyMat = new THREE.MeshStandardMaterial({ color: bikeColor, roughness: 0.28, metalness: 0.65 });

      // Motorcycle frame & fuel tank
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 1.45), bodyMat);
      body.position.y = 0.15;
      bike.add(body);

      // Front & rear tires
      for (const wz of [-0.58, 0.58]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 10, 18), darkMetalMat);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(0, -0.05, wz);
        bike.add(wheel);
      }

      // Handlebars & glowing headlight
      const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8), goldMat);
      handlebar.rotation.z = Math.PI / 2;
      handlebar.position.set(0, 0.52, -0.42);
      const headlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff5cc })
      );
      headlight.position.set(0, 0.42, -0.75);
      bike.add(handlebar, headlight);

      // 3D Stunt Rider mounted on the motorcycle
      const riderTorso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.68, 10),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0x1565c0 : 0xc2185b, roughness: 0.5 })
      );
      riderTorso.position.set(0, 0.68, 0.08);
      riderTorso.rotation.x = -0.35;
      const riderHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xd99b72, roughness: 0.6 })
      );
      riderHead.position.set(0, 1.08, -0.08);
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
        goldMat
      );
      helmet.position.set(0, 1.12, -0.08);
      bike.add(riderTorso, riderHead, helmet);

      root.add(bike);
      this.wellBikes.push({
        group: bike,
        angle: i * Math.PI,
        height: 3.0 + i * 1.4,
        speed: 5.2 + i * 0.7,
      });
    }

    // 8 Collectible Golden Rings inside the well for Rider mode
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const height = 2.4 + (i % 3) * 1.3;
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 10, 20), goldMat);
      const r = wellRadius - 0.5;
      ringMesh.position.set(Math.cos(angle) * r, height, Math.sin(angle) * r);
      ringMesh.rotation.y = -angle;
      root.add(ringMesh);
      this.wellRings.push({ mesh: ringMesh, angle, height, collected: false });
    }

    this.addContactShadow(root, 16, 16);
    this.dynamicRoot.add(root);
  }

  private buildCulturalStage(spec: MelaInteractableSpec): void {
    const stage = new THREE.Group();
    stage.position.set(spec.x, 0, spec.z);
    stage.rotation.y = spec.rotY;

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.25, metalness: 0.85 });
    const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x6e1423, roughness: 0.55 });
    const canopyTex = createCanopyStripeTexture(this.renderer, '#dc8827', '#6e1423');
    const roofMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.55 });

    // Raised stage deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 6.2), crimsonMat);
    deck.position.y = 0.55;
    deck.receiveShadow = true;
    stage.add(deck);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.16, 6.4), goldMat);
    trim.position.y = 1.08;
    stage.add(trim);

    // 4 Ornate Stage Pillars
    for (const [px, pz] of [
      [-4.6, -2.5],
      [4.6, -2.5],
      [-4.6, 2.5],
      [4.6, 2.5],
    ]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 5.2, 14), goldMat);
      col.position.set(px, 3.7, pz);
      stage.add(col);
    }

    // Royal Mandap Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.6, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 7.5;
    stage.add(roof);

    // Backdrop Banner
    const backdropTex = createSignboardTexture(
      this.renderer,
      'अयोध्या दीपोत्सव · RAM LEELA',
      'Shri Ram Rajyabhishek & Deepotsav Cultural Stage',
      '#3b0c18',
      '#ffd27d',
      '#fff6de'
    );
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(8.8, 3.6),
      new THREE.MeshBasicMaterial({ map: backdropTex })
    );
    backdrop.position.set(0, 3.4, -2.35);
    stage.add(backdrop);

    // 3 Royal Performers on Stage + Diyas along the front footlights
    const colors = [0xff9933, 0xe62e6b, 0x17a589];
    for (let i = -1; i <= 1; i++) {
      const actor = this.createShopkeeper(colors[i + 1]);
      actor.position.set(i * 1.6, 1.1, -0.4);
      stage.add(actor);
    }

    for (let d = -4; d <= 4; d += 2) {
      const { group: diya } = this.createClayDiyaMesh(0.85, true);
      diya.position.set(d * 0.95, 1.12, 2.65);
      stage.add(diya);
    }

    this.addContactShadow(stage, 12, 8);
    this.dynamicRoot.add(stage);
  }

  private buildPhotoBoothToran(spec: MelaInteractableSpec): void {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.25, metalness: 0.85 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xc83e6b, roughness: 0.45 });

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.8, 12), goldMat);
      post.position.set(side * 2.4, 1.9, 0);
      group.add(post);

      const { group: diya } = this.createClayDiyaMesh(0.95, true);
      diya.position.set(side * 2.4, 0.2, 0.45);
      group.add(diya);
    }

    const signTex = createSignboardTexture(
      this.renderer,
      'MELA CHALOGE MERE SATH? 🪔',
      'Shubh Deepavali Photo Point · Click to Snap!'
    );
    const header = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.15), new THREE.MeshBasicMaterial({ map: signTex }));
    header.position.set(0, 3.6, 0);
    group.add(header);

    // Heart / Lotus arch accent
    const archRing = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 10, 28, Math.PI), pinkMat);
    archRing.position.set(0, 2.2, -0.1);
    group.add(archRing);

    this.addContactShadow(group, 6, 2.5);
    this.dynamicRoot.add(group);
  }

  private buildFireworksPavilion(spec: MelaInteractableSpec): void {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotY;

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.8 });
    const anarMat = new THREE.MeshStandardMaterial({ color: 0xd9383a, roughness: 0.4, metalness: 0.3 });

    // 5 Giant Anar (Flowerpot) Fountains on a platform
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.3, 18), goldMat);
    pad.position.y = 0.15;
    group.add(pad);

    for (let i = -2; i <= 2; i++) {
      const anar = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 14), anarMat);
      anar.position.set(i * 1.1, 0.72, 0);
      group.add(anar);
    }

    const signTex = createSignboardTexture(
      this.renderer,
      'ROSHNI KA JASHN',
      'Eco-Friendly Sky Fireworks · Light Only'
    );
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.1), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 2.5, 0);
    group.add(sign);

    this.addContactShadow(group, 7.5, 7.5);
    this.dynamicRoot.add(group);
  }

  private buildLaxmiGaneshTemple(spec: MelaInteractableSpec): void {
    const temple = new THREE.Group();
    temple.position.set(spec.x, 0, spec.z);
    temple.rotation.y = spec.rotY;
    temple.userData.spec = spec;
    this.templeGroup = temple;

    // Rich Temple Materials
    const sandstoneMat = new THREE.MeshStandardMaterial({ color: 0x8f2424, roughness: 0.62, metalness: 0.14 });
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xfff5e4, roughness: 0.36, metalness: 0.12 });
    const darkMarbleMat = new THREE.MeshStandardMaterial({ color: 0x3b1520, roughness: 0.5, metalness: 0.18 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf6be4f, roughness: 0.22, metalness: 0.88 });
    const brightGoldMat = new THREE.MeshStandardMaterial({
      color: 0xffd768,
      emissive: 0x6b4400,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.92,
    });
    const crimsonVelvetMat = new THREE.MeshStandardMaterial({ color: 0xa8132b, roughness: 0.68, metalness: 0.08 });
    const lotusPinkMat = new THREE.MeshStandardMaterial({
      color: 0xff3b8b,
      emissive: 0x4a0822,
      emissiveIntensity: 0.25,
      roughness: 0.38,
      metalness: 0.12,
    });
    const marigoldOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff8500, roughness: 0.65 });
    const marigoldYellowMat = new THREE.MeshStandardMaterial({ color: 0xffcf00, roughness: 0.65 });

    // 1. GRAND 3-TIER STEPPED JAGATI PLINTH (15.4m wide x 14.4m deep)
    const tier1 = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.42, 14.4), sandstoneMat);
    tier1.position.set(0, 0.21, 0);
    tier1.receiveShadow = true;
    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.44, 12.8), marbleMat);
    tier2.position.set(0, 0.64, 0);
    tier2.receiveShadow = true;
    const tier3 = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.44, 11.4), sandstoneMat);
    tier3.position.set(0, 1.08, 0);
    tier3.receiveShadow = true;
    const goldPlinthTrim = new THREE.Mesh(new THREE.BoxGeometry(12.56, 0.1, 11.56), goldMat);
    goldPlinthTrim.position.set(0, 1.28, 0);
    temple.add(tier1, tier2, tier3, goldPlinthTrim);

    // Royal Red Velvet Darshan Carpet from Stairs to Sanctum
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 10.8), crimsonVelvetMat);
    carpet.position.set(0, 1.31, 0.6);
    temple.add(carpet);

    // 2. CEREMONIAL FRONT STAIRCASE (SOPANA) & TWIN TEMPLE ELEPHANTS (GAJA-DWARAPALA)
    for (let s = 0; s < 5; s++) {
      const stepW = 5.4 - s * 0.15;
      const stepY = 0.13 + s * 0.25;
      const stepZ = 7.8 - s * 0.48;
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(stepW, 0.25, 0.56),
        s % 2 === 0 ? marbleMat : goldMat
      );
      stepMesh.position.set(0, stepY, stepZ);
      temple.add(stepMesh);
    }

    // Stepped Golden Balustrades & 10 Glowing Clay Diyas lining the Temple Steps
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.9, 2.8), goldMat);
      rail.position.set(side * 2.85, 0.72, 6.8);
      rail.rotation.x = 0.42;
      temple.add(rail);

      for (let d = 0; d < 4; d++) {
        const { group: stepDiya } = this.createClayDiyaMesh(0.82, true);
        stepDiya.position.set(side * 2.85, 0.35 + d * 0.28, 7.75 - d * 0.55);
        temple.add(stepDiya);
      }

      // Twin White & Gold Royal Temple Elephants welcoming devotees at the base of the stairs
      const elephant = new THREE.Group();
      elephant.position.set(side * 4.15, 0.42, 6.95);
      elephant.rotation.y = side * -0.25;
      const ePedestal = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.9), goldMat);
      ePedestal.position.y = 0.22;
      const eBody = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 1.35), marbleMat);
      eBody.position.set(0, 0.98, 0);
      const eSaddle = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.45, 0.85), crimsonVelvetMat);
      eSaddle.position.set(0, 1.28, 0);
      const eHead = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 14), marbleMat);
      eHead.position.set(0, 1.35, 0.72);
      const eTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.75, 10), marbleMat);
      eTrunk.position.set(0, 1.62, 1.08);
      eTrunk.rotation.x = -0.55;
      const eKalash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), brightGoldMat);
      eKalash.position.set(0, 1.95, 1.24);
      for (const legX of [-0.35, 0.35]) {
        for (const legZ of [-0.42, 0.42]) {
          const eLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.65, 10), marbleMat);
          eLeg.position.set(legX, 0.55, legZ);
          elephant.add(eLeg);
        }
      }
      elephant.add(ePedestal, eBody, eSaddle, eHead, eTrunk, eKalash);
      temple.add(elephant);
    }

    // 3. 10 CARVED MARBLE & GOLD MANDAP PILLARS (6.4m Tall)
    const pillarCoords = [
      [-5.3, 4.8],
      [-2.7, 4.8],
      [2.7, 4.8],
      [5.3, 4.8],
      [-5.3, 0.8],
      [5.3, 0.8],
      [-5.3, -4.4],
      [-2.7, -4.4],
      [2.7, -4.4],
      [5.3, -4.4],
    ];
    for (const [px, pz] of pillarCoords) {
      const pGroup = new THREE.Group();
      pGroup.position.set(px, 1.3, pz);

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.95), goldMat);
      pBase.position.y = 0.32;
      const pShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 5.2, 16), marbleMat);
      pShaft.position.y = 3.1;
      const pBand1 = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.06, 10, 18), goldMat);
      pBand1.rotation.x = Math.PI / 2;
      pBand1.position.y = 1.9;
      const pBand2 = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 10, 18), goldMat);
      pBand2.rotation.x = Math.PI / 2;
      pBand2.position.y = 3.8;
      const pCapital = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.34, 0.55, 16), goldMat);
      pCapital.position.y = 5.85;

      pGroup.add(pBase, pShaft, pBand1, pBand2, pCapital);
      temple.add(pGroup);
    }

    // Back & Side Sanctum Arched Screen Walls (Garbhagriha Backdrop)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.2, 6.2, 0.55), darkMarbleMat);
    backWall.position.set(0, 4.4, -4.65);
    const backWallGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.35, 0.65), goldMat);
    backWallGoldTrim.position.set(0, 7.45, -4.65);
    temple.add(backWall, backWallGoldTrim);

    // 4. TOWERING NAGARA SHIKHARA (20.5m Tall Main Sanctum Spire + Mandap Dome + Urushringa Spires)
    const roofCornice = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.68, 11.2), goldMat);
    roofCornice.position.set(0, 7.65, 0.2);
    temple.add(roofCornice);

    // Front Sabha-Mandap Stepped Pyramid Dome
    for (let m = 0; m < 4; m++) {
      const mw = 8.4 - m * 1.65;
      const md = 5.4 - m * 1.05;
      const my = 8.25 + m * 0.65;
      const mTier = new THREE.Mesh(
        new THREE.BoxGeometry(mw, 0.62, md),
        m % 2 === 0 ? sandstoneMat : goldMat
      );
      mTier.position.set(0, my, 2.35);
      temple.add(mTier);
    }
    const frontKalash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 14), brightGoldMat);
    frontKalash.position.set(0, 11.1, 2.35);
    temple.add(frontKalash);

    // Main Garbhagriha Nagara Shikhara (7 Sculpted Tiers rising to 20.5m)
    const shikharaZ = -1.85;
    for (let t = 0; t < 7; t++) {
      const progress = t / 6;
      const w = THREE.MathUtils.lerp(8.8, 2.8, progress);
      const h = 1.38;
      const y = 8.55 + t * 1.32;
      const tierBox = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        t % 2 === 0 ? sandstoneMat : goldMat
      );
      tierBox.position.set(0, y, shikharaZ);
      temple.add(tierBox);

      // Golden Gavaksha Arch Ribbing on front & sides of each Shikhara tier
      const rib = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.22, w + 0.18), brightGoldMat);
      rib.position.set(0, y + 0.52, shikharaZ);
      temple.add(rib);
    }

    // 4 Corner Urushringa (Subsidiary Spires) around the main Shikhara
    for (const [ux, uz] of [
      [-4.2, -3.6],
      [4.2, -3.6],
      [-4.2, 0.1],
      [4.2, 0.1],
    ]) {
      const subSpire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 4.2, 8), sandstoneMat);
      subSpire.position.set(ux, 10.1, uz);
      const subKalash = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), brightGoldMat);
      subKalash.position.set(ux, 12.35, uz);
      temple.add(subSpire, subKalash);
    }

    // Crown Amalaka Disc, Swarna Kalash & Waving Saffron Dharma Dhwaja (Flag) at y = 20.5m
    const amalaka = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.36, 12, 24), brightGoldMat);
    amalaka.rotation.x = Math.PI / 2;
    amalaka.position.set(0, 17.45, shikharaZ);
    const mainKalash = new THREE.Mesh(new THREE.SphereGeometry(0.88, 18, 16), brightGoldMat);
    mainKalash.position.set(0, 18.55, shikharaZ);
    const kalashSpire = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.45, 12), brightGoldMat);
    kalashSpire.position.set(0, 19.65, shikharaZ);
    temple.add(amalaka, mainKalash, kalashSpire);

    // Saffron Temple Flag (Dharma Dhwaja)
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8), goldMat);
    flagPole.position.set(0, 20.4, shikharaZ);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(2.4, 0.45);
    flagShape.lineTo(0, 0.95);
    flagShape.closePath();
    const flagGeo = new THREE.ExtrudeGeometry(flagShape, { depth: 0.04, bevelEnabled: false });
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xff6200,
      emissive: 0x802b00,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.position.set(0.05, 20.55, shikharaZ);
    this.templeFlagMesh = flagMesh;
    temple.add(flagPole, flagMesh);

    // Front Illuminated Temple Signboard & Marigold Torans
    const templeSignTex = createSignboardTexture(
      this.renderer,
      'श्री लक्ष्मी-गणेश महा-मंदिर · LAXMI-GANESH MANDIR',
      'Grand Diwali Darshan · Click Aarti Thali to Perform Maha-Aarti 🪔',
      '#4a0e1c',
      '#ffd768',
      '#fff7e2'
    );
    const templeSign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 1.45),
      new THREE.MeshBasicMaterial({ map: templeSignTex })
    );
    templeSign.position.set(0, 7.65, 5.88);
    temple.add(templeSign);

    for (let g = -10; g <= 10; g++) {
      const bola = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        g % 2 === 0 ? marigoldOrangeMat : marigoldYellowMat
      );
      bola.position.set(g * 0.52, 6.72 + Math.sin(g * 0.85) * 0.18, 4.85);
      temple.add(bola);
    }

    // 5. COLOSSAL SWARNA KAMAL SINHASAN (GOLDEN THRONE) AT SANCTUM CENTER
    const sinhasanZ = -2.15;
    const sinhasanBase = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.15, 2.9), goldMat);
    sinhasanBase.position.set(0, 1.88, sinhasanZ);
    const sinhasanVelvet = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.16, 2.65), crimsonVelvetMat);
    sinhasanVelvet.position.set(0, 2.52, sinhasanZ);
    temple.add(sinhasanBase, sinhasanVelvet);

    // Ornate Prabhavali Golden Halo Arch behind both Deities
    for (const idolX of [-2.15, 2.15]) {
      const prabhavaliArch = new THREE.Mesh(
        new THREE.TorusGeometry(2.05, 0.14, 12, 32, Math.PI),
        brightGoldMat
      );
      prabhavaliArch.position.set(idolX, 4.35, sinhasanZ - 0.85);
      temple.add(prabhavaliArch);
    }

    // Helper to build a Giant 16-Petal 3D Sculpted Padma (Lotus Asana)
    const createGiantLotusThrone = (radius: number) => {
      const lotusGroup = new THREE.Group();
      const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 0.68, 0.34, 24), brightGoldMat);
      core.position.y = 0.17;
      lotusGroup.add(core);

      const petalGeo = new THREE.SphereGeometry(0.38, 12, 10);
      petalGeo.scale(0.65, 0.36, 1.45);
      for (let p = 0; p < 16; p++) {
        const angle = (p / 16) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, lotusPinkMat);
        petal.position.set(Math.cos(angle) * (radius * 0.84), 0.18, Math.sin(angle) * (radius * 0.84));
        petal.rotation.y = -angle + Math.PI / 2;
        petal.rotation.x = 0.28;
        lotusGroup.add(petal);
      }
      return lotusGroup;
    };

    // ============================================================================
    // 6. VERY BIG IDOL 1: COLOSSAL LORD GANESHA MURTI (~4.6m Tall on Left Throne)
    // ============================================================================
    const ganeshRoot = new THREE.Group();
    ganeshRoot.position.set(-2.15, 2.58, sinhasanZ);
    ganeshRoot.userData.isTempleIdol = true;

    const ganeshLotus = createGiantLotusThrone(1.48);
    ganeshRoot.add(ganeshLotus);

    const ganeshSkinMat = new THREE.MeshStandardMaterial({
      color: 0xff9e6d,
      emissive: 0x381205,
      emissiveIntensity: 0.18,
      roughness: 0.42,
      metalness: 0.1,
    });
    const pitambariDhotiMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0x4a3200,
      emissiveIntensity: 0.2,
      roughness: 0.38,
      metalness: 0.25,
    });
    const redSilkMat = new THREE.MeshStandardMaterial({
      color: 0xd91e36,
      emissive: 0x450610,
      emissiveIntensity: 0.22,
      roughness: 0.4,
      metalness: 0.2,
    });

    // Crossed Seated Legs in Pitambari Yellow Silk Dhoti
    const gLeftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 8, 14), pitambariDhotiMat);
    gLeftLeg.rotation.z = Math.PI / 2;
    gLeftLeg.rotation.y = 0.25;
    gLeftLeg.position.set(-0.32, 0.56, 0.35);
    const gRightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 8, 14), pitambariDhotiMat);
    gRightLeg.rotation.z = Math.PI / 2;
    gRightLeg.rotation.y = -0.25;
    gRightLeg.position.set(0.32, 0.56, 0.35);
    ganeshRoot.add(gLeftLeg, gRightLeg);

    // Auspicious Lambodara Belly & Broad Torso + Sacred Janeu & Red Angavastram
    const gBelly = new THREE.Mesh(new THREE.SphereGeometry(0.76, 20, 18), ganeshSkinMat);
    gBelly.scale.set(1.06, 0.96, 0.95);
    gBelly.position.set(0, 1.18, 0.08);
    const gChest = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.92, 18), ganeshSkinMat);
    gChest.position.set(0, 1.78, 0);
    const gKamarbandh = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.075, 10, 24), brightGoldMat);
    gKamarbandh.rotation.x = Math.PI / 2;
    gKamarbandh.position.set(0, 0.78, 0.06);
    const gJaneu = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.035, 8, 24), brightGoldMat);
    gJaneu.position.set(0, 1.48, 0.08);
    gJaneu.rotation.set(0.35, 0.2, -0.68);
    const gHaar = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.065, 10, 22), brightGoldMat);
    gHaar.rotation.x = Math.PI / 2 - 0.35;
    gHaar.position.set(0, 2.08, 0.22);
    const gStole = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.09, 10, 20), redSilkMat);
    gStole.rotation.x = Math.PI / 2 - 0.2;
    gStole.position.set(0, 2.12, 0.05);
    ganeshRoot.add(gBelly, gChest, gKamarbandh, gJaneu, gHaar, gStole);

    // 4 Chaturbhuj Arms of Lord Ganesha
    // 1) Lower Right Arm: Abhaya Mudra (Blessing Palm facing devotees)
    const gArmLR = new THREE.Group();
    gArmLR.position.set(-0.74, 1.85, 0.12);
    const gUpperLR = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.52, 8, 12), ganeshSkinMat);
    gUpperLR.position.set(-0.14, -0.25, 0.18);
    gUpperLR.rotation.set(-0.5, 0, -0.35);
    const gPalmLR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.12), ganeshSkinMat);
    gPalmLR.position.set(-0.22, -0.15, 0.55);
    const gTilakPalm = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a })
    );
    gTilakPalm.position.set(-0.22, -0.15, 0.62);
    gArmLR.add(gUpperLR, gPalmLR, gTilakPalm);
    ganeshRoot.add(gArmLR);

    // 2) Lower Left Arm: Holding Golden Plate of Sweet Modaks!
    const gArmLL = new THREE.Group();
    gArmLL.position.set(0.74, 1.85, 0.12);
    const gUpperLL = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 8, 12), ganeshSkinMat);
    gUpperLL.position.set(0.14, -0.32, 0.24);
    gUpperLL.rotation.set(-0.65, 0, 0.3);
    const modakPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.06, 14), brightGoldMat);
    modakPlate.position.set(0.22, -0.45, 0.58);
    const giantModak = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.32, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0x5c4300, emissiveIntensity: 0.25, roughness: 0.35 })
    );
    giantModak.position.set(0.22, -0.26, 0.58);
    gArmLL.add(gUpperLL, modakPlate, giantModak);
    ganeshRoot.add(gArmLL);

    // 3) Upper Right Arm: Holding Sacred Golden Parashu / Ankush
    const gArmUR = new THREE.Group();
    gArmUR.position.set(-0.78, 2.02, -0.08);
    const gUpperUR = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 8, 12), ganeshSkinMat);
    gUpperUR.position.set(-0.35, 0.32, 0);
    gUpperUR.rotation.z = 0.78;
    const parashuStaff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 8), brightGoldMat);
    parashuStaff.position.set(-0.62, 0.68, 0.08);
    const parashuBlade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 4), brightGoldMat);
    parashuBlade.rotation.z = Math.PI / 2;
    parashuBlade.position.set(-0.45, 1.1, 0.08);
    gArmUR.add(gUpperUR, parashuStaff, parashuBlade);
    ganeshRoot.add(gArmUR);

    // 4) Upper Left Arm: Holding Blooming Pink Kamal (Sacred Lotus)
    const gArmUL = new THREE.Group();
    gArmUL.position.set(0.78, 2.02, -0.08);
    const gUpperUL = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 8, 12), ganeshSkinMat);
    gUpperUL.position.set(0.35, 0.32, 0);
    gUpperUL.rotation.z = -0.78;
    const lotusStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0x2ec4b6 })
    );
    lotusStem.position.set(0.62, 0.68, 0.08);
    const handLotus = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 10), lotusPinkMat);
    handLotus.rotation.x = Math.PI;
    handLotus.position.set(0.62, 1.12, 0.08);
    gArmUL.add(gUpperUL, lotusStem, handLotus);
    ganeshRoot.add(gArmUL);

    // Majestic Elephant Head (Gajanana), Fanned Ears, Single Tusk & Curved Trunk (Vakratunda)
    const gHeadGroup = new THREE.Group();
    gHeadGroup.position.set(0, 2.65, 0.08);
    const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 18), ganeshSkinMat);
    gHeadGroup.add(gHead);

    // Large Fanned Elephant Ears (Shurpakarna)
    for (const earSide of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), ganeshSkinMat);
      ear.scale.set(0.95, 1.15, 0.24);
      ear.position.set(earSide * 0.72, 0.02, -0.08);
      ear.rotation.y = earSide * -0.28;
      gHeadGroup.add(ear);
    }

    // Sacred Red Sindoor Tilak / Trishul Mark on Forehead & Expressive Eyes
    for (let line = -1; line <= 1; line++) {
      const tripundra = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.035, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffdd55 })
      );
      tripundra.position.set(0, 0.22 + line * 0.055, 0.56);
      gHeadGroup.add(tripundra);
    }
    const sindoorBindu = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff1e27 })
    );
    sindoorBindu.position.set(0, 0.22, 0.58);
    gHeadGroup.add(sindoorBindu);

    for (const eyeSide of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      eyeWhite.position.set(eyeSide * 0.24, 0.06, 0.52);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x140b07 })
      );
      pupil.position.set(eyeSide * 0.24, 0.06, 0.56);
      gHeadGroup.add(eyeWhite, pupil);
    }

    // Curved Multi-Segment Trunk (Vakratunda) curling toward the Modak!
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.05, 0.52),
      new THREE.Vector3(0, -0.42, 0.66),
      new THREE.Vector3(0.08, -0.82, 0.62),
      new THREE.Vector3(0.28, -0.95, 0.54),
      new THREE.Vector3(0.36, -0.78, 0.52),
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 20, 0.16, 12, false);
    const trunkMesh = new THREE.Mesh(trunkGeo, ganeshSkinMat);
    gHeadGroup.add(trunkMesh);

    // Ivory Tusks (Right Whole Tusk + Left Ekadanta Half Tusk)
    const ivoryMat = new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 0.25 });
    const rightTusk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 10), ivoryMat);
    rightTusk.position.set(-0.22, -0.22, 0.56);
    rightTusk.rotation.x = Math.PI * 0.62;
    const leftTusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), ivoryMat);
    leftTusk.position.set(0.22, -0.18, 0.54);
    leftTusk.rotation.x = Math.PI * 0.62;
    gHeadGroup.add(rightTusk, leftTusk);

    // Towering Tiered Golden Ratna Mukut (Crown) & Rotating Chakra Halo
    const gCrown1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.42, 16), brightGoldMat);
    gCrown1.position.y = 0.62;
    const gCrown2 = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 16), brightGoldMat);
    gCrown2.position.y = 1.22;
    const gCrownGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: 0xff1744 })
    );
    gCrownGem.position.set(0, 0.65, 0.45);
    gHeadGroup.add(gCrown1, gCrown2, gCrownGem);

    const gHalo = new THREE.Group();
    gHalo.position.set(0, 0.35, -0.45);
    const haloRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.32, 24), brightGoldMat);
    const haloInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
    );
    gHalo.add(haloRing, haloInner);
    gHeadGroup.add(gHalo);
    this.templeHalos.push(gHalo);

    ganeshRoot.add(gHeadGroup);

    // Sacred Vahana Mushak-Raj (Mouse) sitting near Ganesha's Lotus Base holding a Laddoo
    const mushak = new THREE.Group();
    mushak.position.set(-0.95, 0.25, 1.15);
    mushak.rotation.y = 0.45;
    const mBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.7 })
    );
    mBody.scale.set(0.85, 0.85, 1.25);
    const mLaddoo = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    mLaddoo.position.set(0, 0.08, 0.22);
    mushak.add(mBody, mLaddoo);
    ganeshRoot.add(mushak);

    temple.add(ganeshRoot);

    // ============================================================================
    // 7. VERY BIG IDOL 2: COLOSSAL MAA LAKSHMI MURTI (~4.7m Tall on Right Throne)
    // ============================================================================
    const laxmiRoot = new THREE.Group();
    laxmiRoot.position.set(2.15, 2.58, sinhasanZ);
    laxmiRoot.userData.isTempleIdol = true;

    const laxmiLotus = createGiantLotusThrone(1.48);
    laxmiRoot.add(laxmiLotus);

    const laxmiSkinMat = new THREE.MeshStandardMaterial({
      color: 0xffcba4,
      emissive: 0x3b1b0a,
      emissiveIntensity: 0.18,
      roughness: 0.38,
      metalness: 0.08,
    });
    const emeraldMat = new THREE.MeshStandardMaterial({
      color: 0x00a86b,
      roughness: 0.3,
      metalness: 0.35,
    });

    // Seated / Enthroned Royal Sindoori Saree & Zari Border Drape
    const lSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.78, 1.28, 20), redSilkMat);
    lSkirt.position.set(0, 0.92, 0.05);
    const lZariBorder = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.8, 0.18, 20), brightGoldMat);
    lZariBorder.position.set(0, 0.38, 0.05);
    const lTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.92, 18), emeraldMat);
    lTorso.position.set(0, 1.82, 0);
    const lPallu = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.05, 0.42), redSilkMat);
    lPallu.position.set(0.04, 1.72, 0.04);
    lPallu.rotation.z = 0.22;
    const lKamarbandh = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.065, 10, 22), brightGoldMat);
    lKamarbandh.rotation.x = Math.PI / 2;
    lKamarbandh.position.set(0, 1.42, 0.04);
    const lRaniHaar1 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 10, 22), brightGoldMat);
    lRaniHaar1.rotation.x = Math.PI / 2 - 0.38;
    lRaniHaar1.position.set(0, 2.15, 0.18);
    const lRaniHaar2 = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.045, 10, 22), brightGoldMat);
    lRaniHaar2.rotation.x = Math.PI / 2 - 0.42;
    lRaniHaar2.position.set(0, 2.02, 0.21);
    laxmiRoot.add(lSkirt, lZariBorder, lTorso, lPallu, lKamarbandh, lRaniHaar1, lRaniHaar2);

    // 4 Chaturbhuj Arms of Maa Lakshmi
    // 1) Upper Right & Upper Left Arms holding Twin Blooming Pink Lotuses (Padma)
    for (const side of [-1, 1]) {
      const uArm = new THREE.Group();
      uArm.position.set(side * 0.56, 2.06, -0.06);
      const uLimb = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.58, 8, 12), laxmiSkinMat);
      uLimb.position.set(side * 0.32, 0.28, 0);
      uLimb.rotation.z = side * -0.74;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.78, 8),
        new THREE.MeshStandardMaterial({ color: 0x2ec4b6 })
      );
      stem.position.set(side * 0.58, 0.65, 0.06);
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.38, 12), lotusPinkMat);
      bloom.rotation.x = Math.PI;
      bloom.position.set(side * 0.58, 1.05, 0.06);
      const bloomGoldCenter = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), brightGoldMat);
      bloomGoldCenter.position.set(side * 0.58, 1.18, 0.06);
      uArm.add(uLimb, stem, bloom, bloomGoldCenter);
      laxmiRoot.add(uArm);
    }

    // 2) Lower Right Arm: Abhaya Mudra (Blessing Hand)
    const lArmLR = new THREE.Group();
    lArmLR.position.set(-0.52, 1.9, 0.1);
    const lLimbLR = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 8, 12), laxmiSkinMat);
    lLimbLR.position.set(-0.12, -0.22, 0.18);
    lLimbLR.rotation.set(-0.52, 0, -0.28);
    const lPalmLR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.1), laxmiSkinMat);
    lPalmLR.position.set(-0.18, -0.1, 0.48);
    lArmLR.add(lLimbLR, lPalmLR);
    laxmiRoot.add(lArmLR);

    // 3) Lower Left Arm: Holding Swarna Kalash Pouring Stream of Gold Coins (Dhan-Varsha!)
    const lArmLL = new THREE.Group();
    lArmLL.position.set(0.52, 1.9, 0.1);
    const lLimbLL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 8, 12), laxmiSkinMat);
    lLimbLL.position.set(0.14, -0.28, 0.22);
    lLimbLL.rotation.set(-0.62, 0, 0.25);
    const dhanKalash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), brightGoldMat);
    dhanKalash.position.set(0.22, -0.45, 0.52);
    lArmLL.add(lLimbLL, dhanKalash);
    laxmiRoot.add(lArmLL);

    // Cascading Stream of Golden Coins into a Treasure Urli at Maa Lakshmi's Feet
    const coinUrli = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.22, 16), brightGoldMat);
    coinUrli.position.set(0.45, 0.36, 1.05);
    laxmiRoot.add(coinUrli);
    for (let c = 0; c < 10; c++) {
      const tCoin = c / 9;
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.025, 12), brightGoldMat);
      coin.rotation.x = Math.PI / 3;
      coin.position.set(
        THREE.MathUtils.lerp(0.72, 0.45, tCoin) + Math.sin(c) * 0.04,
        THREE.MathUtils.lerp(1.38, 0.48, tCoin),
        THREE.MathUtils.lerp(0.62, 1.05, tCoin)
      );
      laxmiRoot.add(coin);
    }

    // Serene Divine Face of Maa Lakshmi, Kumkum Bindi, Golden Nath & Towering Swarna Mukut
    const lHeadGroup = new THREE.Group();
    lHeadGroup.position.set(0, 2.66, 0.05);
    const lHead = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 18), laxmiSkinMat);
    lHeadGroup.add(lHead);

    const lBindi = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff1744 })
    );
    lBindi.position.set(0, 0.14, 0.44);
    const lNath = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 14), brightGoldMat);
    lNath.position.set(0.06, -0.04, 0.45);
    lHeadGroup.add(lBindi, lNath);

    for (const eyeSide of [-1, 1]) {
      const eyeW = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      eyeW.position.set(eyeSide * 0.16, 0.05, 0.42);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x140b07 })
      );
      pupil.position.set(eyeSide * 0.16, 0.05, 0.45);
      const jhumka = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 10), brightGoldMat);
      jhumka.position.set(eyeSide * 0.46, -0.08, 0);
      lHeadGroup.add(eyeW, pupil, jhumka);
    }

    const lCrown1 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.42, 16), brightGoldMat);
    lCrown1.position.y = 0.52;
    const lCrown2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.92, 16), brightGoldMat);
    lCrown2.position.y = 1.15;
    lHeadGroup.add(lCrown1, lCrown2);

    const lHalo = new THREE.Group();
    lHalo.position.set(0, 0.28, -0.42);
    const lHaloRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.32, 24), brightGoldMat);
    const lHaloInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4d88, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
    );
    lHalo.add(lHaloRing, lHaloInner);
    lHeadGroup.add(lHalo);
    this.templeHalos.push(lHalo);

    laxmiRoot.add(lHeadGroup);
    temple.add(laxmiRoot);

    // 8. CENTRAL SHUBH-LABH KALASH & TWIN TALL BRASS DEEP-STAMBHS FLANKING THE IDOLS
    for (const stambhSide of [-4.15, 4.15]) {
      const stambh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 3.2, 12), brightGoldMat);
      stambh.position.set(stambhSide, 2.9, sinhasanZ + 0.85);
      temple.add(stambh);
      for (const tierY of [2.2, 3.1, 4.0]) {
        const { group: sDiya } = this.createClayDiyaMesh(0.85, true);
        sDiya.position.set(stambhSide, tierY, sinhasanZ + 1.05);
        temple.add(sDiya);
      }
    }

    // Mahaprasad Bhog Thali in front of the Sinhasan (Modaks & Kaju Katli)
    const prasadGroup = new THREE.Group();
    prasadGroup.position.set(0, 2.62, sinhasanZ + 1.05);
    const bhogPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.08, 18), brightGoldMat);
    prasadGroup.add(bhogPlate);
    for (let m = 0; m < 7; m++) {
      const a = (m / 7) * Math.PI * 2;
      const laddoo = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x663300, emissiveIntensity: 0.3 })
      );
      laddoo.position.set(Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24);
      prasadGroup.add(laddoo);
    }
    temple.add(prasadGroup);
    this.templePrasadGroup = prasadGroup;

    // 9. GIANT HANGING BRASS TEMPLE BELL (MANDIR GHANTI) IN SABHA-MANDAP
    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 7.1, 2.45);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 8), brightGoldMat);
    chain.position.y = -0.68;
    const bellDome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.56, 0.72, 18), brightGoldMat);
    bellDome.position.y = -1.55;
    const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.065, 10, 22), brightGoldMat);
    bellRim.rotation.x = Math.PI / 2;
    bellRim.position.y = -1.9;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), brightGoldMat);
    clapper.position.y = -2.02;
    const bellHitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    bellHitbox.position.y = -1.4;
    bellHitbox.userData.isTempleBell = true;
    bellPivot.add(chain, bellDome, bellRim, clapper, bellHitbox);
    temple.add(bellPivot);
    this.templeBellPivot = bellPivot;

    // 10. INTERACTIVE SACRED GOLDEN AARTI THALI ON CARVED CHOWKI PEDESTAL
    const chowki = new THREE.Group();
    chowki.position.set(0, 1.32, 2.85);
    const chowkiBase = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.78, 18), sandstoneMat);
    chowkiBase.position.y = 0.39;
    const chowkiTop = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.72, 0.12, 18), goldMat);
    chowkiTop.position.y = 0.8;
    chowki.add(chowkiBase, chowkiTop);
    temple.add(chowki);

    const aartiThaliGroup = new THREE.Group();
    aartiThaliGroup.position.copy(this.templeAartiBasePos);

    // Wide Ornate Golden Brass Thali Plate with Embossed Rim
    const thaliPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.46, 0.06, 24), brightGoldMat);
    const thaliRim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 10, 24), brightGoldMat);
    thaliRim.rotation.x = Math.PI / 2;
    thaliRim.position.y = 0.03;
    aartiThaliGroup.add(thaliPlate, thaliRim);

    // 5-Wick Panchmukhi Aarti Diya in the Center + 4 Surrounding Diyas on the Thali
    const { group: centerAartiDiya } = this.createClayDiyaMesh(0.95, true);
    centerAartiDiya.position.set(0, 0.04, 0.12);
    aartiThaliGroup.add(centerAartiDiya);

    for (const [dx, dz] of [
      [-0.28, 0.18],
      [0.28, 0.18],
      [-0.26, -0.18],
      [0.26, -0.18],
    ]) {
      const { group: miniDiya } = this.createClayDiyaMesh(0.58, true);
      miniDiya.position.set(dx, 0.04, dz);
      aartiThaliGroup.add(miniDiya);
    }

    // Silver/Gold Kalash Lota, Kumkum & Haldi Katoris, and Marigold Flowers on the Thali
    const lota = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), brightGoldMat);
    lota.position.set(0, 0.12, -0.28);
    const kumkumBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.07, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xe6192e, roughness: 0.5 })
    );
    kumkumBowl.position.set(-0.36, 0.06, -0.02);
    const haldiBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.07, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.5 })
    );
    haldiBowl.position.set(0.36, 0.06, -0.02);
    aartiThaliGroup.add(lota, kumkumBowl, haldiBowl);

    // Generous Invisible Hitbox around the Aarti Thali so clicking/dragging is effortless
    const thaliHitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 1.2, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    thaliHitbox.position.y = 0.25;
    thaliHitbox.userData.isTempleAarti = true;
    aartiThaliGroup.add(thaliHitbox);

    temple.add(aartiThaliGroup);
    this.templeAartiThali = aartiThaliGroup;

    // Warm Sanctum Point Lights illuminating the Giant Laxmi-Ganesh Idols & Aarti Thali
    const sanctumLight = new THREE.PointLight(0xffcf6e, 32, 22, 1.4);
    sanctumLight.position.set(0, 5.8, 0.8);
    const aartiGlowLight = new THREE.PointLight(0xffaa33, 14, 12, 1.5);
    aartiGlowLight.position.set(0, 2.8, 3.2);
    temple.add(sanctumLight, aartiGlowLight);

    this.addContactShadow(temple, 16.5, 15.5);
    this.dynamicRoot.add(temple);
  }

  private buildGrandAkashdeepTower(spec: MelaInteractableSpec): void {
    const tower = new THREE.Group();
    tower.position.set(spec.x, 0, spec.z);

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.22, metalness: 0.88 });
    const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x6e1423, roughness: 0.55 });

    // Stepped Octagonal Base Plinth
    for (let step = 0; step < 3; step++) {
      const r = 6.5 - step * 1.4;
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, 0.6, 16), step % 2 === 0 ? crimsonMat : brassMat);
      tier.position.y = 0.3 + step * 0.6;
      tower.add(tier);
    }

    // Towering 18m Golden Deep-Stambh (Lamp Pillar)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.35, 16, 16), brassMat);
    shaft.position.y = 9.8;
    tower.add(shaft);

    // 5 Tiers of Circular Diya Balconies up the Tower
    for (let t = 0; t < 5; t++) {
      const ty = 4.2 + t * 2.8;
      const tr = 3.2 - t * 0.42;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(tr, 0.16, 10, 24), brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ty;
      tower.add(ring);

      // Glowing diyas around each tier
      const bulbsOnTier = 8;
      for (let b = 0; b < bulbsOnTier; b++) {
        const a = (b / bulbsOnTier) * Math.PI * 2;
        const { group: diya } = this.createClayDiyaMesh(0.75, true);
        diya.position.set(Math.cos(a) * tr, ty + 0.05, Math.sin(a) * tr);
        diya.rotation.y = -a - Math.PI / 2;
        tower.add(diya);
      }
    }

    // Crown Swarna Kalash & Radiant Beacon at y = 18.5m
    const crownKalash = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 16), brassMat);
    crownKalash.position.y = 18.4;
    tower.add(crownKalash);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 12), brassMat);
    spire.position.y = 20.4;
    tower.add(spire);

    const signTex = createSignboardTexture(
      this.renderer,
      'महा-दीपोत्सव · 1008 AKASHDEEP',
      'Grand Diwali Sky Lantern & Aatishbaazi Finale'
    );
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.35), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 3.2, 5.6);
    tower.add(sign);

    this.addContactShadow(tower, 15, 15);
    this.dynamicRoot.add(tower);
  }

  private initParticleSystems(): void {
    // 1. Firework & Sparkler Particle System
    this.fwGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxFwParticles * 3);
    const colors = new Float32Array(this.maxFwParticles * 3);
    this.fwGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fwGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const fwMat = new THREE.PointsMaterial({
      size: 0.65,
      map: this.glowTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fwPoints = new THREE.Points(this.fwGeometry, fwMat);
    this.fwPoints.frustumCulled = false;
    this.scene.add(this.fwPoints);

    // 2. Floating Sky Lanterns (Akashdeep) InstancedMesh
    const lanternGeo = new THREE.CylinderGeometry(0.38, 0.26, 0.95, 10);
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffb84d });
    this.lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, this.maxLanterns);
    this.lanternMesh.frustumCulled = false;

    for (let i = 0; i < this.maxLanterns; i++) {
      this.lanterns.push({
        x: (Math.random() - 0.5) * 95,
        y: 12 + Math.random() * 55,
        z: -65 + Math.random() * 110,
        vy: 0.8 + Math.random() * 1.2,
        driftPhase: Math.random() * Math.PI * 2,
        scale: 0.75 + Math.random() * 0.55,
      });
    }
    this.scene.add(this.lanternMesh);
  }

  private initHandheldSparkler(): void {
    // Attached to camera so player holds a glowing Golden Phuljhari in the bottom-right view
    this.sparklerGroup.position.set(0.38, -0.32, -0.68);
    this.sparklerGroup.rotation.set(0.25, -0.2, 0.35);

    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8),
      new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.3 })
    );
    this.sparklerGroup.add(wire);

    const coating = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd27d, emissive: 0xff9900, emissiveIntensity: 0.9 })
    );
    coating.position.y = 0.08;
    this.sparklerGroup.add(coating);

    const tipSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffe499,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
    );
    tipSprite.position.y = 0.19;
    tipSprite.scale.set(0.28, 0.28, 1);
    this.sparklerGroup.add(tipSprite);

    this.sparklerTipLight = new THREE.PointLight(0xffb84d, 2.5, 6);
    this.sparklerTipLight.position.y = 0.2;
    this.sparklerGroup.add(this.sparklerTipLight);

    this.camera.add(this.sparklerGroup);
  }

  public toggleSparkler(): boolean {
    this.stats.sparklerActive = !this.stats.sparklerActive;
    this.sparklerGroup.visible = this.stats.sparklerActive && this.mode === 'walk';
    if (this.stats.sparklerActive) {
      this.audio.effect('sparkle');
      this.collectItem('Golden Phuljhari');
    }
    this.callbacks.onStatsChange({ ...this.stats });
    return this.stats.sparklerActive;
  }

  private spawnFireworkBurst(x: number, y: number, z: number, count = 55, customHex?: number): void {
    const palette = [0xffb703, 0xff4d6d, 0x06d6a0, 0x4cc9f0, 0xff9f1c, 0xffe699];
    const hex = customHex ?? palette[Math.floor(Math.random() * palette.length)];
    _color.setHex(hex);

    for (let i = 0; i < count; i++) {
      if (this.fwParticles.length >= this.maxFwParticles) {
        this.fwParticles.shift();
      }
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3.5 + Math.random() * 8.5;
      this.fwParticles.push({
        x,
        y,
        z,
        vx: speed * Math.sin(phi) * Math.cos(theta),
        vy: speed * Math.cos(phi) + 2.0,
        vz: speed * Math.sin(phi) * Math.sin(theta),
        r: _color.r,
        g: _color.g,
        b: _color.b,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.9,
        size: 1,
      });
    }
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        if (document.activeElement === dom || document.activeElement === document.body) {
          e.preventDefault();
        }
      }
      const k = e.key.toLowerCase();
      this.keys.add(k);

      if (k === 'e' && this.mode === 'walk' && this.nearSpec) {
        this.callbacks.onTalk(this.nearSpec);
      } else if (e.key === 'Escape') {
        if (this.mode !== 'walk' && this.mode !== 'welcome') {
          this.leaveActivity();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };

    const onPointerDown = (e: PointerEvent) => {
      dom.focus();
      this.dragState = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: 0,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragState) return;
      const dx = e.clientX - this.dragState.lastX;
      const dy = e.clientY - this.dragState.lastY;
      this.dragState.lastX = e.clientX;
      this.dragState.lastY = e.clientY;
      this.dragState.moved += Math.hypot(dx, dy);

      if (this.mode === 'walk' || this.mode === 'ride' || this.mode === 'firework-show') {
        this.player.yaw -= dx * 0.0042;
        this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - dy * 0.0032, -0.75, 0.85);
      } else if (this.mode === 'temple-aarti') {
        // Dragging pointer/finger in Temple Aarti mode circles the Golden Aarti Thali in front of Laxmi-Ganesh!
        const deltaAngle = (dx - dy * 0.6) * 0.022;
        this.advanceManualTempleAarti( Math.max(0.06, Math.abs(deltaAngle)) );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.dragState) return;
      const moved = this.dragState.moved;
      const dragDy = this.dragState.startY - e.clientY;
      this.dragState = null;

      if (moved < 18) {
        if (this.mode === 'balloon') {
          this.handleBalloonShot(e.clientX, e.clientY);
        } else if (this.mode === 'ring') {
          this.handleRingToss(e.clientX, e.clientY);
        } else if (this.mode === 'diya-game') {
          if (!this.checkDaanPetiClick(e.clientX, e.clientY)) {
            if (!this.checkSpecialInteractablesClick(e.clientX, e.clientY)) {
              this.handleDiyaTap(e.clientX, e.clientY);
            }
          }
        } else if (this.mode === 'rangoli') {
          this.handleRangoliTap(e.clientX, e.clientY);
        } else if (this.mode === 'temple-aarti') {
          if (!this.checkSpecialInteractablesClick(e.clientX, e.clientY)) {
            this.performTempleAartiWave();
          }
        } else if (this.mode === 'walk') {
          if (!this.checkDaanPetiClick(e.clientX, e.clientY)) {
            if (!this.checkRangoliClick(e.clientX, e.clientY)) {
              if (!this.checkSpecialInteractablesClick(e.clientX, e.clientY)) {
                this.checkCrowdClick(e.clientX, e.clientY);
              }
            }
          }
        }

      } else if (this.mode === 'ring' && dragDy > 24) {

        this.handleRingToss(e.clientX, e.clientY);
      }
    };

    const onResize = () => {
      if (this.disposed) return;
      const w = this.host.clientWidth || window.innerWidth;
      const h = this.host.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);

    // Save cleanup reference
    this.cleanupEvents = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }

  private cleanupEvents: () => void = () => {};

  // --- PUBLIC ACTIONS ---

  public enterMela(targetStallId?: string): void {
    this.audio.start();
    this.audio.effect('bell');

    if (targetStallId) {
      this.teleportTo(targetStallId);
      return;
    }

    this.player.x = 0;
    this.player.z = 52;
    this.player.yaw = 0;
    this.player.pitch = 0.04;
    this.entryStartTime = this.elapsed;
    this.setMode('entering', null);
  }

  public teleportTo(specId: string): void {
    this.audio.start();
    const spec = this.interactables.find((s) => s.id === specId);
    if (!spec) {
      this.setMode('walk', null);
      return;
    }

    // Position player right in front of the stall or attraction facing it
    const dist =
      spec.type === 'wheel' || spec.type === 'well' || spec.type === 'finale'
        ? 11
        : spec.type === 'temple'
        ? 9.2
        : 4.6;
    this.player.x = spec.x + Math.sin(spec.rotY) * dist;
    this.player.z = spec.z + Math.cos(spec.rotY) * dist;
    this.player.yaw = Math.atan2(this.player.x - spec.x, this.player.z - spec.z);
    this.player.pitch = spec.type === 'temple' ? 0.12 : 0.05;
    this.setMode('walk', null);
    this.audio.effect('sparkle');
  }

  public collectFoodOrItem(itemName: string, isFood: boolean, voiceLine?: string): void {
    if (isFood) {
      if (!this.stats.foodTasted.includes(itemName)) {
        this.stats.foodTasted.push(itemName);
      }
      this.audio.effect('eat');
    } else {
      this.audio.effect('sparkle');
    }
    if (itemName === 'Golden Phuljhari') {
      this.stats.sparklerActive = true;
    }
    this.collectItem(itemName);
    if (voiceLine) {
      this.audio.speak(voiceLine);
    }
    this.callbacks.onToast(`Added "${itemName}" to your Mela Jhola!`);
  }

  public collectItem(itemName: string): void {
    if (!this.stats.items.includes(itemName)) {
      this.stats.items.push(itemName);
    }
    this.callbacks.onStatsChange({ ...this.stats });
  }

  private checkDaanPetiClick(clientX: number, clientY: number): boolean {
    if (!this.daanPetiCollider) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const hits = this.raycaster.intersectObject(this.daanPetiCollider, true);
    if (hits.length > 0 && hits[0].distance < 22) {
      this.audio.effect('bell');
      this.spawnFireworkBurst(5.6, 2.1, -8.2, 24, 0xffd27d);
      this.callbacks.onOpenDaanPeti();
      return true;
    }
    return false;
  }

  public celebrateDaanPeti(): void {
    this.audio.effect('bell');
    this.audio.effect('cheer');
    this.spawnFireworkBurst(5.6, 2.4, -8.2, 48, 0xffd27d);
    this.collectItem('Seva Daan Peti · Diwali Charity Blessing');
  }

  private checkRangoliClick(clientX: number, clientY: number): boolean {
    if (!this.rangoliGroup) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const hits = this.raycaster.intersectObject(this.rangoliGroup, true);
    if (hits.length > 0 && hits[0].distance < 18) {
      const spec = this.interactables.find((s) => s.type === 'rangoli');
      if (spec) {
        this.audio.effect('sparkle');
        this.startMiniGame('rangoli', spec);
        return true;
      }
    }
    return false;
  }

  public startMiniGame(gameMode: 'balloon' | 'ring' | 'diya-game' | 'rangoli', spec: MelaInteractableSpec): void {
    this.activeSpec = spec;
    if (gameMode === 'balloon') {
      for (const b of this.balloonTargets) {
        b.popped = false;
        b.mesh.visible = true;
      }
      this.gameState = {
        mode: 'balloon',
        shotsLeft: 3,
        score: 0,
        done: false,
        message: 'Tap any balloon on the target board! Aim assist is on—3 shots!',
      };
      this.setMode('balloon', spec);
      this.callbacks.onGameUpdate({ ...this.gameState });
    } else if (gameMode === 'ring') {
      this.gameState = {
        mode: 'ring',
        shotsLeft: 5,
        score: 0,
        done: false,
        message: 'Tap a golden peg (or swipe UP) to toss your ring! 5 rings left.',
      };
      this.setMode('ring', spec);
      this.callbacks.onGameUpdate({ ...this.gameState });
    } else if (gameMode === 'diya-game') {
      for (const d of this.mandapDiyas) {
        d.lit = false;
        d.flame.visible = false;
      }
      this.gameState = {
        mode: 'diya-game',
        shotsLeft: 7,
        score: 0,
        totalTargets: 7,
        done: false,
        message: 'Tap each of the 7 earthen diyas around the Rangoli Mandap to light them!',
      };
      this.setMode('diya-game', spec);
      this.callbacks.onGameUpdate({ ...this.gameState });
    } else if (gameMode === 'rangoli') {
      const filledCount = this.rangoliSegments.filter((s) => s.filled).length;
      const total = this.rangoliSegments.length;
      this.gameState = {
        mode: 'rangoli',
        shotsLeft: total - filledCount,
        score: filledCount,
        totalTargets: total,
        done: filledCount >= total,
        selectedColor: this.selectedRangoliColor,
        symmetry: this.rangoliSymmetry,
        message:
          'Pick a Gulal color from the palette (or tap a 3D brass bowl) and click any floor petal or diamond to fill it!',
      };
      this.setMode('rangoli', spec);
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  public setRangoliColor(hex: string): void {
    this.selectedRangoliColor = hex;
    this.audio.effect('click');
    if (this.gameState && this.gameState.mode === 'rangoli') {
      const cObj = RANGOLI_COLORS.find((c) => c.hex === hex);
      this.gameState.selectedColor = hex;
      this.gameState.message = `Selected ${cObj ? `${cObj.name} (${cObj.hindi})` : hex} — click any floor pattern segment to fill!`;
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  public setRangoliSymmetry(symmetry: boolean): void {
    this.rangoliSymmetry = symmetry;
    this.audio.effect('click');
    if (this.gameState && this.gameState.mode === 'rangoli') {
      this.gameState.symmetry = symmetry;
      this.gameState.message = symmetry
        ? '8-Way Mandala Symmetry ON: clicking 1 petal fills the entire ring!'
        : 'Single Petal Brush ON: click individual petals to paint custom patterns!';
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  public applyRangoliPreset(preset: 'lotus' | 'peacock' | 'diwali' | 'clear'): void {
    if (!this.rangoliGroup) return;

    const ringColors: Record<'lotus' | 'peacock' | 'diwali', [string, string, string, string]> = {
      lotus: ['#ffb703', '#ff2a85', '#fb8500', '#e63946'],
      peacock: ['#ffb703', '#00b4d8', '#2ec4b6', '#8338ec'],
      diwali: ['#fff5de', '#e63946', '#ffb703', '#fb8500'],
    };

    for (const seg of this.rangoliSegments) {
      if (preset === 'clear') {
        const defaultUnfilled =
          seg.ringIndex === 0
            ? '#3e2d3c'
            : seg.ringIndex === 1
            ? '#3a2938'
            : seg.ringIndex === 2
            ? '#352535'
            : '#2f2030';
        seg.filled = false;
        seg.colorHex = defaultUnfilled;
        seg.mat.color.set(defaultUnfilled);
        seg.mat.emissive.set(defaultUnfilled);
        seg.mat.emissiveIntensity = 0.06;
      } else {
        const pal = ringColors[preset];
        // Alternate petals slightly in ring 3 for extra traditional vibrancy
        const chosenHex =
          seg.ringIndex === 3 && seg.petalIndex % 2 === 1
            ? pal[1]
            : pal[seg.ringIndex] || pal[0];
        seg.filled = true;
        seg.colorHex = chosenHex;
        seg.mat.color.set(chosenHex);
        seg.mat.emissive.set(chosenHex);
        seg.mat.emissiveIntensity = 0.34;
      }
    }

    if (preset === 'clear') {
      this.audio.effect('click');
    } else {
      this.audio.effect('cheer');
      this.spawnFireworkBurst(-6.2, 0.8, -8.2, 42, 0xffd27d);
      this.collectItem('Shubh Rangoli Kalakar Souvenir');
    }

    if (this.gameState && this.gameState.mode === 'rangoli') {
      const filledCount = this.rangoliSegments.filter((s) => s.filled).length;
      const total = this.rangoliSegments.length;
      this.gameState.score = filledCount;
      this.gameState.shotsLeft = total - filledCount;
      this.gameState.done = filledCount >= total;
      this.gameState.message =
        preset === 'clear'
          ? 'Floor cleared to white Kolam chalk outline! Pick a color and tap any petal to paint.'
          : 'Wah! Traditional Diwali Rangoli completed! Tap any petal to customize colors further.';
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  private handleBalloonShot(clientX: number, clientY: number): void {
    if (!this.gameState || this.gameState.mode !== 'balloon' || this.gameState.done) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // Find closest unpopped balloon (generous aim-assist radius so players feel festive joy!)
    let bestTarget: (typeof this.balloonTargets)[0] | null = null;
    let bestDist = 0.65;
    for (const b of this.balloonTargets) {
      if (b.popped) continue;
      b.mesh.getWorldPosition(_vec3);
      const dist = this.raycaster.ray.distanceToPoint(_vec3);
      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = b;
      }
    }

    this.gameState.shotsLeft--;
    if (bestTarget) {
      bestTarget.popped = true;
      bestTarget.mesh.visible = false;
      bestTarget.mesh.getWorldPosition(_vec3);
      this.spawnFireworkBurst(_vec3.x, _vec3.y, _vec3.z, 28, bestTarget.color);
      this.audio.effect('pop');
      this.gameState.score++;
      this.stats.balloonsPopped++;
      this.gameState.message = 'Phatak! Phod diya! Beautiful shot!';
    } else {
      this.audio.effect('miss');
      this.gameState.message = 'Oho! Zara sa chook gaye—aim right at a balloon!';
    }

    if (this.gameState.shotsLeft <= 0) {
      this.gameState.done = true;
      if (this.gameState.score > 0) {
        this.audio.effect('cheer');
        this.collectItem('Diwali Teddy Prize');
        this.gameState.message = `Arre waah! ${this.gameState.score}/3 balloons popped! Diwali Teddy Prize added to your Jhola!`;
      } else {
        this.gameState.message = 'Koi baat nahi! Play again free as many times as you like!';
      }
    }

    this.callbacks.onStatsChange({ ...this.stats });
    this.callbacks.onGameUpdate({ ...this.gameState });
  }

  private handleRingToss(clientX: number, clientY: number): void {
    if (!this.gameState || this.gameState.mode !== 'ring' || this.gameState.done || !this.ringFlight || this.ringFlight.active) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const col = nx < -0.25 ? -1 : nx > 0.25 ? 1 : 0;

    // 75% win rate when aiming reasonably near the table
    const willWin = Math.abs(nx) < 0.78 && Math.random() < 0.8;
    const spec = this.activeSpec!;

    this.ringFlight.active = true;
    this.ringFlight.t = 0;
    this.ringFlight.willWin = willWin;
    this.ringFlight.mesh.visible = true;
    this.ringFlight.start.copy(this.camera.position).add(new THREE.Vector3(0, -0.25, 0));

    // Target peg world coordinates
    const localX = col * 0.95 + (willWin ? 0 : 0.32);
    const localZ = 0.55;
    this.ringFlight.end.set(
      spec.x + localX * Math.cos(spec.rotY) + localZ * Math.sin(spec.rotY),
      1.35,
      spec.z - localX * Math.sin(spec.rotY) + localZ * Math.cos(spec.rotY)
    );
    this.audio.effect('click');
  }

  private handleDiyaTap(clientX: number, clientY: number): void {
    if (!this.gameState || this.gameState.mode !== 'diya-game') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // Find closest unlit diya (or light next unlit diya if tapped near the mandap)
    let targetDiya = this.mandapDiyas.find((d) => {
      if (d.lit) return false;
      d.group.getWorldPosition(_vec3);
      return this.raycaster.ray.distanceToPoint(_vec3) < 1.35;
    });

    if (!targetDiya) {
      targetDiya = this.mandapDiyas.find((d) => !d.lit);
    }

    if (targetDiya) {
      targetDiya.lit = true;
      targetDiya.flame.visible = true;
      if (!this.flameMeshes.includes(targetDiya.flame)) {
        this.flameMeshes.push(targetDiya.flame);
      }
      targetDiya.group.getWorldPosition(_vec3);
      this.spawnFireworkBurst(_vec3.x, _vec3.y + 0.4, _vec3.z, 22, 0xffd27d);
      this.audio.effect('diya-light');

      const litCount = this.mandapDiyas.filter((d) => d.lit).length;
      this.stats.diyasLit = litCount;
      this.gameState.score = litCount;
      this.gameState.shotsLeft = 7 - litCount;

      if (litCount >= 7) {
        this.gameState.done = true;
        this.gameState.message = 'Shubh Deepavali! All 7 Mandap Diyas are glowing! Deepotsav Blessing added to your Jhola!';
        this.audio.effect('cheer');
        this.collectItem('Deepotsav Mandap Blessing');
      } else {
        this.gameState.message = `Diya ${litCount} of 7 lit! Tap the remaining earthen diyas around the Rangoli.`;
      }
      this.callbacks.onStatsChange({ ...this.stats });
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  private handleRangoliTap(clientX: number, clientY: number): void {
    if (!this.gameState || this.gameState.mode !== 'rangoli' || !this.rangoliGroup) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const hits = this.raycaster.intersectObject(this.rangoliGroup, true);
    if (hits.length === 0) return;

    // 1. Check if the user tapped one of the 8 3D brass color bowls around the Rangoli
    for (const hit of hits) {
      const bowlColor = hit.object.userData?.rangoliBowlColor;
      if (bowlColor) {
        this.setRangoliColor(bowlColor);
        hit.object.getWorldPosition(_vec3);
        const hexNum = parseInt(bowlColor.replace('#', ''), 16);
        this.spawnFireworkBurst(_vec3.x, _vec3.y + 0.25, _vec3.z, 16, hexNum);
        return;
      }
    }

    // 2. Check if the user tapped one of the 25 pre-defined 3D mandala floor segments
    let tappedSeg: (typeof this.rangoliSegments)[0] | null = null;
    let hitPoint: THREE.Vector3 | null = null;

    for (const hit of hits) {
      const seg = hit.object.userData?.rangoliSegment || hit.object.parent?.userData?.rangoliSegment;
      if (seg) {
        tappedSeg = seg;
        hitPoint = hit.point;
        break;
      }
    }

    if (!tappedSeg) return;

    const hexColor = this.selectedRangoliColor;
    const hexNum = parseInt(hexColor.replace('#', ''), 16);

    if (this.rangoliSymmetry && tappedSeg.ringIndex > 0) {
      // Fill all 8 symmetrical petals/diamonds/arcs in the tapped ring
      for (const seg of this.rangoliSegments) {
        if (seg.ringIndex === tappedSeg.ringIndex) {
          seg.filled = true;
          seg.colorHex = hexColor;
          seg.mat.color.set(hexColor);
          seg.mat.emissive.set(hexColor);
          seg.mat.emissiveIntensity = 0.34;
        }
      }
    } else {
      tappedSeg.filled = true;
      tappedSeg.colorHex = hexColor;
      tappedSeg.mat.color.set(hexColor);
      tappedSeg.mat.emissive.set(hexColor);
      tappedSeg.mat.emissiveIntensity = 0.34;
    }

    if (hitPoint) {
      this.spawnFireworkBurst(hitPoint.x, hitPoint.y + 0.25, hitPoint.z, 22, hexNum);
    }
    this.audio.effect('sparkle');

    const filledCount = this.rangoliSegments.filter((s) => s.filled).length;
    const total = this.rangoliSegments.length;
    this.gameState.score = filledCount;
    this.gameState.shotsLeft = total - filledCount;

    if (filledCount >= total) {
      if (!this.gameState.done) {
        this.audio.effect('cheer');
        this.spawnFireworkBurst(-6.2, 0.9, -8.2, 45, 0xffd27d);
        this.collectItem('Shubh Rangoli Kalakar Souvenir');
      }
      this.gameState.done = true;
      this.gameState.message =
        'Adbhut! All 25 Mandala petals are glowing! Keep customizing colors or snap a Rangoli Postcard!';
    } else {
      const ringNames = ['Center Kamal Bindu', 'Inner Lotus Petals', 'Star Diamond Ring', 'Outer Marigold Border'];
      this.gameState.message = `Colored ${ringNames[tappedSeg.ringIndex]} (${filledCount}/${total} filled)! Tap more petals or switch colors.`;
    }

    this.callbacks.onGameUpdate({ ...this.gameState });
  }

  public startRide(spec: MelaInteractableSpec): void {
    this.activeSpec = spec;
    this.rideTimer = 0;
    this.rideDuration = 16;
    if (!this.stats.ridesTaken.includes(spec.name)) {
      this.stats.ridesTaken.push(spec.name);
    }
    this.collectItem(`${spec.name.split('·')[0].trim()} Ticket`);
    this.audio.effect('bell');
    this.setMode('ride', spec);
  }

  public startWellOfDeath(spectator: boolean, spec: MelaInteractableSpec): void {
    this.activeSpec = spec;
    this.wellState = {
      spectator,
      angle: 0,
      height: 3.2,
      speed: 6.4,
      score: 0,
      timeLeft: 20,
      verticalInput: 0,
      boost: false,
    };
    for (const r of this.wellRings) {
      r.collected = false;
      r.mesh.visible = true;
    }
    this.gameState = {
      mode: 'well',
      shotsLeft: 20,
      score: 0,
      done: false,
      spectator,
      message: spectator
        ? 'Watching from the top gallery! Look down as the stunt riders circle the wooden wall!'
        : 'Steer UP/DOWN (W/S or buttons) & BOOST to grab the 8 Golden Diwali Rings on the wall!',
    };
    this.setMode('well', spec);
    this.callbacks.onGameUpdate({ ...this.gameState });
  }

  public setWellControl(verticalInput: number, boost: boolean): void {
    this.wellState.verticalInput = verticalInput;
    this.wellState.boost = boost;
  }

  public startStageShow(spec?: MelaInteractableSpec): void {
    this.activeSpec = spec || this.interactables.find((s) => s.type === 'stage') || null;
    this.rideTimer = 0;
    this.rideDuration = 18;
    this.collectItem('Ayodhya Deepotsav & Ram Leela Pass');
    this.audio.effect('bell');
    this.setMode('stage', this.activeSpec);
  }

  public startFireworkShow(spec?: MelaInteractableSpec): void {
    this.activeSpec = spec || this.interactables.find((s) => s.type === 'fireworks') || null;
    this.fireworkTimer = 0;
    this.collectItem('Roshni Ka Jashn Sparkler Memory');
    this.audio.effect('firework');
    this.setMode('firework-show', this.activeSpec);
  }

  public startGrandFinale(spec?: MelaInteractableSpec): void {
    this.activeSpec = spec || this.interactables.find((s) => s.type === 'finale') || null;
    this.finaleTimer = 0;
    this.finalePhase = '';
    this.stats.finaleWatched = true;
    this.collectItem('1008 Akashdeep Finale Blessing');
    this.audio.effect('bell');
    this.setMode('finale', this.activeSpec);
  }

  public startTempleAarti(spec?: MelaInteractableSpec): void {
    const targetSpec = spec || this.interactables.find((s) => s.type === 'temple') || null;
    this.activeSpec = targetSpec;
    this.templeAartiCircles = 0;
    this.templeAartiAngle = 0;
    this.templeAartiTimer = 4.5;
    this.templeBellTimer = 4.0;
    this.audio.effect('bell');
    this.audio.speak('Om Gan Ganpataye Namah! Om Mahalakshmyai Namah! Aarti Thali ghumaiye aur aashirwad lijiye!');

    this.gameState = {
      mode: 'temple-aarti',
      shotsLeft: 5,
      score: 1,
      totalTargets: 5,
      done: false,
      message:
        'Click "Wave Aarti Thali" or drag your mouse/finger in circles to perform 5 sacred Aarti rounds before Maa Lakshmi & Lord Ganesha!',
    };
    this.setMode('temple-aarti', targetSpec);
    this.callbacks.onGameUpdate({ ...this.gameState });
  }

  private advanceManualTempleAarti(angleStep: number): void {
    this.templeAartiAngle += angleStep;
    this.templeAartiTimer = Math.max(this.templeAartiTimer, 0.35);

    const newCircles = Math.min(5, 1 + Math.floor(this.templeAartiAngle / (Math.PI * 1.6)));
    if (newCircles > this.templeAartiCircles) {
      this.templeAartiCircles = newCircles;
      this.audio.effect('bell');
      this.spawnFireworkBurst(0, 4.8, -34.5, 28, 0xffd768);

      if (this.gameState && this.gameState.mode === 'temple-aarti') {
        this.gameState.score = this.templeAartiCircles;
        this.gameState.shotsLeft = Math.max(0, 5 - this.templeAartiCircles);
        if (this.templeAartiCircles >= 5 && !this.gameState.done) {
          this.gameState.done = true;
          this.audio.effect('cheer');
          this.collectItem('Shri Laxmi-Ganesh Maha-Aarti Siddhi Blessing');
          this.gameState.message =
            'शतायु भव! सौभाग्यवती भव! All 5 Maha-Aarti rounds complete! Maa Lakshmi & Lord Ganesha Blessings added to your Mela Bag!';
        } else {
          this.gameState.message = `Maha-Aarti Round ${this.templeAartiCircles} of 5! Keep circling the Golden Aarti Thali or shower Pushpanjali flowers!`;
        }
        this.callbacks.onGameUpdate({ ...this.gameState });
      }
    }
  }

  public performTempleAartiWave(): void {
    this.templeAartiTimer = 6.5;
    this.templeBellTimer = 4.2;
    this.audio.effect('bell');
    this.advanceManualTempleAarti(Math.PI * 1.7);
    this.spawnFireworkBurst(-2.1, 5.4, -35.5, 32, 0xffbe0b);
    this.spawnFireworkBurst(2.1, 5.4, -35.5, 32, 0xff4d88);
    this.collectItem('Shri Laxmi-Ganesh Aarti Aashirwad');
    this.callbacks.onToast('🪔 Performing Shri Laxmi-Ganesh Maha-Aarti with the Golden Panchmukhi Thali!');
  }

  public ringTempleBell(): void {
    this.templeBellTimer = 4.5;
    this.audio.effect('bell');
    this.spawnFireworkBurst(0, 6.2, -31.5, 30, 0xffd768);
    this.collectItem('Laxmi-Ganesh Mandir Ghanti Blessing');
    this.callbacks.onToast('🔔 घंटा-नाद! The grand brass Mandir Ghanti echoes across the Diwali Mela!');
  }

  public offerTemplePushpanjali(): void {
    this.audio.effect('sparkle');
    this.audio.effect('cheer');
    // Shower golden marigold & pink lotus petals over both giant idols!
    for (const ix of [-2.15, 0, 2.15]) {
      this.spawnFireworkBurst(ix, 6.8, -35.8, 42, ix < 0 ? 0xff9f1c : ix > 0 ? 0xff4d88 : 0xffd768);
    }
    this.collectItem('Pushpanjali Kamal & Genda Aashirwad');
    if (this.gameState && this.gameState.mode === 'temple-aarti') {
      this.gameState.message = '🌸 Pushpanjali offered! Marigold and lotus petals shower over Maa Lakshmi & Lord Ganesha!';
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
    this.callbacks.onToast('🌸 Pushpanjali Flower Shower offered at the lotus feet of Shri Laxmi-Ganesh!');
  }

  public offerTemplePrasad(): void {
    this.audio.effect('eat');
    this.audio.effect('sparkle');
    this.spawnFireworkBurst(0, 3.6, -34.8, 34, 0xffcf56);
    this.collectFoodOrItem(
      'Laxmi-Ganesh Mandir Modak & Kaju Katli Mahaprasad',
      true,
      'Ganpati Bappa Morya! Mangal Murti Morya! Yeh lijiye Modak aur Kaju Katli ka pavitra Mahaprasad!'
    );
    if (this.gameState && this.gameState.mode === 'temple-aarti') {
      this.gameState.message =
        '🍬 Modak & Kaju Katli Bhog offered! Sacred Mandir Mahaprasad added to your Mela Bag!';
      this.callbacks.onGameUpdate({ ...this.gameState });
    }
  }

  public leaveActivity(): void {
    const prev = this.activeSpec;
    this.gameState = null;
    this.callbacks.onGameUpdate(null);
    this.callbacks.onCinematic(null);

    if (prev) {
      const dist =
        prev.type === 'wheel' || prev.type === 'well' || prev.type === 'finale'
          ? 11.5
          : prev.type === 'temple'
          ? 9.2
          : 4.8;
      this.player.x = prev.x + Math.sin(prev.rotY) * dist;
      this.player.z = prev.z + Math.cos(prev.rotY) * dist;
      this.player.yaw = Math.atan2(this.player.x - prev.x, this.player.z - prev.z);
      this.player.pitch = prev.type === 'temple' ? 0.12 : 0.04;
    }
    this.setMode('walk', null);
    this.renderer.domElement.focus();
  }

  public captureSnapshotDataUrl(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private setMode(newMode: MelaMode, spec: MelaInteractableSpec | null): void {
    this.mode = newMode;
    this.activeSpec = spec;
    this.sparklerGroup.visible = this.stats.sparklerActive && newMode === 'walk';
    this.callbacks.onModeChange(newMode, spec);
  }

  // --- MAIN RENDER & SIMULATION LOOP ---

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const dt = Math.min(0.06, this.clock.getDelta());
    this.elapsed += dt;

    this.updateWorldAnimations(dt);
    this.updateActiveMode(dt);
    this.updateParticlesAndLanterns(dt);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateWorldAnimations(dt: number): void {
    const t = this.elapsed;

    // 1. Ferris Wheel rotation + upright gondolas
    if (this.ferrisWheelRim) {
      this.ferrisWheelRim.rotation.z += dt * 0.24;
      const wheelRot = this.ferrisWheelRim.rotation.z;
      for (const g of this.ferrisGondolas) {
        g.rotation.z = -wheelRot;
      }
    }

    // 2. Carousel rotation + bobbing horses
    if (this.carouselPlatform) {
      this.carouselPlatform.rotation.y += dt * 0.65;
      for (const h of this.carouselHorses) {
        h.position.y = 1.6 + Math.sin(t * 2.8 + (h.userData.phase || 0)) * 0.32;
      }
    }

    // 3. Swinging Peacock Pirate Ship pendulum
    if (this.pirateShipPivot) {
      this.pirateShipPivot.rotation.x = Math.sin(t * 1.45) * 0.62;
    }

    // 4. Well of Death stunt bikes
    for (const b of this.wellBikes) {
      b.angle += dt * b.speed;
      const r = 6.5;
      b.group.position.set(Math.cos(b.angle) * r, b.height + Math.sin(t * 2 + b.angle) * 0.35, Math.sin(b.angle) * r);
      b.group.rotation.set(0, -b.angle, Math.PI / 2 - 0.18);
    }

    // 5. Waving shopkeepers & flickering diya flames
    for (let i = 0; i < this.shopkeeperArms.length; i++) {
      this.shopkeeperArms[i].rotation.z = 2.4 + Math.sin(t * 3.2 + i) * 0.28;
    }
    for (let i = 0; i < this.flameMeshes.length; i++) {
      const s = 0.92 + Math.sin(t * 9.5 + i * 1.7) * 0.12;
      this.flameMeshes[i].scale.set(s, s, s);
    }

    // 6. Bobbing balloons
    for (let i = 0; i < this.balloonTargets.length; i++) {
      const b = this.balloonTargets[i];
      if (!b.popped) {
        b.mesh.position.y = b.basePos.y + Math.sin(t * 2.4 + i) * 0.04;
      }
    }

    // 6b. Mela Crowd Visitors (roaming, sitting & eating, standing at shops, and greeting waves)
    this.updateCrowdAnimations(dt);

    // 6c. Mandir Ghanti, Maha-Aarti Thali, Ground Crackers (Anaar/Chakri) & Floating Wish Lanterns
    this.updateSpecialFestiveAnimations(dt);



    // 7. Ring Toss flight animation
    if (this.ringFlight && this.ringFlight.active) {
      this.ringFlight.t += dt * 2.2;
      const p = Math.min(1, this.ringFlight.t);
      _vec3.lerpVectors(this.ringFlight.start, this.ringFlight.end, p);
      _vec3.y += Math.sin(p * Math.PI) * 1.35;
      this.ringFlight.mesh.position.copy(_vec3);

      if (p >= 1) {
        this.ringFlight.active = false;
        this.ringFlight.mesh.visible = false;
        if (this.gameState && this.gameState.mode === 'ring') {
          this.gameState.shotsLeft--;
          if (this.ringFlight.willWin) {
            this.gameState.score++;
            this.stats.ringsLanded++;
            this.audio.effect('ring-win');
            this.spawnFireworkBurst(this.ringFlight.end.x, this.ringFlight.end.y + 0.3, this.ringFlight.end.z, 30, 0xffd27d);
            this.gameState.message = 'Sahi Nishana! Golden ring landed right on the prize!';
          } else {
            this.audio.effect('miss');
            this.gameState.message = 'Arre! Ring bounced off the edge—try a gentle upward toss!';
          }

          if (this.gameState.shotsLeft <= 0) {
            this.gameState.done = true;
            if (this.gameState.score > 0) {
              this.collectItem('Swarna Challa Trophy');
              this.gameState.message = `Shandar! ${this.gameState.score}/5 rings landed! Swarna Challa Trophy added to your Jhola!`;
            } else {
              this.gameState.message = 'Try again free! Bhaiya gives extra rings on Diwali!';
            }
          }
          this.callbacks.onStatsChange({ ...this.stats });
          this.callbacks.onGameUpdate({ ...this.gameState });
        }
      }
    }
  }

  private updateActiveMode(dt: number): void {
    const t = this.elapsed;

    if (this.mode === 'welcome') {
      // Sweeping cinematic overview camera circling the glowing Diwali Mela
      const angle = t * 0.14;
      this.camera.position.set(Math.sin(angle) * 24, 11.5 + Math.sin(t * 0.4) * 1.5, 22 + Math.cos(angle) * 22);
      this.camera.lookAt(0, 3.2, -12);
      return;
    }

    if (this.mode === 'entering') {
      const p = Math.min(1, (t - this.entryStartTime) / 2.2);
      const smooth = THREE.MathUtils.smootherstep(p, 0, 1);
      this.player.z = THREE.MathUtils.lerp(52, 37, smooth);
      this.camera.position.set(0, 1.72 + Math.sin(p * Math.PI * 4) * 0.05, this.player.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(0.05, 0, 0);
      if (p >= 1) {
        this.setMode('walk', null);
      }
      return;
    }

    if (this.mode === 'walk') {
      const forward =
        (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
        (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) -
        this.joystick.y;
      const strafe =
        (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
        (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) +
        this.joystick.x;

      // Q / E or Left / Right turn assist when not strafing
      const speedMult = this.isRunning || this.keys.has('shift') ? 8.8 : 5.4;
      const mag = Math.hypot(forward, strafe);
      if (mag > 0.05) {
        const nf = forward / Math.max(1, mag);
        const ns = strafe / Math.max(1, mag);
        const sinY = Math.sin(this.player.yaw);
        const cosY = Math.cos(this.player.yaw);

        const nextX = this.player.x + (-sinY * nf + cosY * ns) * speedMult * dt;
        const nextZ = this.player.z + (-cosY * nf - sinY * ns) * speedMult * dt;

        this.player.x = THREE.MathUtils.clamp(nextX, -38, 38);
        this.player.z = THREE.MathUtils.clamp(nextZ, -58, 48);
      }

      const headBob = mag > 0.1 ? Math.sin(t * (this.isRunning ? 12 : 8.5)) * 0.055 : 0;
      this.camera.position.set(this.player.x, 1.72 + headBob, this.player.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

      // Emit golden sparks from handheld Phuljhari
      if (this.stats.sparklerActive && Math.random() < 0.65) {
        this.sparklerTipLight.getWorldPosition(_vec3);
        this.spawnFireworkBurst(_vec3.x, _vec3.y, _vec3.z, 2, 0xffd875);
      }

      // Check proximity to interactables
      let closest: MelaInteractableSpec | null = null;
      let minDist = 11.5;
      for (const item of this.interactables) {
        const allowDist =
          item.type === 'wheel' ||
          item.type === 'well' ||
          item.type === 'finale' ||
          item.type === 'pirate-ship' ||
          item.type === 'temple'
            ? 13.5
            : 5.8;
        const d = Math.hypot(this.player.x - item.x, this.player.z - item.z);
        if (d < allowDist && d < minDist) {
          minDist = d;
          closest = item;
        }
      }
      if (closest?.id !== this.nearSpec?.id) {
        this.nearSpec = closest;
        this.callbacks.onNearChange(closest);
      }
      return;
    }

    if (this.mode === 'balloon' || this.mode === 'ring') {
      const spec = this.activeSpec!;
      const dist = 3.1;
      const camX = spec.x + Math.sin(spec.rotY) * dist;
      const camZ = spec.z + Math.cos(spec.rotY) * dist;
      this.camera.position.set(camX, 1.75, camZ);
      this.camera.lookAt(spec.x, 1.65, spec.z);
      return;
    }

    if (this.mode === 'diya-game') {
      const spec = this.activeSpec!;
      this.camera.position.set(spec.x, 4.8, spec.z + 5.8);
      this.camera.lookAt(spec.x, 0.9, spec.z);
      return;
    }

    if (this.mode === 'rangoli') {
      const spec = this.activeSpec!;
      // Overhead artist perspective looking down at the 3D Rangoli courtyard & 8 color bowls
      this.camera.position.set(spec.x, 5.5, spec.z + 3.0);
      this.camera.lookAt(spec.x, 0.15, spec.z - 0.15);
      return;
    }

    if (this.mode === 'temple-aarti') {
      const spec = this.activeSpec || { x: 0, z: -34 };
      // Grand Sanctum Darshan Camera framing both colossal Laxmi-Ganesh idols & the Golden Aarti Thali
      this.camera.position.set(spec.x + Math.sin(t * 0.35) * 0.45, 3.85, spec.z + 6.4);
      this.camera.lookAt(spec.x, 4.35, spec.z - 2.0);
      return;
    }

    if (this.mode === 'ride' && this.activeSpec) {
      this.rideTimer += dt;
      const progress = Math.min(1, this.rideTimer / this.rideDuration);
      this.callbacks.onRideProgress(progress, this.activeSpec.name);

      if (this.activeSpec.type === 'wheel' && this.ferrisGondolas.length > 0) {
        this.ferrisGondolas[0].getWorldPosition(_vec3);
        this.camera.position.set(_vec3.x, _vec3.y - 1.2, _vec3.z + 0.4);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(this.player.pitch - 0.15, this.player.yaw + 0.5, 0);
      } else if (this.activeSpec.type === 'carousel' && this.carouselHorses.length > 0) {
        this.carouselHorses[0].getWorldPosition(_vec3);
        this.camera.position.set(_vec3.x, _vec3.y + 0.95, _vec3.z);
        this.camera.lookAt(0, 2.2, -16);
      } else if (this.activeSpec.type === 'pirate-ship') {
        const swing = Math.sin(t * 1.45) * 0.62;
        this.camera.position.set(
          this.activeSpec.x,
          4.2 + Math.abs(Math.sin(swing)) * 2.5,
          this.activeSpec.z + Math.sin(swing) * 5.2
        );
        this.camera.lookAt(0, 4.0, -15);
      }

      if (progress >= 1) {
        this.audio.effect('cheer');
        this.callbacks.onToast(`${this.activeSpec.name.split('·')[0].trim()} completed! What a view!`);
        this.leaveActivity();
      }
      return;
    }

    if (this.mode === 'well' && this.activeSpec) {
      const w = this.wellState;
      w.timeLeft = Math.max(0, w.timeLeft - dt);

      if (w.spectator) {
        // Spectator view from the top rim looking down into the well
        this.camera.position.set(this.activeSpec.x, 8.2, this.activeSpec.z + 7.2);
        this.camera.lookAt(
          this.activeSpec.x + Math.cos(t * 3) * 3.5,
          3.2,
          this.activeSpec.z + Math.sin(t * 3) * 3.5
        );
      } else {
        // Playable Rider Mode on the vertical wooden wall!
        const keyVert =
          (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
          (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) +
          w.verticalInput;
        const boosting = w.boost || this.keys.has(' ');
        const angularSpeed = boosting ? 2.6 : 1.85;
        w.angle += angularSpeed * dt;
        w.height = THREE.MathUtils.clamp(w.height + keyVert * 3.4 * dt, 1.4, 5.8);

        const r = 6.35;
        const rx = this.activeSpec.x + Math.cos(w.angle) * r;
        const rz = this.activeSpec.z + Math.sin(w.angle) * r;
        this.camera.position.set(rx, w.height, rz);
        const lookAheadAngle = w.angle + 0.45;
        this.camera.lookAt(
          this.activeSpec.x + Math.cos(lookAheadAngle) * r,
          w.height,
          this.activeSpec.z + Math.sin(lookAheadAngle) * r
        );

        // Check ring pickups
        for (const ring of this.wellRings) {
          if (ring.collected) continue;
          const angleDiff = Math.abs(Math.atan2(Math.sin(w.angle - ring.angle), Math.cos(w.angle - ring.angle)));
          if (angleDiff < 0.25 && Math.abs(w.height - ring.height) < 0.85) {
            ring.collected = true;
            ring.mesh.visible = false;
            w.score++;
            this.audio.effect('ring-win');
          }
        }
      }

      if (this.gameState && this.gameState.mode === 'well') {
        this.gameState.shotsLeft = Math.ceil(w.timeLeft);
        this.gameState.score = w.score;
        if (w.timeLeft <= 0 && !this.gameState.done) {
          this.gameState.done = true;
          this.collectItem('Maut Ka Kuan Daredevil Badge');
          this.audio.effect('cheer');
          this.gameState.message = w.spectator
            ? 'Show complete! Try Rider Mode next to ride the vertical wall yourself!'
            : `Dhamakedar! You grabbed ${w.score}/8 Golden Rings on the vertical wall!`;
        }
        this.callbacks.onGameUpdate({ ...this.gameState });
      }
      return;
    }

    if (this.mode === 'stage' && this.activeSpec) {
      this.rideTimer += dt;
      const progress = Math.min(1, this.rideTimer / this.rideDuration);
      this.callbacks.onRideProgress(progress, 'Ayodhya Deepotsav & Ram Leela Stage');

      const dist = 7.8;
      const camX = this.activeSpec.x + Math.sin(this.activeSpec.rotY) * dist + Math.sin(t * 0.4) * 1.4;
      const camZ = this.activeSpec.z + Math.cos(this.activeSpec.rotY) * dist;
      this.camera.position.set(camX, 2.5, camZ);
      this.camera.lookAt(this.activeSpec.x, 2.8, this.activeSpec.z);

      if (Math.random() < 0.06) {
        this.spawnFireworkBurst(this.activeSpec.x + (Math.random() - 0.5) * 8, 9 + Math.random() * 4, this.activeSpec.z - 2, 30, 0xffd27d);
      }

      if (progress >= 1) {
        this.leaveActivity();
      }
      return;
    }

    if (this.mode === 'firework-show') {
      this.fireworkTimer += dt;
      const progress = Math.min(1, this.fireworkTimer / 14);
      this.callbacks.onRideProgress(progress, 'Roshni Ka Jashn · Sky Fireworks');

      this.camera.position.set(16, 3.2, -38);
      this.camera.lookAt(16 + Math.sin(t * 0.5) * 8, 16, -54);

      if (Math.random() < 0.16) {
        this.audio.effect('firework');
        this.spawnFireworkBurst(
          16 + (Math.random() - 0.5) * 32,
          12 + Math.random() * 16,
          -48 - Math.random() * 20,
          65
        );
      }

      if (progress >= 1) {
        this.leaveActivity();
      }
      return;
    }

    if (this.mode === 'finale') {
      this.finaleTimer += dt;
      const ft = this.finaleTimer;

      // Sweeping cinematic camera around the 20m Swarna Deep-Stambh at z = -62
      const camAngle = ft * 0.22;
      this.camera.position.set(Math.sin(camAngle) * 18, 6.5 + Math.min(8, ft * 0.45), -44 + Math.cos(camAngle) * 6);
      this.camera.lookAt(0, 12 + Math.min(6, ft * 0.35), -62);

      const newPhase =
        ft < 4.5
          ? 'phase1'
          : ft < 10.5
          ? 'phase2'
          : ft < 16.5
          ? 'phase3'
          : 'done';

      if (newPhase !== this.finalePhase) {
        this.finalePhase = newPhase;
        if (newPhase === 'phase1') {
          this.callbacks.onCinematic({
            title: 'तमसो मा ज्योतिर्गमय · Tamaso Ma Jyotirgamaya',
            text: 'Igniting the 20-meter Swarna Deep-Stambh at the heart of the Diwali Mela…',
            phase: 'phase1',
          });
          this.audio.effect('bell');
        } else if (newPhase === 'phase2') {
          this.callbacks.onCinematic({
            title: '1008 Akashdeep Sky Lantern Release',
            text: 'Hundreds of glowing golden Akashdeep lanterns rise together into the Diwali night sky…',
            phase: 'phase2',
          });
          this.audio.effect('cheer');
        } else if (newPhase === 'phase3') {
          this.callbacks.onCinematic({
            title: 'Shubh Deepavali · Grand Sky Symphony',
            text: 'May your year ahead be filled with warmth, light, and childhood joy!',
            phase: 'phase3',
          });
          this.audio.effect('firework');
        } else if (newPhase === 'done') {
          this.callbacks.onCinematic(null);
          this.leaveActivity();
          const dataUrl = this.captureSnapshotDataUrl();
          this.callbacks.onOpenPhotoCard(dataUrl);
          return;
        }
      }

      if (Math.random() < 0.22) {
        this.audio.effect('firework');
        this.spawnFireworkBurst(
          (Math.random() - 0.5) * 42,
          15 + Math.random() * 18,
          -48 - Math.random() * 18,
          75
        );
      }
    }
  }

  private updateParticlesAndLanterns(dt: number): void {
    const t = this.elapsed;

    // Ambient occasional distant firework in normal walk mode
    if ((this.mode === 'walk' || this.mode === 'welcome') && Math.random() < 0.018) {
      this.spawnFireworkBurst((Math.random() - 0.5) * 50, 18 + Math.random() * 14, -45 - Math.random() * 20, 40);
    }

    // Update Firework & Sparkler Particles
    const posAttr = this.fwGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.fwGeometry.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    let writeIdx = 0;
    for (let i = this.fwParticles.length - 1; i >= 0; i--) {
      const p = this.fwParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fwParticles.splice(i, 1);
        continue;
      }
      p.vy -= 4.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const fade = 1 - p.life / p.maxLife;
      posArr[writeIdx * 3] = p.x;
      posArr[writeIdx * 3 + 1] = p.y;
      posArr[writeIdx * 3 + 2] = p.z;
      colArr[writeIdx * 3] = p.r * fade;
      colArr[writeIdx * 3 + 1] = p.g * fade;
      colArr[writeIdx * 3 + 2] = p.b * fade;
      writeIdx++;
    }
    for (let j = writeIdx; j < this.maxFwParticles; j++) {
      posArr[j * 3 + 1] = -999;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update Floating Akashdeep Sky Lanterns
    const speedBoost = this.mode === 'finale' ? 3.2 : 1.0;
    for (let i = 0; i < this.maxLanterns; i++) {
      const l = this.lanterns[i];
      l.y += l.vy * speedBoost * dt;
      if (l.y > 72) {
        l.y = 8;
        l.x = (Math.random() - 0.5) * 90;
        l.z = -62 + Math.random() * 95;
      }
      const swayX = l.x + Math.sin(t * 0.7 + l.driftPhase) * 1.4;
      _quat.identity();
      _scale.set(l.scale, l.scale, l.scale);
      _mat4.compose(_vec3.set(swayX, l.y, l.z), _quat, _scale);
      this.lanternMesh.setMatrixAt(i, _mat4);
    }
    this.lanternMesh.instanceMatrix.needsUpdate = true;
  }

  // --- MELA CROWD VISITORS (ROAMING, SITTING & EATING, STANDING AT SHOPS) ---

  private createGreetingBubbleSprite(visitorName: string, greetingText: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    // Festive dark-maroon & gold pill speech bubble
    ctx.clearRect(0, 0, 512, 192);
    ctx.fillStyle = 'rgba(28, 12, 24, 0.94)';
    ctx.strokeStyle = '#ffbe42';
    ctx.lineWidth = 6;

    const r = 32;
    const bx = 16;
    const by = 14;
    const bw = 480;
    const bh = 134;

    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    // Speech pointer triangle at bottom center
    ctx.lineTo(276, by + bh);
    ctx.lineTo(256, by + bh + 28);
    ctx.lineTo(236, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Visitor Name & Happy Diwali headline
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd666';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`🪔 ${visitorName}: Happy Diwali! ✨`, 256, 62);

    ctx.fillStyle = '#fff5dc';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(greetingText, 256, 108);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 0.9, 1);
    sprite.renderOrder = 25;
    sprite.visible = false;
    return sprite;
  }

  private createVisitorCharacterMesh(opts: {
    outfitColor: number;
    secondaryColor: number;
    skinColor?: number;
    style: 'kurta' | 'saree' | 'child';
    hasTurban?: boolean;
    hasBalloon?: boolean;
    balloonColor?: number;
    hasSparkler?: boolean;
    hasFoodItem?: 'jalebi' | 'chaat' | 'chai';
    hasRifle?: boolean;
    hasTossRing?: boolean;
    sitting?: boolean;
    onRide?: boolean;
    name: string;
    greetingText: string;
  }): {
    group: THREE.Group;
    bodyGroup: THREE.Group;
    head: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    greetingSprite: THREE.Sprite;
  } {
    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    const isChild = opts.style === 'child';
    const scale = isChild ? 0.74 : 1.0;
    bodyGroup.scale.set(scale, scale, scale);

    const skinMat = new THREE.MeshStandardMaterial({
      color: opts.skinColor ?? 0xd99b72,
      roughness: 0.65,
    });
    const outfitMat = new THREE.MeshStandardMaterial({
      color: opts.outfitColor,
      roughness: 0.5,
      metalness: 0.12,
    });
    const secMat = new THREE.MeshStandardMaterial({
      color: opts.secondaryColor,
      roughness: 0.42,
      metalness: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc857,
      roughness: 0.3,
      metalness: 0.8,
    });
    const darkHairMat = new THREE.MeshStandardMaterial({
      color: 0x1b1210,
      roughness: 0.8,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x4a2511,
      roughness: 0.7,
    });

    // Legs (with pivot at hip y = 0.68 for walking or sitting)
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    leftLeg.position.set(-0.13, 0.68, 0);
    rightLeg.position.set(0.13, 0.68, 0);

    const legMat = opts.style === 'saree' ? outfitMat : secMat;
    const leftLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.64, 10), legMat);
    leftLegMesh.position.y = -0.32;
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24), shoeMat);
    leftShoe.position.set(0, -0.62, 0.04);
    leftLeg.add(leftLegMesh, leftShoe);

    const rightLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.64, 10), legMat);
    rightLegMesh.position.y = -0.32;
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24), shoeMat);
    rightShoe.position.set(0, -0.62, 0.04);
    rightLeg.add(rightLegMesh, rightShoe);

    if (opts.sitting) {
      leftLeg.rotation.x = -Math.PI / 2.2;
      rightLeg.rotation.x = -Math.PI / 2.2;
      bodyGroup.position.y = -0.26;
    }
    bodyGroup.add(leftLeg, rightLeg);

    // Torso (Kurta or Saree/Lehenga flare)
    if (opts.style === 'saree') {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.78, 14), outfitMat);
      skirt.position.y = 0.76;
      const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.44, 14), secMat);
      bodice.position.y = 1.24;
      // Golden saree pallu / dupatta drape
      const pallu = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), goldMat);
      pallu.position.set(0.02, 1.16, 0);
      pallu.rotation.z = 0.24;
      bodyGroup.add(skirt, bodice, pallu);
    } else {
      const kurta = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.82, 14), outfitMat);
      kurta.position.y = 1.02;
      // Festive Nehru vest / golden collar border
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12), goldMat);
      collar.position.y = 1.38;
      const stole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.68, 0.34), secMat);
      stole.position.set(0.12, 1.08, 0.02);
      bodyGroup.add(kurta, collar, stole);
    }

    // Head & Hair / Turban
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.66, 0);
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skinMat);
    headGroup.add(headSphere);

    // Eyes & Smile
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x160d08 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), eyeMat);
    leftEye.position.set(-0.07, 0.03, 0.19);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), eyeMat);
    rightEye.position.set(0.07, 0.03, 0.19);
    headGroup.add(leftEye, rightEye);

    // Red/Gold Bindi or Tilak on forehead
    const tilakMat = new THREE.MeshBasicMaterial({ color: 0xff2a4b });
    const tilak = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), tilakMat);
    tilak.position.set(0, 0.09, 0.2);
    headGroup.add(tilak);

    if (opts.hasTurban) {
      const turban = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.085, 10, 16), secMat);
      turban.rotation.x = Math.PI / 2 - 0.15;
      turban.position.y = 0.11;
      const kalgi = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), goldMat);
      kalgi.position.set(0, 0.24, 0.14);
      headGroup.add(turban, kalgi);
    } else {
      const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), darkHairMat);
      hairCap.position.y = 0.02;
      hairCap.rotation.x = -0.18;
      headGroup.add(hairCap);
      if (opts.style === 'saree') {
        // Festive hair bun with gajra flowers
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), darkHairMat);
        bun.position.set(0, 0.02, -0.22);
        const gajra = new THREE.Mesh(
          new THREE.TorusGeometry(0.095, 0.025, 8, 12),
          new THREE.MeshBasicMaterial({ color: 0xfff7d6 })
        );
        gajra.position.set(0, 0.02, -0.2);
        headGroup.add(bun, gajra);
      }
    }
    bodyGroup.add(headGroup);

    // Arms (pivot at shoulder y = 1.36)
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    leftArm.position.set(-0.29, 1.36, 0);
    rightArm.position.set(0.29, 1.36, 0);

    const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 10), outfitMat);
    leftArmMesh.position.y = -0.24;
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
    leftHand.position.y = -0.5;
    leftArm.add(leftArmMesh, leftHand);

    const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 10), outfitMat);
    rightArmMesh.position.y = -0.24;
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
    rightHand.position.y = -0.5;
    rightArm.add(rightArmMesh, rightHand);

    // Optional props held in hand
    if (opts.hasBalloon) {
      const stringMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.95, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff0cc })
      );
      stringMesh.position.set(0, 0.05, 0.12);
      const balloonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 12),
        new THREE.MeshStandardMaterial({
          color: opts.balloonColor ?? 0xff3b6b,
          roughness: 0.2,
          metalness: 0.1,
          emissive: opts.balloonColor ?? 0xff3b6b,
          emissiveIntensity: 0.25,
        })
      );
      balloonMesh.scale.y = 1.18;
      balloonMesh.position.set(0, 0.58, 0.12);
      leftArm.add(stringMesh, balloonMesh);
      leftArm.rotation.x = -0.55;
    }

    if (opts.hasSparkler) {
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6),
        new THREE.MeshBasicMaterial({ color: 0xdddddd })
      );
      wire.position.set(0, -0.55, 0.18);
      wire.rotation.x = Math.PI / 3;
      const sparkGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: 0xffe484,
          transparent: true,
          blending: THREE.AdditiveBlending,
        })
      );
      sparkGlow.scale.set(0.55, 0.55, 0.55);
      sparkGlow.position.set(0, -0.68, 0.35);
      rightArm.add(wire, sparkGlow);
      rightArm.rotation.x = -0.7;
    }

    if (opts.hasFoodItem) {
      if (opts.hasFoodItem === 'chai') {
        const kulhad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.04, 0.11, 10),
          new THREE.MeshStandardMaterial({ color: 0xb8532a, roughness: 0.8 })
        );
        kulhad.position.set(0, -0.52, 0.08);
        rightArm.add(kulhad);
      } else if (opts.hasFoodItem === 'jalebi') {
        const jalebiPiece = new THREE.Mesh(
          new THREE.TorusGeometry(0.05, 0.018, 8, 14),
          new THREE.MeshStandardMaterial({
            color: 0xff7b00,
            emissive: 0xff5500,
            emissiveIntensity: 0.3,
            roughness: 0.3,
          })
        );
        jalebiPiece.position.set(0, -0.52, 0.08);
        rightArm.add(jalebiPiece);
      } else {
        const chaatDona = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.04, 0.06, 10),
          new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.8 })
        );
        chaatDona.position.set(0, -0.52, 0.08);
        leftArm.add(chaatDona);
        leftArm.rotation.x = -0.75;
      }
    }

    if (opts.hasRifle) {
      // 3D Mela Air-Rifle (Wooden Stock + Brass Barrel) held aimed toward the balloon target board
      const rifleGroup = new THREE.Group();
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.12, 0.42),
        new THREE.MeshStandardMaterial({ color: 0x5c3018, roughness: 0.7 })
      );
      stock.position.set(0, -0.48, 0.18);
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.02, 0.65, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4a346, roughness: 0.3, metalness: 0.85 })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -0.45, 0.58);
      rifleGroup.add(stock, barrel);
      rightArm.add(rifleGroup);
      rightArm.rotation.x = -1.42;
      leftArm.rotation.x = -1.32;
      leftArm.rotation.y = 0.25;
    }

    if (opts.hasTossRing) {
      // Gleaming Golden Ring held in right hand for Swarna Challa Ring Toss game
      const ringProp = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.026, 8, 18), goldMat);
      ringProp.rotation.x = Math.PI / 2;
      ringProp.position.set(0, -0.54, 0.16);
      rightArm.add(ringProp);
      rightArm.rotation.x = -1.05;
    }

    bodyGroup.add(leftArm, rightArm);

    // Invisible click hitbox so tapping any person is effortless on mobile & desktop
    const hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 2.2, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.y = 1.05;
    group.add(hitbox);

    // Overhead Happy Diwali Speech Bubble Sprite (shown when clicked!)
    const greetingSprite = this.createGreetingBubbleSprite(opts.name, opts.greetingText);
    greetingSprite.position.set(0, 2.45 * scale, 0);
    group.add(greetingSprite);

    if (!opts.onRide) {
      this.addContactShadow(group, 1.15 * scale, 1.15 * scale);
    }

    return {
      group,
      bodyGroup,
      head: headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      greetingSprite,
    };
  }

  private buildMelaDiningTable(
    cx: number,
    cz: number,
    tableTitle: string,
    diners: {
      name: string;
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasTurban?: boolean;
      food: 'jalebi' | 'chaat' | 'chai';
      greetingText: string;
      voiceLine: string;
    }[]
  ): void {
    const tableGroup = new THREE.Group();
    tableGroup.position.set(cx, 0, cz);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3218, roughness: 0.78 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x9e1b32, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.35, metalness: 0.75 });
    const jalebiMat = new THREE.MeshStandardMaterial({
      color: 0xff7700,
      emissive: 0xff4400,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
    const clayMat = new THREE.MeshStandardMaterial({ color: 0xb85228, roughness: 0.75 });

    // Wooden Tabletop (2.4m wide x 1.1m deep)
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.15), woodMat);
    top.position.y = 0.78;
    const runner = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.11, 0.46), clothMat);
    runner.position.y = 0.785;
    tableGroup.add(top, runner);

    // 4 Table Legs
    for (const lx of [-1.05, 1.05]) {
      for (const lz of [-0.42, 0.42]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8), woodMat);
        leg.position.set(lx, 0.39, lz);
        tableGroup.add(leg);
      }
    }

    // 2 Wooden Benches (North & South sides of table)
    for (const bz of [-0.88, 0.88]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.42), woodMat);
      bench.position.set(0, 0.45, bz);
      const bLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), woodMat);
      bLeg1.position.set(-0.9, 0.225, bz);
      const bLeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), woodMat);
      bLeg2.position.set(0.9, 0.225, bz);
      tableGroup.add(bench, bLeg1, bLeg2);
    }

    // Centerpiece Clay Diya on table + 4 Brass Thalis of Jalebi, Samosa Chaat & Kulhad Chai
    const centerDiya = this.createClayDiyaMesh(0.55, true);
    centerDiya.group.position.set(0, 0.84, 0);
    tableGroup.add(centerDiya.group);
    this.flameMeshes.push(centerDiya.flame);

    const seatPositions = [
      { x: -0.62, z: -0.88, plateZ: -0.32, yaw: 0 },
      { x: 0.62, z: -0.88, plateZ: -0.32, yaw: 0 },
      { x: -0.62, z: 0.88, plateZ: 0.32, yaw: Math.PI },
      { x: 0.62, z: 0.88, plateZ: 0.32, yaw: Math.PI },
    ];

    for (let i = 0; i < Math.min(diners.length, 4); i++) {
      const seat = seatPositions[i];
      const dSpec = diners[i];

      // Brass plate (thali) with jalebis and kulhad on the tabletop in front of the diner
      const thali = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.03, 14), goldMat);
      thali.position.set(seat.x, 0.85, seat.plateZ);
      const jalebi1 = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 12), jalebiMat);
      jalebi1.rotation.x = Math.PI / 2;
      jalebi1.position.set(seat.x - 0.05, 0.88, seat.plateZ);
      const jalebi2 = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.016, 8, 12), jalebiMat);
      jalebi2.rotation.x = Math.PI / 2;
      jalebi2.position.set(seat.x + 0.06, 0.88, seat.plateZ + 0.03);
      const kulhad = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.1, 10), clayMat);
      kulhad.position.set(seat.x + 0.24, 0.89, seat.plateZ);
      tableGroup.add(thali, jalebi1, jalebi2, kulhad);

      // Seated Visitor Mesh
      const char = this.createVisitorCharacterMesh({
        outfitColor: dSpec.outfitColor,
        secondaryColor: dSpec.secondaryColor,
        style: dSpec.style,
        hasTurban: dSpec.hasTurban,
        hasFoodItem: dSpec.food,
        sitting: true,
        name: dSpec.name,
        greetingText: dSpec.greetingText,
      });
      char.group.position.set(cx + seat.x, 0, cz + seat.z);
      char.group.rotation.y = seat.yaw;
      this.dynamicRoot.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: 'sitting',
        name: dSpec.name,
        greetingText: dSpec.greetingText,
        voiceLine: dSpec.voiceLine,
        walkSpeed: 0,
        waypoints: [],
        currentWaypoint: 0,
        baseYaw: seat.yaw,
        phase: i * 1.7 + cx,
        waveTimer: 0,
      });
    }

    // Small festive table placard
    const signTex = createSignboardTexture(
      this.renderer,
      tableTitle,
      'Mithai & Chaat Sit-Out · Click Diners to Greet!',
      '#4a1222',
      '#ffcf66',
      '#fff6dc'
    );
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.36),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );

    signBoard.position.set(0, 1.38, 0);
    tableGroup.add(signBoard);

    this.addContactShadow(tableGroup, 3.2, 2.4);
    this.dynamicRoot.add(tableGroup);
  }

  private buildMelaCrowdsAndTables(): void {
    // 1. SITTING & EATING VISITORS (2 Festive Chaat & Jalebi Dining Tables with 8 Seated Diners)
    this.buildMelaDiningTable(-5.2, 24.2, 'गर्मा-गर्म जलेबी एवं चाट चौपाल', [
      {
        name: 'Sharma Ji',
        outfitColor: 0xd9531e,
        secondaryColor: 0xffe082,
        style: 'kurta',
        hasTurban: true,
        food: 'jalebi',
        greetingText: 'शुभ दीपावली! गर्मा-गर्म केसर जलेबी खाइए!',
        voiceLine: 'Happy Diwali! Shubh Deepavali! Aaiye garma garam kesar jalebi khaiye!',
      },
      {
        name: 'Sunita Aunty',
        outfitColor: 0xc2185b,
        secondaryColor: 0xffca28,
        style: 'saree',
        food: 'chai',
        greetingText: 'Happy Diwali Beta! Maa Lakshmi bless your home!',
        voiceLine: 'Happy Diwali beta! May Maa Lakshmi fill your home with happiness and prosperity!',
      },
      {
        name: 'Rohan',
        outfitColor: 0x1976d2,
        secondaryColor: 0xffb300,
        style: 'kurta',
        food: 'chaat',
        greetingText: 'Happy Diwali! Mela ki golgappa chaat lajawab hai!',
        voiceLine: 'Happy Diwali bro! The Banarasi chaat here at Diwali Mela is amazing!',
      },
      {
        name: 'Chintu',
        outfitColor: 0x00897b,
        secondaryColor: 0xffd54f,
        style: 'child',
        food: 'jalebi',
        greetingText: 'Happy Diwali! मुझे जलेबी और पटाखे बहुत पसंद हैं!',
        voiceLine: 'Happy Diwali! I love sweet jalebis and sparkling phuljharis!',
      },
    ]);

    this.buildMelaDiningTable(5.2, 12.2, 'बनारसी चाट एवं कुल्हड़ चाय बैठक', [
      {
        name: 'Verma Uncle',
        outfitColor: 0x6a1b9a,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        hasTurban: true,
        food: 'chai',
        greetingText: 'शुभ दीपावली! कुल्हड़ वाली मसाला चाय की बात ही अलग है!',
        voiceLine: 'Shubh Deepavali! Nothing beats hot kulhad masala chai at the Diwali Mela!',
      },
      {
        name: 'Meera Didi',
        outfitColor: 0xe64a19,
        secondaryColor: 0xfff176,
        style: 'saree',
        food: 'chaat',
        greetingText: 'Happy Diwali! आपको और आपके परिवार को ढेर सारी शुभकामनाएं!',
        voiceLine: 'Happy Diwali to you and your entire family! Have a bright and joyful festival!',
      },
      {
        name: 'Kabir',
        outfitColor: 0x2e7d32,
        secondaryColor: 0xffc107,
        style: 'kurta',
        food: 'jalebi',
        greetingText: 'Happy Diwali Dost! Mela ghoom ke maza aa gaya!',
        voiceLine: 'Happy Diwali my friend! Exploring this 3D Diwali Mela is so much fun!',
      },
      {
        name: 'Pinky',
        outfitColor: 0xd81b60,
        secondaryColor: 0xffe082,
        style: 'child',
        food: 'chai',
        greetingText: 'Happy Diwali! दीपावली की हार्दिक शुभकामनाएं! 🪔',
        voiceLine: 'Happy Diwali! Wishing you lots of sweets, diyas, and happiness!',
      },
    ]);

    // 2. STANDING IN FRONT OF SHOPS & ATTRACTIONS (12 Shoppers admiring stalls & chatting)
    const shopStanders: {
      name: string;
      x: number;
      z: number;
      yaw: number;
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasTurban?: boolean;
      hasBalloon?: boolean;
      balloonColor?: number;
      hasSparkler?: boolean;
      greetingText: string;
      voiceLine: string;
    }[] = [
      // Standing in front of Halwai Mithai Ghar (-10.5, 30)
      {
        name: 'Gupta Ji',
        x: -7.2,
        z: 30.8,
        yaw: -Math.PI / 2,
        outfitColor: 0xb71c1c,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'शुभ दीपावली! काजू कतली और लड्डू पैक करवा रहा हूँ!',
        voiceLine: 'Happy Diwali! Getting fresh Kaju Katli and Motichoor Laddoos for the family!',
      },
      {
        name: 'Neha',
        x: -7.0,
        z: 29.2,
        yaw: -Math.PI / 2 + 0.25,
        outfitColor: 0xad1457,
        secondaryColor: 0xffca28,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! मुंह मीठा कीजिए, त्योहार का दिन है!',
        voiceLine: 'Happy Diwali! Have some festive sweets, it is the festival of lights!',
      },
      // Standing in front of Kesar Jalebi Darbar (10.5, 30)
      {
        name: 'Rajesh Bhaiya',
        x: 7.2,
        z: 29.6,
        yaw: Math.PI / 2,
        outfitColor: 0x0d47a1,
        secondaryColor: 0xffb300,
        style: 'kurta',
        greetingText: 'Happy Diwali! चाशनी वाली कुरकुरी जलेबी की खुशबू लाजवाब है!',
        voiceLine: 'Happy Diwali! The aroma of hot saffron jalebis is irresistible!',
      },
      // Standing in front of Banarasi Chaat Corner (-10.5, 18)
      {
        name: 'Priya',
        x: -7.1,
        z: 18.4,
        yaw: -Math.PI / 2,
        outfitColor: 0x8e24aa,
        secondaryColor: 0xffe082,
        style: 'saree',
        greetingText: 'Happy Diwali! भैया थोड़े और तीखे गोलगप्पे खिलाना!',
        voiceLine: 'Happy Diwali! Wishing you a sparkling and delicious Deepavali celebration!',
      },
      // Standing in front of Khilona Sansar Toys (10.5, 18)
      {
        name: 'Aarav',
        x: 7.1,
        z: 18.6,
        yaw: Math.PI / 2,
        outfitColor: 0x00acc1,
        secondaryColor: 0xffd54f,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0xff4081,
        greetingText: 'Happy Diwali! देखो मेरे पास मेले का गुब्बारा है! 🎈',
        voiceLine: 'Happy Diwali! Look at my shiny mela balloon and toys!',
      },
      {
        name: 'Vikram',
        x: 7.3,
        z: 17.5,
        yaw: Math.PI / 2 - 0.2,
        outfitColor: 0xef6c00,
        secondaryColor: 0xfff59d,
        style: 'kurta',
        greetingText: 'शुभ दीपावली! बच्चों के लिए लकड़ी के खिलौने ले रहा हूँ!',
        voiceLine: 'Shubh Deepavali! Buying traditional wooden toys for the kids!',
      },
      // Standing near Terracotta Diya Craft (12, -26)
      {
        name: 'Kavita Ji',
        x: 8.6,
        z: -25.4,
        yaw: Math.PI / 2,
        outfitColor: 0xd84315,
        secondaryColor: 0xffcc80,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! मिट्टी के दीयों से घर आँगन जगमगाएगा!',
        voiceLine: 'Happy Diwali! Handcrafted clay diyas bring true warmth to every home!',
      },
      // Standing in front of Khilone & Phuljhari (-12, -26)
      {
        name: 'Chोटू & Papa',
        x: -8.6,
        z: -25.6,
        yaw: -Math.PI / 2,
        outfitColor: 0x283593,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasSparkler: true,
        greetingText: 'Happy Diwali! बच्चों के लिए फुलझड़ी और आकाश कंदील ले रहे हैं!',
        voiceLine: 'Happy Diwali! Buying golden sparklers and lanterns for the kids!',
      },
      // Cheering Friends watching Balloon Shooting Game at x: -24, z: 8
      {
        name: 'Kavya',
        x: -20.2,
        z: 6.3,
        yaw: -Math.PI / 2 - 0.3,
        outfitColor: 0xc2185b,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasBalloon: true,
        balloonColor: 0xff4081,
        greetingText: 'Happy Diwali! क्या निशाना लगाया है! एक और गुब्बारा फोड़ो!',
        voiceLine: 'Happy Diwali! What a great shot at the balloon target board!',
      },
      {
        name: 'Montu',
        x: -20.2,
        z: 9.7,
        yaw: -Math.PI / 2 + 0.3,
        outfitColor: 0x00897b,
        secondaryColor: 0xffd54f,
        style: 'child',
        hasSparkler: true,
        greetingText: 'Happy Diwali! भैया ने लगातार तीन गुब्बारे फोड़े! 🎯',
        voiceLine: 'Happy Diwali! Bhaiya popped three balloons in a row!',
      },
      // Cheering Friends watching Golden Ring Toss Stall at x: 24, z: 8
      {
        name: 'Tanya',
        x: 20.2,
        z: 6.3,
        yaw: Math.PI / 2 + 0.3,
        outfitColor: 0x8e24aa,
        secondaryColor: 0xffca28,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! वाह! सुनहरा छल्ला सीधा इनाम पर जा गिरा!',
        voiceLine: 'Happy Diwali! The golden ring landed right on the Diwali prize!',
      },
      {
        name: 'Bunty',
        x: 20.2,
        z: 9.7,
        yaw: Math.PI / 2 - 0.3,
        outfitColor: 0xf57c00,
        secondaryColor: 0xfff59d,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0x00e5ff,
        greetingText: 'Happy Diwali! अगला छल्ला मैं फेंकूँगा! 🪙',
        voiceLine: 'Happy Diwali! Next turn is mine at the Golden Ring Toss!',
      },
      // Crowd admiring & queuing at Chand Wala Jhoola (Giant Ferris Wheel at x: 28, z: -24)
      {
        name: 'Deepak Bhaiya',
        x: 21.8,
        z: -19.5,
        yaw: Math.PI * 0.72,
        outfitColor: 0x1565c0,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'शुभ दीपावली! चाँद वाले विशाल झूले से पूरा मेला जगमगाता दिखता है!',
        voiceLine: 'Shubh Deepavali! Look at everyone waving from the top of the Giant Ferris Wheel!',
      },
      {
        name: 'Sonal',
        x: 22.4,
        z: -21.2,
        yaw: Math.PI * 0.65,
        outfitColor: 0xd81b60,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! ऊपर झूले में बैठे लोग कितने खुश लग रहे हैं!',
        voiceLine: 'Happy Diwali! Everyone riding the Chand Wala Jhoola is having the time of their life!',
      },
      {
        name: 'Nikhil',
        x: 21.2,
        z: -25.8,
        yaw: Math.PI * 0.45,
        outfitColor: 0x2e7d32,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasBalloon: true,
        balloonColor: 0xffab00,
        greetingText: 'Happy Diwali! आओ हम भी बड़े झूले में बैठकर आसमान छूते हैं!',
        voiceLine: 'Happy Diwali! Come join the queue for the Giant Ferris Wheel!',
      },
      // Crowd admiring & waving at Ghode Wala Jhoola (Royal Carousel at x: -28, z: -16)
      {
        name: 'Shalini Aunty',
        x: -21.2,
        z: -13.4,
        yaw: -Math.PI * 0.62,
        outfitColor: 0xc2185b,
        secondaryColor: 0xffd54f,
        style: 'saree',
        greetingText: 'Happy Diwali! देखो बच्चे शाही घोड़े वाले झूले पर कितना आनंद ले रहे हैं!',
        voiceLine: 'Happy Diwali! Look how happy the kids are riding the Royal Carousel horses!',
      },
      {
        name: 'Manोज Ji',
        x: -21.5,
        z: -18.2,
        yaw: -Math.PI * 0.42,
        outfitColor: 0xe65100,
        secondaryColor: 0xfff59d,
        style: 'kurta',
        hasTurban: true,
        hasSparkler: true,
        greetingText: 'शुभ दीपावली! घोड़े वाले झूले की रोशनी और संगीत बचपन की याद दिलाता है!',
        voiceLine: 'Shubh Deepavali! The music and lights of the Carousel bring back childhood memories!',
      },
      // Crowd cheering at Mayur Samundari Jhoola (Peacock Pirate Ship at x: -28, z: -36)
      {
        name: 'Gaurav',
        x: -21.5,
        z: -33.2,
        yaw: -Math.PI * 0.65,
        outfitColor: 0x00695c,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasSparkler: true,
        greetingText: 'Happy Diwali! बाप रे! मयूर समुद्री झूला कितना ऊँचा जा रहा है!',
        voiceLine: 'Happy Diwali! Look how high that Peacock Pirate Ship swings into the night sky!',
      },
      {
        name: 'Preeti',
        x: -21.8,
        z: -38.4,
        yaw: -Math.PI * 0.35,
        outfitColor: 0xad1457,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasBalloon: true,
        balloonColor: 0x00e676,
        greetingText: 'शुभ दीपावली! नाव वाले झूले में बैठे लोग हाथ उठाकर शोर मचा रहे हैं!',
        voiceLine: 'Shubh Deepavali! Everyone on the swinging Peacock Ship is cheering with excitement!',
      },
      // Crowd outside Maut Ka Kuan (Well of Death at x: 28, z: -48)
      {
        name: 'Sardar Harpreet Ji',
        x: 19.8,
        z: -43.2,
        yaw: Math.PI * 0.72,
        outfitColor: 0xd32f2f,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'सत श्री अकाल और शुभ दीपावली! मौत के कुएँ में बाइक राइडर्स कमाल कर रहे हैं!',
        voiceLine: 'Happy Diwali! The motorcycle daredevils inside Maut Ka Kuan are unbelievable!',
      },
      {
        name: 'Tarun',
        x: 20.4,
        z: -46.8,
        yaw: Math.PI * 0.55,
        outfitColor: 0x1976d2,
        secondaryColor: 0xffe082,
        style: 'kurta',
        hasSparkler: true,
        greetingText: 'Happy Diwali! ऊपर गैलरी में खड़े होकर मौत का कुआँ देखने का मज़ा ही अलग है!',
        voiceLine: 'Happy Diwali! Watching the stunt bikes from the top balcony gallery is thrilling!',
      },
      // Standing near 7 Diyas Mandap & Seva Daan Peti (x: 2.8, z: -6.2)
      {
        name: 'Pandit Dinanath',
        x: 3.2,
        z: -6.2,
        yaw: -0.6,
        outfitColor: 0xff6f00,
        secondaryColor: 0xfff8e1,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'शुभ दीपावली! ७ शुभ दीप जलाएं और सेवा दान पेटी में पुण्य कमाएं!',
        voiceLine: 'Shubh Deepavali! May the seven auspicious diyas bring peace, health, and abundance to all!',
      },
      // Standing near Rangoli Aangan (x: -4.2, z: -6.2)
      {
        name: 'Divya',
        x: -4.2,
        z: -6.2,
        yaw: 0.7,
        outfitColor: 0x7b1fa2,
        secondaryColor: 0xffd54f,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! आओ मिलकर आँगन में सुंदर रंगोली सजाएं!',
        voiceLine: 'Happy Diwali! Come fill the floor Rangoli with vibrant festive colors!',
      },
      {
        name: 'Pallavi',
        x: -8.6,
        z: -7.8,
        yaw: Math.PI / 2,
        outfitColor: 0xe64a19,
        secondaryColor: 0xffe082,
        style: 'saree',
        greetingText: 'शुभ दीपावली! गुलाल के रंगों से अष्टदल कमल रंगोली कितनी सुंदर लग रही है!',
        voiceLine: 'Shubh Deepavali! The lotus Rangoli looks so vibrant with fresh gulal colors!',
      },
      // Audience watching Ram Leela Cultural Stage (x: -24, z: -50)
      {
        name: 'Dada Ji',
        x: -18.5,
        z: -44.0,
        yaw: Math.PI + 0.45,
        outfitColor: 0x8d6e63,
        secondaryColor: 0xffe082,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'जय श्री राम! शुभ दीपावली! अयोध्या में श्री राम के आगमन का उत्सव!',
        voiceLine: 'Jai Shri Ram! Shubh Deepavali! Rejoice in the grand return of Lord Rama!',
      },
      {
        name: 'Dadi Maa',
        x: -20.2,
        z: -43.4,
        yaw: Math.PI + 0.35,
        outfitColor: 0xc2185b,
        secondaryColor: 0xfff59d,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'शुभ दीपावली बेटा! राम लीला का राज्याभिषेक दृश्य बहुत पावन है!',
        voiceLine: 'Happy Diwali beta! Watching the Ram Leela performance fills the heart with devotion!',
      },
      // Standing at the stairs of Shri Laxmi-Ganesh Maha-Mandir (x: -3.5, z: -25.2)
      {
        name: 'Pandit Raghunath Ji',
        x: -3.5,
        z: -25.2,
        yaw: 0.25,
        outfitColor: 0xff6d00,
        secondaryColor: 0xfff8e1,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'जय श्री गणेश! जय माँ लक्ष्मी! भव्य मंदिर में पधारें और आरती थाली से महा-आरती करें!',
        voiceLine: 'Jai Shri Ganesh! Jai Maa Lakshmi! Step into the grand temple and perform Maha Aarti!',
      },
      {
        name: 'Bhakt Anjali',
        x: 3.5,
        z: -25.2,
        yaw: -0.25,
        outfitColor: 0xc2185b,
        secondaryColor: 0xffd54f,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'शुभ दीपावली! लक्ष्मी-गणेश जी की इतनी विशाल और सुंदर मूर्ति देखकर मन धन्य हो गया!',
        voiceLine: 'Shubh Deepavali! Having darshan of the grand Laxmi Ganesh idols feels so divine!',
      },
    ];

    for (let i = 0; i < shopStanders.length; i++) {
      const s = shopStanders[i];
      const char = this.createVisitorCharacterMesh({
        outfitColor: s.outfitColor,
        secondaryColor: s.secondaryColor,
        style: s.style,
        hasTurban: s.hasTurban,
        hasBalloon: s.hasBalloon,
        balloonColor: s.balloonColor,
        hasSparkler: s.hasSparkler,
        name: s.name,
        greetingText: s.greetingText,
      });
      char.group.position.set(s.x, 0, s.z);
      char.group.rotation.y = s.yaw;
      this.dynamicRoot.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: 'standing',
        name: s.name,
        greetingText: s.greetingText,
        voiceLine: s.voiceLine,
        walkSpeed: 0,
        waypoints: [],
        currentWaypoint: 0,
        baseYaw: s.yaw,
        phase: i * 1.3,
        waveTimer: 0,
      });
    }

    // 2B. ACTIVE GAME PLAYERS AT BALLOON SHOOT (-24, 8) & GOLDEN RING TOSS (24, 8)
    const activeGamePlayers: {
      name: string;
      x: number;
      z: number;
      yaw: number;
      role: 'playing-balloon' | 'playing-ring';
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasTurban?: boolean;
      hasRifle?: boolean;
      hasTossRing?: boolean;
      greetingText: string;
      voiceLine: string;
    }[] = [
      // Actively aiming & shooting balloons at Nishana Lagao (-24, 8, facing West toward -24)
      {
        name: 'Siddharth (Shooter)',
        x: -20.8,
        z: 7.35,
        yaw: -Math.PI / 2,
        role: 'playing-balloon',
        outfitColor: 0x1e88e5,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        hasRifle: true,
        greetingText: 'Happy Diwali! देखो मेरा निशाना—अभी लाल गुब्बारा फोड़ता हूँ! 🎯',
        voiceLine: 'Happy Diwali! Watch my aim at the Balloon Shooting stall—bullseye every time!',
      },
      {
        name: 'Aryan (Shooter)',
        x: -20.8,
        z: 8.65,
        yaw: -Math.PI / 2,
        role: 'playing-balloon',
        outfitColor: 0xd81b60,
        secondaryColor: 0xffe082,
        style: 'child',
        hasRifle: true,
        greetingText: 'Happy Diwali! गुब्बारे फोड़ने में बहुत मज़ा आ रहा है! 🎈',
        voiceLine: 'Happy Diwali! Playing the balloon shooting game at the mela is super exciting!',
      },
      // Actively tossing golden rings at Swarna Challa (24, 8, facing East toward 24)
      {
        name: 'Ananya (Ring Toss)',
        x: 20.8,
        z: 7.35,
        yaw: Math.PI / 2,
        role: 'playing-ring',
        outfitColor: 0xc2185b,
        secondaryColor: 0xffca28,
        style: 'saree',
        hasTossRing: true,
        greetingText: 'Happy Diwali! यह सुनहरा छल्ला सीधा दिवाली ट्रॉफी पर गिरेगा! 🪙',
        voiceLine: 'Happy Diwali! Watch me land this golden ring right on the center prize!',
      },
      {
        name: 'Harsh (Ring Toss)',
        x: 20.8,
        z: 8.65,
        yaw: Math.PI / 2,
        role: 'playing-ring',
        outfitColor: 0x00897b,
        secondaryColor: 0xffe082,
        style: 'kurta',
        hasTurban: true,
        hasTossRing: true,
        greetingText: 'शुभ दीपावली! छल्ला फेंकने का खेल तो मेले की जान है!',
        voiceLine: 'Shubh Deepavali! Golden Ring Toss is my favorite game in the entire Diwali Mela!',
      },
    ];

    for (let i = 0; i < activeGamePlayers.length; i++) {
      const p = activeGamePlayers[i];
      const char = this.createVisitorCharacterMesh({
        outfitColor: p.outfitColor,
        secondaryColor: p.secondaryColor,
        style: p.style,
        hasTurban: p.hasTurban,
        hasRifle: p.hasRifle,
        hasTossRing: p.hasTossRing,
        name: p.name,
        greetingText: p.greetingText,
      });
      char.group.position.set(p.x, 0, p.z);
      char.group.rotation.y = p.yaw;
      this.dynamicRoot.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: p.role,
        name: p.name,
        greetingText: p.greetingText,
        voiceLine: p.voiceLine,
        walkSpeed: 0,
        waypoints: [],
        currentWaypoint: 0,
        baseYaw: p.yaw,
        phase: i * 1.45,
        waveTimer: 0,
      });
    }

    // 2C. PASSENGERS ALREADY RIDING ALL JHOOLAS & SPECTATORS ON WELL OF DEATH BALCONY
    // (1) 8 Passengers riding inside the 8 Chand Wala Jhoola (Giant Ferris Wheel) Gondolas
    const ferrisRiderSpecs: {
      name: string;
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasTurban?: boolean;
      hasSparkler?: boolean;
      greetingText: string;
      voiceLine: string;
    }[] = [
      {
        name: 'Rahul (On Giant Wheel)',
        outfitColor: 0xe53935,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        hasSparkler: true,
        greetingText: 'Happy Diwali from the sky! ऊपर से पूरा मेला तारों जैसा चमक रहा है! 🎡',
        voiceLine: 'Happy Diwali from the top of the Giant Ferris Wheel! The entire mela glows like stars!',
      },
      {
        name: 'Sneha (On Giant Wheel)',
        outfitColor: 0xd81b60,
        secondaryColor: 0xffe082,
        style: 'saree',
        greetingText: 'शुभ दीपावली! चाँद वाले झूले पर बैठकर हवा में उड़ने जैसा लग रहा है!',
        voiceLine: 'Shubh Deepavali! Riding the Chand Wala Jhoola under the sky lanterns is magical!',
      },
      {
        name: 'Vihaan (On Giant Wheel)',
        outfitColor: 0x039be5,
        secondaryColor: 0xfff176,
        style: 'child',
        hasSparkler: true,
        greetingText: 'Happy Diwali! देखो मैं आकाशदीप के बिलकुल पास आ गया! ✨',
        voiceLine: 'Happy Diwali! I am high up in the Ferris Wheel right next to the floating sky lanterns!',
      },
      {
        name: 'Pankaj Ji (On Giant Wheel)',
        outfitColor: 0x6a1b9a,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasTurban: true,
        greetingText: 'शुभ दीपावली! यहाँ ऊपर से श्री लक्ष्मी-गणेश मंदिर का शिखर अद्भुत दिख रहा है!',
        voiceLine: 'Shubh Deepavali! The golden temple spire looks breathtaking from the Giant Wheel!',
      },
      {
        name: 'Kritika (On Giant Wheel)',
        outfitColor: 0xf4511e,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! मेले का सबसे शानदार झूला यही है! 🎡',
        voiceLine: 'Happy Diwali! Come take a spin on the Giant Ferris Wheel!',
      },
      {
        name: 'Yash (On Giant Wheel)',
        outfitColor: 0x00897b,
        secondaryColor: 0xffd54f,
        style: 'kurta',
        greetingText: 'Happy Diwali Dost! नीचे से हाथ हिलाओ, मैं ऊपर से देख रहा हूँ!',
        voiceLine: 'Happy Diwali my friend! Wave to us from down there!',
      },
      {
        name: 'Mitali (On Giant Wheel)',
        outfitColor: 0x8e24aa,
        secondaryColor: 0xfff59d,
        style: 'saree',
        greetingText: 'शुभ दीपावली! दीयों और आतिशबाज़ी का नज़ारा ऊपर से लाजवाब है!',
        voiceLine: 'Shubh Deepavali! Watching the fireworks from the Ferris Wheel is unforgettable!',
      },
      {
        name: 'Tinku (On Giant Wheel)',
        outfitColor: 0xfb8c00,
        secondaryColor: 0xffe082,
        style: 'child',
        hasSparkler: true,
        greetingText: 'Happy Diwali! यह झूला तो चाँद तक जाता है! 🌙',
        voiceLine: 'Happy Diwali! This Chand Wala Jhoola goes all the way to the moon!',
      },
    ];

    for (let i = 0; i < Math.min(this.ferrisGondolas.length, ferrisRiderSpecs.length); i++) {
      const gondola = this.ferrisGondolas[i];
      const rSpec = ferrisRiderSpecs[i];
      const char = this.createVisitorCharacterMesh({
        outfitColor: rSpec.outfitColor,
        secondaryColor: rSpec.secondaryColor,
        style: rSpec.style,
        hasTurban: rSpec.hasTurban,
        hasSparkler: rSpec.hasSparkler,
        onRide: true,
        name: rSpec.name,
        greetingText: rSpec.greetingText,
      });
      // Position inside the gondola basket so upper body & waving arms rise above the rim
      char.group.position.set(0, -2.05, 0.12);
      char.group.rotation.y = 0.35;
      gondola.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: 'riding-wheel',
        name: rSpec.name,
        greetingText: rSpec.greetingText,
        voiceLine: rSpec.voiceLine,
        walkSpeed: 0,
        waypoints: [],
        currentWaypoint: 0,
        baseYaw: 0.35,
        phase: i * 0.9,
        waveTimer: 0,
      });
    }

    // (2) 6 Riders mounted on the bobbing Ghode Wala Jhoola (Royal Carousel) Horses
    const carouselRiderSpecs: {
      horseIdx: number;
      name: string;
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasBalloon?: boolean;
      balloonColor?: number;
      hasSparkler?: boolean;
      greetingText: string;
      voiceLine: string;
    }[] = [
      {
        horseIdx: 1,
        name: 'Munni (On Carousel)',
        outfitColor: 0xd81b60,
        secondaryColor: 0xffe082,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0xff4081,
        greetingText: 'Happy Diwali! देखो मैं शाही घोड़े पर सवारी कर रही हूँ! 🎠',
        voiceLine: 'Happy Diwali! Look at me riding the golden carousel horse!',
      },
      {
        horseIdx: 2,
        name: 'Ishaan (On Carousel)',
        outfitColor: 0x1e88e5,
        secondaryColor: 0xffd54f,
        style: 'child',
        hasSparkler: true,
        greetingText: 'Happy Diwali! घोड़े वाला झूला गोल-गोल घूम रहा है! ✨',
        voiceLine: 'Happy Diwali! The Royal Carousel is spinning round and round!',
      },
      {
        horseIdx: 3,
        name: 'Nisha (On Carousel)',
        outfitColor: 0x8e24aa,
        secondaryColor: 0xffca28,
        style: 'saree',
        greetingText: 'शुभ दीपावली! बचपन की यादें ताज़ा हो गईं इस झूले पर बैठकर!',
        voiceLine: 'Shubh Deepavali! Riding the carousel brings back the sweetest childhood memories!',
      },
      {
        horseIdx: 5,
        name: 'Lucky (On Carousel)',
        outfitColor: 0x43a047,
        secondaryColor: 0xfff176,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0x00e5ff,
        greetingText: 'Happy Diwali! मेरा घोड़ा सबसे तेज़ दौड़ रहा है! 🐎',
        voiceLine: 'Happy Diwali! My carousel horse is galloping the fastest!',
      },
      {
        horseIdx: 6,
        name: 'Aditi (On Carousel)',
        outfitColor: 0xe64a19,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasSparkler: true,
        greetingText: 'Happy Diwali! आओ आप भी घोड़े वाले झूले पर एक चक्कर लगाओ!',
        voiceLine: 'Happy Diwali! Hop on a horse and take a spin on the Royal Carousel!',
      },
      {
        horseIdx: 7,
        name: 'Raju (On Carousel)',
        outfitColor: 0xfb8c00,
        secondaryColor: 0xfff59d,
        style: 'child',
        greetingText: 'शुभ दीपावली! मेले के झूले सबसे मज़ेदार हैं! 🎠',
        voiceLine: 'Shubh Deepavali! The Diwali Mela rides are the best in the world!',
      },
    ];

    for (let i = 0; i < carouselRiderSpecs.length; i++) {
      const cSpec = carouselRiderSpecs[i];
      const horse = this.carouselHorses[cSpec.horseIdx];
      if (!horse) continue;

      const char = this.createVisitorCharacterMesh({
        outfitColor: cSpec.outfitColor,
        secondaryColor: cSpec.secondaryColor,
        style: cSpec.style,
        hasBalloon: cSpec.hasBalloon,
        balloonColor: cSpec.balloonColor,
        hasSparkler: cSpec.hasSparkler,
        sitting: true,
        onRide: true,
        name: cSpec.name,
        greetingText: cSpec.greetingText,
      });
      // Sit astride the horse saddle facing +Z (direction of the horse's neck)
      char.group.position.set(0, -0.1, -0.04);
      char.group.rotation.y = 0;
      char.leftLeg.rotation.z = -0.36;
      char.rightLeg.rotation.z = 0.36;
      horse.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: 'riding-carousel',
        name: cSpec.name,
        greetingText: cSpec.greetingText,
        voiceLine: cSpec.voiceLine,
        walkSpeed: 0,
        waypoints: [],
        currentWaypoint: 0,
        baseYaw: 0,
        phase: i * 1.2,
        waveTimer: 0,
      });
    }

    // (3) 6 Thrilled Passengers seated inside the swinging Mayur Samundari Jhoola (Peacock Ship)
    if (this.pirateShipHull) {
      const shipRiderSpecs: {
        x: number;
        z: number;
        yaw: number;
        name: string;
        outfitColor: number;
        secondaryColor: number;
        style: 'kurta' | 'saree' | 'child';
        hasTurban?: boolean;
        greetingText: string;
        voiceLine: string;
      }[] = [
        {
          x: -0.52,
          z: -1.75,
          yaw: 0,
          name: 'Varun (On Peacock Ship)',
          outfitColor: 0xd32f2f,
          secondaryColor: 0xffd54f,
          style: 'kurta',
          hasTurban: true,
          greetingText: 'Happy Diwali! वूहू! मयूर कश्ती आसमान छू रही है! ⛵',
          voiceLine: 'Woohoo! Happy Diwali! The Peacock Pirate Ship is swinging so high!',
        },
        {
          x: 0.52,
          z: -1.75,
          yaw: 0,
          name: 'Megha (On Peacock Ship)',
          outfitColor: 0xc2185b,
          secondaryColor: 0xffe082,
          style: 'saree',
          greetingText: 'शुभ दीपावली! पेट में गुदगुदी हो रही है इस समुद्री झूले में!',
          voiceLine: 'Shubh Deepavali! What a thrilling ride on the Mayur Samundari Jhoola!',
        },
        {
          x: -0.52,
          z: 0,
          yaw: 0,
          name: 'Kunal (On Peacock Ship)',
          outfitColor: 0x1976d2,
          secondaryColor: 0xffca28,
          style: 'kurta',
          greetingText: 'Happy Diwali! दोनों हाथ ऊपर करके झूला झूलने का मज़ा ही कुछ और है!',
          voiceLine: 'Happy Diwali! Put your hands up in the air on the swinging ship!',
        },
        {
          x: 0.52,
          z: 0,
          yaw: 0,
          name: 'Payal (On Peacock Ship)',
          outfitColor: 0x7b1fa2,
          secondaryColor: 0xfff176,
          style: 'saree',
          greetingText: 'Happy Diwali! यह झूला तो हवा से बातें कर रहा है! ✨',
          voiceLine: 'Happy Diwali! This Peacock Ship ride feels like flying through the night sky!',
        },
        {
          x: -0.52,
          z: 1.75,
          yaw: Math.PI,
          name: 'Sोनू (On Peacock Ship)',
          outfitColor: 0x00897b,
          secondaryColor: 0xffd54f,
          style: 'child',
          greetingText: 'Happy Diwali! एक और तेज़ झोंका आने वाला है! ⛵',
          voiceLine: 'Happy Diwali! Here comes another giant swing!',
        },
        {
          x: 0.52,
          z: 1.75,
          yaw: Math.PI,
          name: 'Monu (On Peacock Ship)',
          outfitColor: 0xf57c00,
          secondaryColor: 0xffe082,
          style: 'child',
          greetingText: 'शुभ दीपावली! मयूर झूला सबसे रोमांचक है!',
          voiceLine: 'Shubh Deepavali! The Peacock Ship is the most thrilling ride in the mela!',
        },
      ];

      for (let i = 0; i < shipRiderSpecs.length; i++) {
        const sSpec = shipRiderSpecs[i];
        const char = this.createVisitorCharacterMesh({
          outfitColor: sSpec.outfitColor,
          secondaryColor: sSpec.secondaryColor,
          style: sSpec.style,
          hasTurban: sSpec.hasTurban,
          sitting: true,
          onRide: true,
          name: sSpec.name,
          greetingText: sSpec.greetingText,
        });
        char.group.position.set(sSpec.x, 0.16, sSpec.z);
        char.group.rotation.y = sSpec.yaw;
        this.pirateShipHull.add(char.group);

        this.crowdVisitors.push({
          ...char,
          role: 'riding-ship',
          name: sSpec.name,
          greetingText: sSpec.greetingText,
          voiceLine: sSpec.voiceLine,
          walkSpeed: 0,
          waypoints: [],
          currentWaypoint: 0,
          baseYaw: sSpec.yaw,
          phase: i * 0.85,
          waveTimer: 0,
        });
      }
    }

    // (4) 8 Excited Spectators on the Top Balcony Gallery of Maut Ka Kuan (Well of Death, y = 7.0m)
    if (this.wellRoot) {
      const wellGallerySpecs: {
        angle: number;
        name: string;
        outfitColor: number;
        secondaryColor: number;
        style: 'kurta' | 'saree' | 'child';
        hasTurban?: boolean;
        hasSparkler?: boolean;
        greetingText: string;
        voiceLine: string;
      }[] = [
        {
          angle: 0.3,
          name: 'Rakesh (Well Gallery)',
          outfitColor: 0xc62828,
          secondaryColor: 0xffd54f,
          style: 'kurta',
          hasTurban: true,
          greetingText: 'Happy Diwali! अरे वाह! खड़ी दीवार पर दो-दो बाइक एक साथ दौड़ रही हैं! 🏍️',
          voiceLine: 'Happy Diwali! Look down inside Maut Ka Kuan—two motorcycles racing on the vertical wall!',
        },
        {
          angle: 1.05,
          name: 'Sunil (Well Gallery)',
          outfitColor: 0x1565c0,
          secondaryColor: 0xffe082,
          style: 'kurta',
          hasSparkler: true,
          greetingText: 'शुभ दीपावली! मौत के कुएँ के स्टंट देखकर रोंगटे खड़े हो गए!',
          voiceLine: 'Shubh Deepavali! Watching these daredevil bike stunts from the top balcony is awesome!',
        },
        {
          angle: 1.85,
          name: 'Geeta (Well Gallery)',
          outfitColor: 0xad1457,
          secondaryColor: 0xffca28,
          style: 'saree',
          greetingText: 'Happy Diwali! बाइक की रफ़्तार से पूरा लकड़ी का कुआँ काँप रहा है!',
          voiceLine: 'Happy Diwali! You can feel the whole wooden cylinder rumble as the bikes zoom past!',
        },
        {
          angle: 2.65,
          name: 'Jatin (Well Gallery)',
          outfitColor: 0x2e7d32,
          secondaryColor: 0xfff176,
          style: 'kurta',
          hasTurban: true,
          greetingText: 'शुभ दीपावली! क्या गज़ब का संतुलन है इन स्टंट राइडर्स का!',
          voiceLine: 'Shubh Deepavali! Salute to the fearless stunt riders of the Diwali Mela!',
        },
        {
          angle: 3.45,
          name: 'Rekha (Well Gallery)',
          outfitColor: 0x6a1b9a,
          secondaryColor: 0xffd54f,
          style: 'saree',
          hasSparkler: true,
          greetingText: 'Happy Diwali! ऊपर बालकनी से पूरा कुआँ साफ़ दिखाई देता है!',
          voiceLine: 'Happy Diwali! The view from the top gallery of the Well of Death is incredible!',
        },
        {
          angle: 4.25,
          name: 'Abhishek (Well Gallery)',
          outfitColor: 0xef6c00,
          secondaryColor: 0xffe082,
          style: 'kurta',
          greetingText: 'Happy Diwali Bhai! अगली बारी में मैं खुद बाइक चलाकर सुनहरे छल्ले पकड़ूँगा!',
          voiceLine: 'Happy Diwali bro! Next round I am going to ride the wall myself and grab the golden rings!',
        },
        {
          angle: 5.05,
          name: 'Komal (Well Gallery)',
          outfitColor: 0xd81b60,
          secondaryColor: 0xfff59d,
          style: 'saree',
          greetingText: 'शुभ दीपावली! मेले में मौत का कुआँ देखे बिना जाना अधूरा है!',
          voiceLine: 'Shubh Deepavali! Maut Ka Kuan is the biggest crowd puller at the fair!',
        },
        {
          angle: 5.8,
          name: 'Chintu (Well Gallery)',
          outfitColor: 0x00838f,
          secondaryColor: 0xffd54f,
          style: 'child',
          hasSparkler: true,
          greetingText: 'Happy Diwali! देखो लाल और पीली बाइक कितनी तेज़ घूम रही हैं! 🏍️',
          voiceLine: 'Happy Diwali! Look how fast the red and yellow stunt bikes are zooming!',
        },
      ];

      const galleryR = 8.25;
      for (let i = 0; i < wellGallerySpecs.length; i++) {
        const wSpec = wellGallerySpecs[i];
        const gx = Math.cos(wSpec.angle) * galleryR;
        const gz = Math.sin(wSpec.angle) * galleryR;
        // Face inward toward the center of the Well (0, 0)
        const inwardYaw = Math.atan2(-gx, -gz);

        const char = this.createVisitorCharacterMesh({
          outfitColor: wSpec.outfitColor,
          secondaryColor: wSpec.secondaryColor,
          style: wSpec.style,
          hasTurban: wSpec.hasTurban,
          hasSparkler: wSpec.hasSparkler,
          onRide: true,
          name: wSpec.name,
          greetingText: wSpec.greetingText,
        });
        char.group.position.set(gx, 7.0, gz);
        char.group.rotation.y = inwardYaw;
        this.wellRoot.add(char.group);

        this.crowdVisitors.push({
          ...char,
          role: 'well-spectator',
          name: wSpec.name,
          greetingText: wSpec.greetingText,
          voiceLine: wSpec.voiceLine,
          walkSpeed: 0,
          waypoints: [],
          currentWaypoint: 0,
          baseYaw: inwardYaw,
          phase: i * 1.1,
          waveTimer: 0,
        });
      }
    }

    // 3. ROAMING MELA CROWDS (12 Visitors strolling along the bazaar lanes & fairground)
    const roamers: {
      name: string;
      outfitColor: number;
      secondaryColor: number;
      style: 'kurta' | 'saree' | 'child';
      hasTurban?: boolean;
      hasBalloon?: boolean;
      balloonColor?: number;
      hasSparkler?: boolean;
      walkSpeed: number;
      waypoints: { x: number; z: number }[];
      greetingText: string;
      voiceLine: string;
    }[] = [
      {
        name: 'Arjun',
        outfitColor: 0xd32f2f,
        secondaryColor: 0xffe082,
        style: 'kurta',
        hasSparkler: true,
        walkSpeed: 1.55,
        waypoints: [
          { x: -2.2, z: 36 },
          { x: -2.2, z: 14 },
          { x: -1.8, z: -4 },
          { x: -2.2, z: 14 },
        ],
        greetingText: 'Happy Diwali! मेला चलोगे मेरे साथ? क्या नज़ारा है!',
        voiceLine: 'Happy Diwali! Welcome to the Diwali Mela, look how bright the lights are tonight!',
      },
      {
        name: 'Pooja',
        outfitColor: 0xc2185b,
        secondaryColor: 0xffd54f,
        style: 'saree',
        hasSparkler: true,
        walkSpeed: 1.5,
        waypoints: [
          { x: -1.3, z: 35 },
          { x: -1.3, z: 13 },
          { x: -1.0, z: -5 },
          { x: -1.3, z: 13 },
        ],
        greetingText: 'शुभ दीपावली! दीपों का यह पावन पर्व आपके जीवन में खुशियां लाए!',
        voiceLine: 'Shubh Deepavali! May this festival of lights bring endless joy to your life!',
      },
      {
        name: 'Karan',
        outfitColor: 0x1565c0,
        secondaryColor: 0xffca28,
        style: 'kurta',
        hasTurban: true,
        walkSpeed: 1.7,
        waypoints: [
          { x: 2.1, z: -2 },
          { x: 2.1, z: 22 },
          { x: 2.4, z: 38 },
          { x: 2.1, z: 22 },
        ],
        greetingText: 'Happy Diwali! आकाशदीप और आतिशबाज़ी देखकर दिल खुश हो गया!',
        voiceLine: 'Happy Diwali! Watching the sky lanterns and fireworks is pure magic!',
      },
      {
        name: 'Riya',
        outfitColor: 0x6a1b9a,
        secondaryColor: 0xffe082,
        style: 'saree',
        hasBalloon: true,
        balloonColor: 0x00e5ff,
        walkSpeed: 1.65,
        waypoints: [
          { x: 1.2, z: -3 },
          { x: 1.2, z: 21 },
          { x: 1.5, z: 37 },
          { x: 1.2, z: 21 },
        ],
        greetingText: 'Happy Diwali! चलो बड़ा झूला और मौत का कुआँ देखने चलते हैं!',
        voiceLine: 'Happy Diwali! Let us go ride the giant Ferris Wheel and watch the fireworks!',
      },
      {
        name: 'Golu',
        outfitColor: 0x2e7d32,
        secondaryColor: 0xfff176,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0xff5252,
        hasSparkler: true,
        walkSpeed: 1.95,
        waypoints: [
          { x: 0.2, z: 28 },
          { x: 0.4, z: 8 },
          { x: -0.4, z: -12 },
          { x: 0.4, z: 8 },
        ],
        greetingText: 'Happy Diwali! मेरी फुलझड़ी देखो कितनी तेज़ चमक रही है! ✨',
        voiceLine: 'Happy Diwali! Look how brightly my golden phuljhari sparkler is shining!',
      },
      {
        name: 'Bittu',
        outfitColor: 0xf57c00,
        secondaryColor: 0xffe082,
        style: 'child',
        hasBalloon: true,
        balloonColor: 0xffea00,
        walkSpeed: 1.85,
        waypoints: [
          { x: -3.2, z: 2 },
          { x: 3.2, z: 2 },
          { x: 3.2, z: -16 },
          { x: -3.2, z: -16 },
        ],
        greetingText: 'शुभ दीपावली! हैप्पी दिवाली! चलो मेले में झूला झूलें!',
        voiceLine: 'Happy Diwali! Come ride the Royal Peacock Carousel with us!',
      },
      {
        name: 'Chacha Chaudhary',
        outfitColor: 0xb71c1c,
        secondaryColor: 0xffffff,
        style: 'kurta',
        hasTurban: true,
        walkSpeed: 1.35,
        waypoints: [
          { x: -8.5, z: -14 },
          { x: 8.5, z: -14 },
          { x: 8.5, z: -26 },
          { x: -8.5, z: -26 },
        ],
        greetingText: 'शुभ दीपावली! जगमग मेले की रौनक ही निराली है!',
        voiceLine: 'Shubh Deepavali! There is nothing quite like the warmth of an Indian Diwali Mela!',
      },
      {
        name: 'Radhika',
        outfitColor: 0xd81b60,
        secondaryColor: 0xffd54f,
        style: 'saree',
        hasSparkler: true,
        walkSpeed: 1.5,
        waypoints: [
          { x: 8.0, z: -25 },
          { x: -8.0, z: -25 },
          { x: -8.0, z: -15 },
          { x: 8.0, z: -15 },
        ],
        greetingText: 'Happy Diwali! हर घर में उजाला हो, हर दिल में खुशी हो!',
        voiceLine: 'Happy Diwali! May every home glow with diyas and every heart be filled with joy!',
      },
      {
        name: 'Manish',
        outfitColor: 0x00695c,
        secondaryColor: 0xffe082,
        style: 'kurta',
        walkSpeed: 1.6,
        waypoints: [
          { x: -14, z: -18 },
          { x: -6, z: -24.2 },
          { x: 6, z: -24.2 },
          { x: 14, z: -18 },
        ],
        greetingText: 'Happy Diwali! श्री लक्ष्मी-गणेश महा-मंदिर में आरती ज़रूर करना!',
        voiceLine: 'Happy Diwali! Make sure you visit the grand Laxmi Ganesh Temple and perform Aarti!',
      },
      {
        name: 'Simran',
        outfitColor: 0xe65100,
        secondaryColor: 0xfff59d,
        style: 'saree',
        hasBalloon: true,
        balloonColor: 0xe040fb,
        walkSpeed: 1.55,
        waypoints: [
          { x: 14, z: -19 },
          { x: 6, z: -24.8 },
          { x: -6, z: -24.8 },
          { x: -14, z: -19 },
        ],
        greetingText: 'शुभ दीपावली! सेल्फी तोरण पर फोटो पोस्टकार्ड बनाना मत भूलना!',
        voiceLine: 'Shubh Deepavali! Do not forget to take a festive Diwali postcard at the selfie booth!',
      },
    ];

    for (let i = 0; i < roamers.length; i++) {
      const r = roamers[i];
      const startWp = r.waypoints[0];
      const nextWp = r.waypoints[1 % r.waypoints.length];
      const initialYaw = Math.atan2(nextWp.x - startWp.x, nextWp.z - startWp.z);

      const char = this.createVisitorCharacterMesh({
        outfitColor: r.outfitColor,
        secondaryColor: r.secondaryColor,
        style: r.style,
        hasTurban: r.hasTurban,
        hasBalloon: r.hasBalloon,
        balloonColor: r.balloonColor,
        hasSparkler: r.hasSparkler,
        name: r.name,
        greetingText: r.greetingText,
      });
      char.group.position.set(startWp.x, 0, startWp.z);
      char.group.rotation.y = initialYaw;
      this.dynamicRoot.add(char.group);

      this.crowdVisitors.push({
        ...char,
        role: 'roaming',
        name: r.name,
        greetingText: r.greetingText,
        voiceLine: r.voiceLine,
        walkSpeed: r.walkSpeed,
        waypoints: r.waypoints,
        currentWaypoint: 1 % r.waypoints.length,
        baseYaw: initialYaw,
        phase: i * 1.9,
        waveTimer: 0,
      });
    }
  }

  private checkCrowdClick(clientX: number, clientY: number): boolean {
    if (this.crowdVisitors.length === 0) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const groups = this.crowdVisitors.map((v) => v.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    if (hits.length > 0 && hits[0].distance < 42) {
      const hitObj = hits[0].object;
      const visitor = this.crowdVisitors.find((v) => {
        let curr: THREE.Object3D | null = hitObj;
        while (curr) {
          if (curr === v.group) return true;
          curr = curr.parent;
        }
        return false;
      });

      if (visitor) {
        // Trigger festive Happy Diwali greeting!
        visitor.waveTimer = 4.5;
        visitor.greetingSprite.visible = true;

        // If standing or roaming on ground, turn warmly toward the player
        if (visitor.role === 'standing' || visitor.role === 'roaming') {
          const dx = this.camera.position.x - visitor.group.position.x;
          const dz = this.camera.position.z - visitor.group.position.z;
          visitor.group.rotation.y = Math.atan2(dx, dz);
        }

        // Get true world position (works even for passengers high up on Ferris Wheel, Carousel, or Pirate Ship!)
        visitor.group.getWorldPosition(_vec3);
        this.spawnFireworkBurst(
          _vec3.x,
          _vec3.y + 2.1,
          _vec3.z,
          28,
          0xffd269
        );
        this.audio.effect('sparkle');
        this.audio.speak(visitor.voiceLine);
        this.callbacks.onToast(`🪔 ${visitor.name}: "${visitor.greetingText}"`);
        return true;

      }
    }
    return false;
  }

  private updateCrowdAnimations(dt: number): void {
    const t = this.elapsed;

    // Ambient NPC Balloon Shoot spark bursts & NPC Ring Toss flight when player is walking around
    if (this.mode !== 'balloon') {
      this.npcBalloonSparkTimer += dt;
      if (this.npcBalloonSparkTimer > 2.6) {
        this.npcBalloonSparkTimer = 0;
        const randomRow = Math.floor(Math.random() * 3);
        const randomCol = Math.floor(Math.random() * 3) - 1;
        this.spawnFireworkBurst(
          -24.2,
          1.55 + randomRow * 0.48,
          8.0 + randomCol * 0.95,
          18,
          0xff4d6d
        );
      }
    }

    if (this.npcRingMesh) {
      if (this.mode === 'ring') {
        this.npcRingMesh.visible = false;
      } else {
        this.npcRingMesh.visible = true;
        const cycle = (t * 0.65) % 1;
        const startX = 20.9;
        const endX = 23.65;
        const startZ = 7.35;
        const endZ = 8.0 + Math.sin(Math.floor(t * 0.65) * 2.1) * 0.85;
        this.npcRingMesh.position.set(
          THREE.MathUtils.lerp(startX, endX, cycle),
          1.25 + Math.sin(cycle * Math.PI) * 1.15,
          THREE.MathUtils.lerp(startZ, endZ, cycle)
        );
        this.npcRingMesh.rotation.z = cycle * Math.PI * 2;
      }
    }

    for (let i = 0; i < this.crowdVisitors.length; i++) {
      const v = this.crowdVisitors[i];

      // Handle active "Happy Diwali!" greeting wave & overhead bubble
      if (v.waveTimer > 0) {
        v.waveTimer = Math.max(0, v.waveTimer - dt);
        v.greetingSprite.visible = true;
        const popScale = Math.min(1, (4.5 - v.waveTimer) * 6);
        const pulse = 1 + Math.sin(t * 7) * 0.05;
        v.greetingSprite.scale.set(2.4 * popScale * pulse, 0.9 * popScale * pulse, 1);

        // Enthusiastic Happy Diwali wave with right arm raised high
        v.rightArm.rotation.x = -2.45 + Math.sin(t * 12) * 0.35;
        v.rightArm.rotation.z = -0.25 + Math.cos(t * 12) * 0.28;
        v.leftArm.rotation.x = -0.6 + Math.sin(t * 6) * 0.15;
        v.head.rotation.y = Math.sin(t * 5) * 0.18;

        if (v.waveTimer <= 0) {
          v.greetingSprite.visible = false;
          v.rightArm.rotation.set(0, 0, 0);
          v.leftArm.rotation.set(0, 0, 0);
          if (v.role === 'standing') {
            v.group.rotation.y = v.baseYaw;
          }
        }
        continue;
      }

      if (v.role === 'roaming' && v.waypoints.length > 1) {
        const target = v.waypoints[v.currentWaypoint];
        const dx = target.x - v.group.position.x;
        const dz = target.z - v.group.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.35) {
          v.currentWaypoint = (v.currentWaypoint + 1) % v.waypoints.length;
        } else {
          const step = Math.min(dist, v.walkSpeed * dt);
          v.group.position.x += (dx / dist) * step;
          v.group.position.z += (dz / dist) * step;

          const desiredYaw = Math.atan2(dx, dz);
          // Smooth rotation toward walking direction
          let diff = desiredYaw - v.group.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          v.group.rotation.y += diff * Math.min(1, dt * 6);
        }

        // Walking stride leg & arm swing
        const walkCycle = t * v.walkSpeed * 4.2 + v.phase;
        v.leftLeg.rotation.x = Math.sin(walkCycle) * 0.48;
        v.rightLeg.rotation.x = -Math.sin(walkCycle) * 0.48;
        v.leftArm.rotation.x = -Math.sin(walkCycle) * 0.36;
        v.rightArm.rotation.x = Math.sin(walkCycle) * 0.36;
        v.bodyGroup.position.y = Math.abs(Math.sin(walkCycle)) * 0.045;
        v.head.rotation.y = Math.sin(t * 1.6 + v.phase) * 0.14;
      } else if (v.role === 'sitting') {
        // Seated diners eating jalebi / chaat / sipping kulhad chai and chatting across the table
        const eatCycle = Math.sin(t * 2.1 + v.phase);
        if (eatCycle > 0.2) {
          // Bring right hand food/chai toward mouth
          const lift = (eatCycle - 0.2) / 0.8;
          v.rightArm.rotation.x = -0.6 - lift * 1.15;
          v.rightArm.rotation.z = -lift * 0.35;
          v.head.rotation.x = lift * 0.15;
        } else {
          v.rightArm.rotation.x = -0.55;
          v.rightArm.rotation.z = 0;
          v.head.rotation.x = 0;
        }
        v.head.rotation.y = Math.sin(t * 1.5 + v.phase) * 0.22;
      } else if (v.role === 'riding-wheel') {
        // Passengers inside Ferris Wheel gondolas looking out over the Mela and waving happily
        v.head.rotation.y = Math.sin(t * 1.6 + v.phase) * 0.38;
        v.rightArm.rotation.x = -2.15 + Math.sin(t * 5.2 + v.phase) * 0.32;
        v.rightArm.rotation.z = -0.22 + Math.cos(t * 5.2 + v.phase) * 0.22;
        v.leftArm.rotation.x = -0.45 + Math.sin(t * 2.5 + v.phase) * 0.15;
      } else if (v.role === 'riding-carousel') {
        // Riders mounted on Carousel horses holding the brass pole & waving
        v.leftArm.rotation.x = -1.15;
        v.rightArm.rotation.x = -1.95 + Math.sin(t * 5.8 + v.phase) * 0.35;
        v.rightArm.rotation.z = -0.2 + Math.cos(t * 5.8 + v.phase) * 0.2;
        v.head.rotation.y = Math.sin(t * 2.0 + v.phase) * 0.25;
      } else if (v.role === 'riding-ship') {
        // Thrilled passengers on the swinging Peacock Pirate Ship throwing both hands up on high swings!
        const thrill = Math.abs(Math.sin(t * 1.45));
        v.leftArm.rotation.x = -1.1 - thrill * 1.35;
        v.rightArm.rotation.x = -1.1 - thrill * 1.35;
        v.leftArm.rotation.z = 0.22 + Math.sin(t * 8 + v.phase) * 0.12;
        v.rightArm.rotation.z = -0.22 - Math.sin(t * 8 + v.phase) * 0.12;
        v.head.rotation.x = -thrill * 0.22;
      } else if (v.role === 'well-spectator') {
        // Excited spectators on top of Maut Ka Kuan peering down & cheering the stunt bikes
        v.head.rotation.x = 0.42;
        v.head.rotation.y = Math.sin(t * 3.2 + v.phase) * 0.35;
        v.rightArm.rotation.x = -1.85 + Math.sin(t * 6.5 + v.phase) * 0.45;
        v.leftArm.rotation.x = -0.8 + Math.cos(t * 4.5 + v.phase) * 0.25;
      } else if (v.role === 'playing-balloon') {
        // Aiming 3D toy air-rifle at the balloon board with periodic shot recoil
        const shotCycle = (t * 1.15 + v.phase) % 2.6;
        const recoil = shotCycle < 0.22 ? Math.sin((shotCycle / 0.22) * Math.PI) * 0.22 : 0;
        v.rightArm.rotation.x = -1.42 - recoil;
        v.leftArm.rotation.x = -1.32 - recoil * 0.8;
        v.leftArm.rotation.y = 0.25;
        v.head.rotation.y = Math.sin(t * 0.9 + v.phase) * 0.08;
      } else if (v.role === 'playing-ring') {
        // Winding up and tossing golden rings toward the pegs
        const throwWave = Math.sin(t * 2.8 + v.phase);
        v.rightArm.rotation.x = -0.85 - Math.max(0, throwWave) * 1.1;
        v.bodyGroup.position.y = Math.max(0, throwWave) * 0.04;
        v.head.rotation.y = Math.sin(t * 1.2 + v.phase) * 0.12;
      } else if (v.role === 'standing') {
        // Shoppers admiring stalls, pointing at items, and chatting
        const gesture = Math.sin(t * 2.4 + v.phase);
        v.bodyGroup.position.y = Math.sin(t * 1.8 + v.phase) * 0.015;
        v.head.rotation.y = Math.sin(t * 1.4 + v.phase) * 0.25;
        v.rightArm.rotation.x = -0.35 + Math.max(0, gesture) * -0.55;
        v.leftArm.rotation.x = -0.15 + Math.sin(t * 1.9 + v.phase) * 0.12;
      }
    }
  }

  // --- MANDIR GHANTI, MAHA-AARTI THALI, GROUND PATAKHE (ANAAR/CHAKRI/ROCKET) & WISH LANTERNS ---

  private buildInteractivePatakhaPad(cx: number, cz: number): void {
    const padGroup = new THREE.Group();
    padGroup.position.set(cx, 0, cz);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a1c2d, roughness: 0.78 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.82 });
    const anaarMat = new THREE.MeshStandardMaterial({
      color: 0xe63946,
      emissive: 0x551118,
      roughness: 0.35,
      metalness: 0.2,
    });
    const chakriMat = new THREE.MeshStandardMaterial({
      color: 0x06d6a0,
      emissive: 0x044432,
      roughness: 0.3,
      metalness: 0.3,
    });
    const rocketMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0x553800,
      roughness: 0.3,
      metalness: 0.4,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.16, 24), stoneMat);
    base.position.y = 0.08;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 10, 32), brassMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.16;
    padGroup.add(base, rim);

    // 1. Clickable 3D Anaar (Flowerpot Fountain) on Left
    const anaarGroup = new THREE.Group();
    anaarGroup.position.set(cx - 0.95, 0.16, cz + 0.25);
    const anaarCone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.72, 14), anaarMat);
    anaarCone.position.y = 0.36;
    const anaarGoldBand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.14, 14), brassMat);
    anaarGoldBand.position.y = 0.34;
    const anaarHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 1.2, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    anaarHit.position.y = 0.5;
    anaarGroup.add(anaarCone, anaarGoldBand, anaarHit);
    this.dynamicRoot.add(anaarGroup);
    this.groundCrackers.push({
      group: anaarGroup,
      kind: 'anaar',
      activeTimer: 2.5, // Starts sparkling on load for visual delight!
      basePos: anaarGroup.position.clone(),
    });

    // 2. Clickable 3D Chakri (Spinning Ground Wheel) in Center
    const chakriGroup = new THREE.Group();
    chakriGroup.position.set(cx, 0.2, cz + 0.55);
    const wheelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.07, 16), chakriMat);
    const innerSpiral = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16), brassMat);
    innerSpiral.rotation.x = Math.PI / 2;
    innerSpiral.position.y = 0.04;
    wheelMesh.add(innerSpiral);
    const chakriHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.68, 0.9, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    chakriHit.position.y = 0.3;
    chakriGroup.add(wheelMesh, chakriHit);
    this.dynamicRoot.add(chakriGroup);
    this.groundCrackers.push({
      group: chakriGroup,
      wheelMesh,
      kind: 'chakri',
      activeTimer: 0,
      basePos: chakriGroup.position.clone(),
    });

    // 3. Clickable 3D Sky Rocket (Hawai Rocket in Brass Bottle) on Right
    const rocketGroup = new THREE.Group();
    rocketGroup.position.set(cx + 0.95, 0.16, cz + 0.25);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.46, 12), brassMat);
    bottle.position.y = 0.23;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 8), brassMat);
    stick.position.y = 0.58;
    const rocketHead = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 12), rocketMat);
    rocketHead.position.y = 1.08;
    const rocketHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 1.5, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    rocketHit.position.y = 0.65;
    rocketGroup.add(bottle, stick, rocketHead, rocketHit);
    this.dynamicRoot.add(rocketGroup);
    this.groundCrackers.push({
      group: rocketGroup,
      kind: 'rocket',
      activeTimer: 0,
      basePos: rocketGroup.position.clone(),
    });

    // Signboard above Patakha Pad
    const signTex = createSignboardTexture(
      this.renderer,
      '🎇 पटाखा ज़ोन · CLICK TO LIGHT!',
      'Tap Anaar (Fountain) · Chakri (Spinner) · Sky Rocket',
      '#3d101b',
      '#ffd27d',
      '#fff5de'
    );
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.64),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, 1.85, -0.75);
    padGroup.add(signMesh);

    this.addContactShadow(padGroup, 5.2, 5.2);
    this.dynamicRoot.add(padGroup);
  }

  public ringMandapBell(): void {
    this.mandapBellTimer = 3.8;
    this.audio.effect('bell');
    this.spawnFireworkBurst(0, 4.2, -6.15, 26, 0xffd269);
    this.collectItem('Mandir Ghanti Aashirwad');
    this.callbacks.onToast('🔔 टन-टन! Mandir Ghanti rung! Shubh Deepavali blessings!');
  }

  public performMahaAarti(): void {
    this.mandapAartiTimer = 6.0;
    this.mandapBellTimer = 4.2;
    this.audio.effect('bell');
    this.audio.speak('Om Jai Lakshmi Mata! Shubh Deepavali Maha Aarti Aashirwad!');
    this.spawnFireworkBurst(0, 2.2, -6.5, 36, 0xffbe42);
    this.collectItem('Maa Lakshmi Shubh-Labh Aashirwad');
    this.callbacks.onToast('🪔 Performing Lakshmi-Ganesh Maha-Aarti! "Shubh-Labh Aashirwad" added to your Mela Bag!');
  }

  public lightGroundCracker(kind: 'anaar' | 'chakri' | 'rocket'): void {
    const cracker = this.groundCrackers.find((c) => c.kind === kind);
    const cx = cracker ? cracker.basePos.x : this.player.x;
    const cz = cracker ? cracker.basePos.z : this.player.z - 3.5;

    if (cracker) {
      cracker.activeTimer = kind === 'rocket' ? 1.8 : 5.5;
    }

    if (kind === 'anaar') {
      this.audio.effect('sparkle');
      this.spawnFireworkBurst(cx, 1.4, cz, 45, 0xffaa33);
      this.collectItem('Golden Anaar Fountain');
      this.callbacks.onToast('🎇 Golden Anaar Fountain lit! Watch the sparkling flowerpot!');
    } else if (kind === 'chakri') {
      this.audio.effect('sparkle');
      this.spawnFireworkBurst(cx, 0.4, cz, 40, 0x06d6a0);
      this.collectItem('Satrangi Ground Chakri');
      this.callbacks.onToast('🌀 Ground Chakri spinning! Look at the emerald & gold spiral sparks!');
    } else {
      this.audio.effect('firework');
      this.spawnFireworkBurst(cx, 1.2, cz, 24, 0xffd166);
      this.spawnFireworkBurst(cx + (Math.random() - 0.5) * 3, 16, cz - 2, 95, 0xff4d6d);
      this.spawnFireworkBurst(cx, 18, cz - 2, 85, 0xffbe0b);
      this.collectItem('Aasmani Hawai Rocket');
      this.callbacks.onToast('🚀 Hawai Sky Rocket launched high into the Diwali night sky!');
    }
  }

  public launchWishLantern(senderName: string, wishText: string): void {
    const cleanName = (senderName || 'Diwali Friend').trim().slice(0, 26);
    const cleanWish = (wishText || 'Shubh Deepavali! Sukh, Shanti & Samriddhi!').trim().slice(0, 56);

    const group = new THREE.Group();
    // Spawn 4.2m in front of the player so they can watch it float up immediately
    const spawnX =
      this.mode === 'walk' ? this.player.x - Math.sin(this.player.yaw) * 4.2 : 0;
    const spawnZ =
      this.mode === 'walk' ? this.player.z - Math.cos(this.player.yaw) * 4.2 : -18;
    group.position.set(spawnX, 1.65, spawnZ);

    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
    const lanternBody = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.32, 1.18, 14), lanternMat);
    group.add(lanternBody);

    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffd27d,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
    );
    glowSprite.scale.set(2.4, 2.4, 1);
    group.add(glowSprite);

    // Floating Banner Card below the Wish Sky Lantern
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(36, 12, 24, 0.92)';
    ctx.strokeStyle = '#ffcf66';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.fillRect(10, 10, 492, 140);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27d';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`🪔 ${cleanName}'s Akashdeep Wish`, 256, 58);
    ctx.fillStyle = '#fff6de';
    ctx.font = '22px sans-serif';
    ctx.fillText(`"${cleanWish}"`, 256, 108);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );
    labelSprite.scale.set(2.8, 0.88, 1);
    labelSprite.position.set(0, -1.15, 0);
    labelSprite.renderOrder = 30;
    group.add(labelSprite);

    this.dynamicRoot.add(group);
    this.wishLanterns.push({
      group,
      vy: 1.35,
      phase: Math.random() * Math.PI * 2,
    });

    this.audio.effect('sparkle');
    this.spawnFireworkBurst(spawnX, 2.0, spawnZ, 36, 0xffd27d);
    this.collectItem(`Akashdeep Wish (${cleanName})`);
    this.callbacks.onToast(`🏮 ${cleanName}'s Wish Sky Lantern is rising into the starry Diwali sky!`);
  }

  private checkSpecialInteractablesClick(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // 1. Check Mandir Ghanti (Temple Bell) & Maha-Aarti Thali (7 Diyas Mandap + Grand Laxmi-Ganesh Temple)
    const mandapTargets: THREE.Object3D[] = [];
    if (this.mandapBellPivot) mandapTargets.push(this.mandapBellPivot);
    if (this.mandapAartiThali) mandapTargets.push(this.mandapAartiThali);
    if (this.templeBellPivot) mandapTargets.push(this.templeBellPivot);
    if (this.templeAartiThali) mandapTargets.push(this.templeAartiThali);
    if (this.templeGroup) mandapTargets.push(this.templeGroup);

    if (mandapTargets.length > 0) {
      const hits = this.raycaster.intersectObjects(mandapTargets, true);
      if (hits.length > 0 && hits[0].distance < 28) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
          if (obj === this.mandapBellPivot || obj.userData?.isMandapBell) {
            this.ringMandapBell();
            return true;
          }
          if (obj === this.mandapAartiThali || obj.userData?.isMandapAarti) {
            this.performMahaAarti();
            return true;
          }
          if (obj === this.templeBellPivot || obj.userData?.isTempleBell) {
            this.ringTempleBell();
            return true;
          }
          if (obj === this.templeAartiThali || obj.userData?.isTempleAarti) {
            if (this.mode !== 'temple-aarti') {
              const tSpec = this.interactables.find((s) => s.type === 'temple');
              this.startTempleAarti(tSpec);
            } else {
              this.performTempleAartiWave();
            }
            return true;
          }
          if (obj.userData?.isTempleIdol) {
            if (this.mode !== 'temple-aarti') {
              const tSpec = this.interactables.find((s) => s.type === 'temple');
              this.startTempleAarti(tSpec);
            } else {
              this.offerTemplePushpanjali();
            }
            return true;
          }
          obj = obj.parent;
        }
      }
    }

    // 2. Check Interactive 3D Ground Crackers (Anaar, Chakri, Sky Rocket)
    if (this.groundCrackers.length > 0) {
      const crackerGroups = this.groundCrackers.map((c) => c.group);
      const hits = this.raycaster.intersectObjects(crackerGroups, true);
      if (hits.length > 0 && hits[0].distance < 28) {
        const hitObj = hits[0].object;
        const found = this.groundCrackers.find((c) => {
          let curr: THREE.Object3D | null = hitObj;
          while (curr) {
            if (curr === c.group) return true;
            curr = curr.parent;
          }
          return false;
        });
        if (found) {
          this.lightGroundCracker(found.kind);
          return true;
        }
      }
    }

    return false;
  }

  private updateSpecialFestiveAnimations(dt: number): void {
    const t = this.elapsed;

    // 1. Swinging Brass Temple Bell (Mandir Ghanti at 7 Diyas Mandap)
    if (this.mandapBellPivot) {
      if (this.mandapBellTimer > 0) {
        this.mandapBellTimer = Math.max(0, this.mandapBellTimer - dt);
        const damping = this.mandapBellTimer / 3.8;
        this.mandapBellPivot.rotation.z = Math.sin(t * 14) * 0.48 * damping;
      } else {
        this.mandapBellPivot.rotation.z = Math.sin(t * 1.5) * 0.03;
      }
    }

    // 1b. Grand Laxmi-Ganesh Temple Bell, Rotating Divine Halos, Waving Flag & Sacred Aarti Thali
    if (this.templeBellPivot) {
      if (this.templeBellTimer > 0) {
        this.templeBellTimer = Math.max(0, this.templeBellTimer - dt);
        const damping = this.templeBellTimer / 4.5;
        this.templeBellPivot.rotation.z = Math.sin(t * 13) * 0.52 * damping;
      } else {
        this.templeBellPivot.rotation.z = Math.sin(t * 1.4) * 0.035;
      }
    }

    for (const halo of this.templeHalos) {
      halo.rotation.z = t * 0.55;
    }

    if (this.templeFlagMesh) {
      this.templeFlagMesh.rotation.y = Math.sin(t * 4.2) * 0.24;
    }

    if (this.templeAartiThali) {
      if (this.templeAartiTimer > 0) {
        this.templeAartiTimer = Math.max(0, this.templeAartiTimer - dt);
        this.templeAartiAngle += dt * 3.8;
        const radiusX = 1.15;
        const radiusY = 0.78;
        this.templeAartiThali.position.set(
          this.templeAartiBasePos.x + Math.cos(this.templeAartiAngle) * radiusX,
          this.templeAartiBasePos.y + 0.92 + Math.sin(this.templeAartiAngle) * radiusY,
          this.templeAartiBasePos.z + 0.35
        );
        if (Math.random() < 0.55) {
          this.templeAartiThali.getWorldPosition(_vec3);
          this.spawnFireworkBurst(_vec3.x, _vec3.y + 0.18, _vec3.z, 2, 0xffd768);
        }
      } else {
        // Gentle inviting hover on the Chowki pedestal
        this.templeAartiThali.position.set(
          this.templeAartiBasePos.x,
          this.templeAartiBasePos.y + Math.sin(t * 2.5) * 0.03,
          this.templeAartiBasePos.z
        );
      }
    }

    // 2. Circular Sacred Orbit of the Golden Maha-Aarti Thali (7 Diyas Mandap)
    if (this.mandapAartiThali) {
      if (this.mandapAartiTimer > 0) {
        this.mandapAartiTimer = Math.max(0, this.mandapAartiTimer - dt);
        const angle = t * 4.2;
        const radius = 0.52;
        this.mandapAartiThali.position.set(
          this.mandapAartiBasePos.x + Math.cos(angle) * radius,
          this.mandapAartiBasePos.y + 0.55 + Math.sin(angle) * radius,
          this.mandapAartiBasePos.z + 0.25
        );
        if (Math.random() < 0.45) {
          this.spawnFireworkBurst(
            this.mandapAartiThali.position.x,
            this.mandapAartiThali.position.y + 0.15,
            this.mandapAartiThali.position.z - 10,
            2,
            0xffd27d
          );
        }
      } else {
        this.mandapAartiThali.position.copy(this.mandapAartiBasePos);
      }
    }

    // 3. Active Ground Crackers (Anaar Fountain, Spinning Chakri & Rocket)
    for (const c of this.groundCrackers) {
      if (c.activeTimer > 0) {
        c.activeTimer = Math.max(0, c.activeTimer - dt);
        if (c.kind === 'anaar') {
          // Erupt continuous golden-pink fountain sparks upward
          if (Math.random() < 0.85) {
            this.spawnFireworkBurst(
              c.basePos.x + (Math.random() - 0.5) * 0.2,
              c.basePos.y + 0.85,
              c.basePos.z + (Math.random() - 0.5) * 0.2,
              4,
              Math.random() < 0.5 ? 0xffbe0b : 0xff4d6d
            );
          }
        } else if (c.kind === 'chakri') {
          // Spin wheel rapidly on ground & shoot spiral emerald-gold sparks
          if (c.wheelMesh) {
            c.wheelMesh.rotation.y += dt * 24;
          }
          c.group.position.x = c.basePos.x + Math.cos(t * 7) * 0.35;
          c.group.position.z = c.basePos.z + Math.sin(t * 7) * 0.35;
          if (Math.random() < 0.85) {
            this.spawnFireworkBurst(
              c.group.position.x,
              c.group.position.y + 0.12,
              c.group.position.z,
              3,
              Math.random() < 0.5 ? 0x06d6a0 : 0xffea00
            );
          }
          if (c.activeTimer <= 0) {
            c.group.position.copy(c.basePos);
          }
        }
      }
    }

    // 4. Ascending Personalized Wish Sky Lanterns
    for (let i = this.wishLanterns.length - 1; i >= 0; i--) {
      const wl = this.wishLanterns[i];
      wl.group.position.y += wl.vy * dt;
      wl.group.position.x += Math.sin(t * 0.9 + wl.phase) * 0.35 * dt;
      if (wl.group.position.y > 68) {
        this.dynamicRoot.remove(wl.group);
        this.wishLanterns.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.cleanupEvents();
    this.audio.dispose();
    this.renderer.dispose();
  }
}


