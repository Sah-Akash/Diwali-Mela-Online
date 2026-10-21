import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MelaInteractableSpec,
  PartnerStallData,
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
  | 'ride'
  | 'well'
  | 'firework-show'
  | 'finale';

export interface GameHudState {
  mode: 'balloon' | 'ring' | 'diya-game' | 'well';
  shotsLeft: number;
  score: number;
  totalTargets?: number;
  done: boolean;
  message: string;
  spectator?: boolean;
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
  private wellBikes: { group: THREE.Group; angle: number; height: number; speed: number }[] = [];
  private wellRings: { mesh: THREE.Mesh; angle: number; height: number; collected: boolean }[] = [];

  // Mini-game objects
  private balloonTargets: { mesh: THREE.Mesh; basePos: THREE.Vector3; popped: boolean; color: number }[] = [];
  private ringFlight: {
    mesh: THREE.Mesh;
    active: boolean;
    t: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    willWin: boolean;
  } | null = null;
  private mandapDiyas: { group: THREE.Group; flame: THREE.Object3D; lit: boolean; index: number }[] = [];

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
      { x: 0, z: -56, size: 11.0, tex: rangoliTex2 },
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
    this.wellBikes = [];
    this.wellRings = [];

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
        case 'photo':
          this.buildPhotoBoothToran(spec);
          break;
        case 'fireworks':
          this.buildFireworksPavilion(spec);
          break;
        case 'finale':
          this.buildGrandAkashdeepTower(spec);
          break;
      }
    }
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
    if (spec.type === 'food') {
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

    this.stats.diyasLit = this.mandapDiyas.filter((d) => d.lit).length;
    this.addContactShadow(mandap, 11, 11);
    this.dynamicRoot.add(mandap);
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
    this.addContactShadow(root, 8, 10);
    this.dynamicRoot.add(root);
  }

  private buildWellOfDeath(spec: MelaInteractableSpec): void {
    const root = new THREE.Group();
    root.position.set(spec.x, 0, spec.z);

    const plankTex = createWoodPlankTexture(this.renderer);
    const wallMat = new THREE.MeshStandardMaterial({
      map: plankTex,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4b855, roughness: 0.3, metalness: 0.8 });

    const wellRadius = 7.2;
    const wellHeight = 7.0;

    // Open-ended wooden cylinder wall
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(wellRadius + 0.6, wellRadius - 0.4, wellHeight, 32, 1, true),
      wallMat
    );
    cylinder.position.y = wellHeight / 2;
    root.add(cylinder);

    // Top spectator balcony railing
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(wellRadius + 0.65, 0.22, 10, 36), goldMat);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = wellHeight;
    root.add(topRim);

    // Signboard outside the Well of Death
    const signTex = createSignboardTexture(
      this.renderer,
      'MAUT KA KUAN · मौत का कुआँ',
      'Watch the Stunt Show or Ride the Wall!'
    );
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.6), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(-4.5, 4.8, 6.8);
    sign.rotation.y = -Math.PI / 5;
    root.add(sign);

    // 2 Stunt Bikes racing inside the wooden wall
    for (let i = 0; i < 2; i++) {
      const bike = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.55, 1.5),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0xff3b30 : 0xffcc00, roughness: 0.3, metalness: 0.6 })
      );
      bike.add(body);
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
          this.handleDiyaTap(e.clientX, e.clientY);
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
    const dist = spec.type === 'wheel' || spec.type === 'well' || spec.type === 'finale' ? 11 : 4.6;
    this.player.x = spec.x + Math.sin(spec.rotY) * dist;
    this.player.z = spec.z + Math.cos(spec.rotY) * dist;
    this.player.yaw = Math.atan2(this.player.x - spec.x, this.player.z - spec.z);
    this.player.pitch = 0.05;
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

  public startMiniGame(gameMode: 'balloon' | 'ring' | 'diya-game', spec: MelaInteractableSpec): void {
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

  public leaveActivity(): void {
    const prev = this.activeSpec;
    this.gameState = null;
    this.callbacks.onGameUpdate(null);
    this.callbacks.onCinematic(null);

    if (prev) {
      const dist = prev.type === 'wheel' || prev.type === 'well' || prev.type === 'finale' ? 11.5 : 4.8;
      this.player.x = prev.x + Math.sin(prev.rotY) * dist;
      this.player.z = prev.z + Math.cos(prev.rotY) * dist;
      this.player.yaw = Math.atan2(this.player.x - prev.x, this.player.z - prev.z);
      this.player.pitch = 0.04;
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
        this.player.z = THREE.MathUtils.clamp(nextZ, -52, 48);
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
      let minDist = 6.2;
      for (const item of this.interactables) {
        const allowDist =
          item.type === 'wheel' || item.type === 'well' || item.type === 'finale' || item.type === 'pirate-ship'
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

    if (this.mode === 'firework-show') {
      this.fireworkTimer += dt;
      const progress = Math.min(1, this.fireworkTimer / 14);
      this.callbacks.onRideProgress(progress, 'Roshni Ka Jashn · Sky Fireworks');

      this.camera.position.set(0, 3.2, -26);
      this.camera.lookAt(Math.sin(t * 0.5) * 8, 16, -52);

      if (Math.random() < 0.16) {
        this.audio.effect('firework');
        this.spawnFireworkBurst(
          (Math.random() - 0.5) * 36,
          12 + Math.random() * 16,
          -42 - Math.random() * 22,
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

      // Sweeping cinematic camera around the 20m Swarna Deep-Stambh
      const camAngle = ft * 0.22;
      this.camera.position.set(Math.sin(camAngle) * 18, 6.5 + Math.min(8, ft * 0.45), -36 + Math.cos(camAngle) * 6);
      this.camera.lookAt(0, 12 + Math.min(6, ft * 0.35), -56);

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

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.cleanupEvents();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
