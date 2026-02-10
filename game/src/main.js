//////////// IMPORTS //////////////
import { Fighter } from "./classes/fighter.js";
import { Platform } from "./classes/platform.js";
import { RespawnPlatform } from "./classes/respawnplatform.js";

//////////// VARIABLES //////////////
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 0, 10);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('canvas').appendChild(renderer.domElement);

export let fighters = []; // Array to hold all fighters in the game
export let platforms = []; // Array to hold all ground platforms in the game
const PLAYERS = [] // Fighters that are player-controlled (not CPU)
const KEY = {}; // Object to track key states
const KEY_PREV = {}; // Object to track previous frame's key states
const KEY_PRESS_TIME = {}; // Object to track when each key was pressed
const PlayerColors = {
    "P1": 0xcc0000,  // P1 - Red
    "P2": 0x0000cc,  // P2 - Blue
    "P3": 0xcccc00,  // P3 - Yellow
    "P4": 0x00cc00,  // P4 - Green
    "P5": 0xcc8800,  // P5 - Orange
    "P6": 0x7070ff,  // P6 - Purple
    "P7": 0x555555,  // P7 - Gray
    "P8": 0x880088,  // P8 - Magenta
    "P9": 0x00dd99,  // P9 - Cyan
    "P10": 0x884400  // P10 - Brown
}; // Colors for player fighters

// Camera target for smooth lerping
let cameraTarget = { x: 0, y: 0, z: 10 };
const cameraLerpSpeed = 0.3; // Smoothing factor (0-1, lower = smoother)

// KO camera focus window
const KO_FOCUS_DURATION = 2.2; // seconds
const KO_FOCUS_RADIUS = 10;    // world units around blast
let koFocusTimer = 0;
let koFocusPosition = new THREE.Vector3(0, 0, 0);

// Camera boundaries (based on stage area)
const CAMERA_BOUNDS = {
    minX: -30,
    maxX: 30,
    minY: -20,
    maxY: 20
};

// Knockout boundaries past the camera bounds (20 units would mean 20 units beyond the camera bounds)
// (beyond these coordinates, fighters are considered KO'd and respawn)
const KO_BOUNDS = {
    minX: 15,
    maxX: 15,
    minY: 20,
    maxY: 20
}

let gameMode = "stock"; // Game mode (e.g. "stock", "timed", etc.)

const CONFIG = {
    SD_penalty: 1, // Self-destruct penalty: how many stocks will be lost on a self-destruct?
};

// Off-screen indicators
const offscreenIndicators = [];
const indicatorScene = new THREE.Scene();
const indicatorCamera = new THREE.OrthographicCamera(
    -window.innerWidth / 2, window.innerWidth / 2,
    window.innerHeight / 2, -window.innerHeight / 2,
    0.1, 10
);
indicatorCamera.position.z = 5;

// KO effect tracking
const activeParticles = [];          // Blast KO spark/confetti particles
const activeRespawnPlatforms = [];   // Active respawn platforms
const respawnTimers = [];            // Fighters waiting to respawn { fighter, timer, duration }
const RESPAWN_DELAY = 2.0;           // Seconds before a KO'd fighter respawns

//////////// FUNCTIONS //////////////

// Set up game scene
function setupGame() {

    //// Add lighting ////
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    //// Add fighter ////
    fighters[0] = new Fighter("P1", "Steve");

    //// CPU Fighters ////
    for (let i = 0; i < 1; i++) {
        fighters.push(new Fighter("CPU", "Mario"));
    }

    for (let i = 0; i < fighters.length; i++) {
        if (fighters[i].tag !== "CPU") {
            fighters[i].object.material.color.set(PlayerColors[fighters[i].tag]);
            PLAYERS.push(fighters[i]);
        }
        scene.add(fighters[i].object);  
    }

    platforms[0] = new Platform({x: 30, y: 50, z: 15}, {x: 0, y: -32, z: -5}, 0x118811);

    for (let i = 0; i < platforms.length; i++) {
        scene.add(platforms[i].object);
    }

    // Create off-screen indicators for each fighter
    for (let i = 0; i < fighters.length; i++) {
        const indicator = createOffscreenIndicator(fighters[i]);
        offscreenIndicators.push(indicator);
        indicatorScene.add(indicator.group);
    }

    // Create damage meter UI elements for each player fighter
    for (let i = 0; i < fighters.length; i++) {
        console.log(`Creating damage meter for ${fighters[i].tag} (${fighters[i].character})`);
        createDamageMeter(fighters[i]);
    }

    console.log('Game setup complete');

    animate();
}

// Update camera to frame all fighters with margin
function updateCamera() {
    const margin = 5; // Extra space around fighters

    // Get bounding box of all fighters
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let hasActiveFighter = false;

    // If a KO just happened, keep camera centered on the blast area
    if (koFocusTimer > 0) {
        hasActiveFighter = true;
        minX = koFocusPosition.x - KO_FOCUS_RADIUS;
        maxX = koFocusPosition.x + KO_FOCUS_RADIUS;
        minY = koFocusPosition.y - KO_FOCUS_RADIUS;
        maxY = koFocusPosition.y + KO_FOCUS_RADIUS;
    } else {
        for (let fighter of fighters) {
            if (fighter.isKOd || fighter.eliminated) continue;
            hasActiveFighter = true;
            const pos = fighter.object.position;
            const size = 0.5; // Half-width/height of fighter
            minX = Math.min(minX, pos.x - size);
            maxX = Math.max(maxX, pos.x + size);
            minY = Math.min(minY, pos.y - size);
            maxY = Math.max(maxY, pos.y + size);
        }
    }

    // Fallback: if no active fighters, frame on stage center
    if (!hasActiveFighter) {
        const cx = (CAMERA_BOUNDS.minX + CAMERA_BOUNDS.maxX) / 2;
        const cy = (CAMERA_BOUNDS.minY + CAMERA_BOUNDS.maxY) / 2;
        minX = cx - 1; maxX = cx + 1;
        minY = cy - 1; maxY = cy + 1;
    }

    // Calculate center and max extent
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const extentX = (maxX - minX) / 2 + margin;
    const extentY = (maxY - minY) / 2 + margin;

    // Camera setup: FOV is 75 degrees
    const vFOV = (camera.fov * Math.PI) / 180; // Convert to radians

    // Calculate required z distance for both x and y extents
    const zForHeight = extentY / Math.tan(vFOV / 2);
    const zForWidth = extentX / (Math.tan(vFOV / 2) * camera.aspect);

    // Use the larger z to fit both dimensions
    let requiredZ = Math.max(zForHeight, zForWidth);
    
    // Calculate max Z based on camera bounds to prevent showing beyond boundaries
    const boundsWidth = CAMERA_BOUNDS.maxX - CAMERA_BOUNDS.minX;
    const boundsHeight = CAMERA_BOUNDS.maxY - CAMERA_BOUNDS.minY;
    const maxZForWidth = (boundsWidth / 2) / (Math.tan(vFOV / 2) * camera.aspect);
    const maxZForHeight = (boundsHeight / 2) / Math.tan(vFOV / 2);
    const maxZ = Math.min(maxZForWidth, maxZForHeight);
    
    // Clamp required Z to max Z
    requiredZ = Math.min(requiredZ, maxZ);

    // Set target camera position
    cameraTarget.x = centerX;
    cameraTarget.y = centerY; // Slightly above center for better angle
    cameraTarget.z = requiredZ;

    // Smooth lerp towards target position
    camera.position.x += (cameraTarget.x - camera.position.x) * cameraLerpSpeed;
    camera.position.y += (cameraTarget.y - camera.position.y) * cameraLerpSpeed + 0.7;
    camera.position.z += (cameraTarget.z - camera.position.z) * cameraLerpSpeed;

    // Apply camera boundaries - clamp camera view frustum
    const vFOVHalf = vFOV / 2;
    const viewHeightAtZ = 2 * Math.tan(vFOVHalf) * camera.position.z;
    const viewWidthAtZ = viewHeightAtZ * camera.aspect;
    
    const halfViewWidth = viewWidthAtZ / 2;
    const halfViewHeight = viewHeightAtZ / 2;
    
    // Clamp camera X position to ensure view stays within bounds
    const boundsWidthHalf = (CAMERA_BOUNDS.maxX - CAMERA_BOUNDS.minX) / 2;
    const boundsCenterX = (CAMERA_BOUNDS.maxX + CAMERA_BOUNDS.minX) / 2;
    if (halfViewWidth >= boundsWidthHalf) {
        // View is wider than bounds, center on bounds
        camera.position.x = boundsCenterX;
    } else {
        // Normal clamping
        camera.position.x = Math.max(
            CAMERA_BOUNDS.minX + halfViewWidth,
            Math.min(CAMERA_BOUNDS.maxX - halfViewWidth, camera.position.x)
        );
    }
    
    // Clamp camera Y position to ensure view stays within bounds
    const boundsHeightHalf = (CAMERA_BOUNDS.maxY - CAMERA_BOUNDS.minY) / 2;
    const boundsCenterY = (CAMERA_BOUNDS.maxY + CAMERA_BOUNDS.minY) / 2;
    if (halfViewHeight >= boundsHeightHalf) {
        // View is taller than bounds, center on bounds
        camera.position.y = boundsCenterY;
    } else {
        // Normal clamping
        camera.position.y = Math.max(
            CAMERA_BOUNDS.minY + halfViewHeight,
            Math.min(CAMERA_BOUNDS.maxY - halfViewHeight, camera.position.y)
        );
    }

    // Look at center but angled downwards (y - 2)
    camera.lookAt(camera.position.x, camera.position.y - 2, 0);
}

// Create off-screen indicator for a fighter
function createOffscreenIndicator(fighter) {
    const group = new THREE.Group();
    
    // Get player color
    let color = 0x888888; // Default gray for CPU
    if (fighter.tag !== "CPU") {
        color = PlayerColors[fighter.tag] || 0x888888;
    }
    
    // Create hoop (ring)
    const ringGeometry = new THREE.RingGeometry(30, 40, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: color, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    group.add(ring);
    
    // Create inner circle background
    const circleGeometry = new THREE.CircleGeometry(28, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.6
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    circle.position.z = -0.1;
    group.add(circle);
    
    // Create mini fighter preview (simplified)
    const previewGeometry = new THREE.BoxGeometry(20, 40, 10);
    const previewMaterial = new THREE.MeshBasicMaterial({ color: color });
    const preview = new THREE.Mesh(previewGeometry, previewMaterial);
    group.add(preview);
    
    group.visible = false; // Hidden by default
    
    return {
        group: group,
        fighter: fighter,
        ring: ring,
        preview: preview
    };
}

// Create damage meter UI element for a fighter
function createDamageMeter(fighter) {
    let color = PLAYERS.includes(fighter) ? PlayerColors[fighter.tag] : 0x888888;
    let hash = color.toString(16).padStart(6, '0');

    // Create damage container that holds fighter info
    const container = document.createElement('div');
    container.className = 'damage-meter';

    // The damage percent counter.
    const damageCounter = document.createElement('div');
    damageCounter.className = 'damage-counter';
    container.appendChild(damageCounter);

    // Fighter name label
    const fighterName = document.createElement('div');
    fighterName.className = 'fighter-name';
    fighterName.style.borderBottomColor = `#${hash}`;
    fighterName.textContent = fighter.character;
    container.appendChild(fighterName);

    // Container for fighter photo with colored background matching player color
    const photoContainer = document.createElement('div');
    photoContainer.className = 'photo-container';
    photoContainer.style.backgroundColor = `#${hash}`;
    container.appendChild(photoContainer);

    // Fighter photo with zoom and offset for better framing
    const playerPhoto = document.createElement('div');
    playerPhoto.className = 'player-photo';
    playerPhoto.style.backgroundImage = `url('./src/img/fighter_profile/${fighter.character}.png')`;
    playerPhoto.style.backgroundRepeat = 'no-repeat';
    playerPhoto.style.backgroundSize = fighter.photoZoom + '%';
    playerPhoto.style.backgroundPosition = `${fighter.photoOffset.x}% ${fighter.photoOffset.y}%`;
    photoContainer.appendChild(playerPhoto);

    // Series logo with color matching player color
    const seriesLogo = document.createElement('div');
    seriesLogo.className = 'series-logo';
    seriesLogo.style.backgroundColor = `#${hash}`;
    seriesLogo.style.maskImage = `url('./src/img/series_icon/${fighter.series}.png')`;
    container.appendChild(seriesLogo);

    // Stock container for showing remaining lives (stocks)
    // (Maxes out at 5, and counts beyond that show as "headIcon x #")
    const stockContainer = document.createElement('div');
    stockContainer.className = 'stock-container';
    container.appendChild(stockContainer);

    if (fighter.stock <= 5) {
        for (let i = 0; i < fighter.stock; i++) {
            const stockIcon = document.createElement('div');
            stockIcon.className = 'stock';
            stockIcon.style.backgroundImage = `url('./src/img/stock_icon/${fighter.character}.png')`;
            stockContainer.appendChild(stockIcon);
        }
    } else {
        const headIcon = document.createElement('div');
        headIcon.className = 'stock';
        headIcon.style.backgroundImage = `url('./src/img/stock_icon/${fighter.character}.png')`;
        stockContainer.appendChild(headIcon);
        const stockCount = document.createElement('div');
        stockCount.className = 'stock-count';
        stockCount.textContent = "x" + fighter.stock;
        stockContainer.appendChild(stockCount);
    }

    document.getElementById('damage-container').appendChild(container);
}

// Update off-screen indicators
function updateOffscreenIndicators() {
    // Get view frustum boundaries in world space
    const frustum = new THREE.Frustum();
    const cameraViewProjectionMatrix = new THREE.Matrix4();
    cameraViewProjectionMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);
    
    const margin = 60; // Margin from screen edge
    
    for (let indicator of offscreenIndicators) {
        const fighter = indicator.fighter;

        // Hide indicator for KO'd, eliminated, or respawning fighters
        if (fighter.isKOd || fighter.eliminated || fighter.respawning) {
            indicator.group.visible = false;
            continue;
        }

        const worldPos = fighter.object.position;
        
        // Check if fighter is in camera view
        const fighterSphere = new THREE.Sphere(worldPos, 1);
        const isVisible = frustum.intersectsSphere(fighterSphere);
        
        if (!isVisible) {
            // Fighter is off screen - show indicator
            indicator.group.visible = true;

            // Damage fighter for being off-screen (e.g. 0.1% per frame)
            fighter.damage += 0.1;
            
            // Project fighter position to screen space
            const screenPos = worldPos.clone().project(camera);
            
            // Convert to pixel coordinates
            let x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            let y = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight;
            
            // Clamp to screen edges with margin
            x = Math.max(margin, Math.min(window.innerWidth - margin, x));
            y = Math.max(margin, Math.min(window.innerHeight - margin, y));
            
            // Position indicator in screen space
            indicator.group.position.x = x - window.innerWidth / 2;
            indicator.group.position.y = -(y - window.innerHeight / 2);
            indicator.group.position.z = 0;
            
        } else {
            // Fighter is on screen - hide indicator
            indicator.group.visible = false;
        }
    }
}

function updateDamageMeters() {
    const damageMeters = document.getElementsByClassName('damage-meter');
    for (let i = 0; i < fighters.length; i++) {
        const fighter = fighters[i];
        // Get damage counter element for this fighter

        // Stringify damage with the tenth (including .0) and percent sign, e.g. "10.0%"
        // and wrap the decimal and percent sign in a smaller font size for better readability
        const damageText = `${fighter.damage.toFixed(1)}%`;
        const damageCounter = damageMeters[i].getElementsByClassName('damage-counter')[0];

        // Find a color for the damage amount.
        // 0%-75%: white to yellow
        // 75%-100%: yellow to orange
        // 100%-150%: orange to red
        // 150%-200%: red to dark red
        // 200%+: stays dark red
        let color = '#ffffff'; // default white

        if (fighter.damage >= 200) {
            color = '#880000'; // dark red
        } else if (fighter.damage >= 150) {
            const t = (fighter.damage - 150) / 50;
            color = `#${interpolateColor(0xcc0000, 0x880000, t)}`;
        } else if (fighter.damage >= 100) {
            const t = (fighter.damage - 100) / 50;
            color = `#${interpolateColor(0xff8800, 0xcc0000, t)}`;
        } else if (fighter.damage >= 75) {
            const t = (fighter.damage - 75) / 25;
            color = `#${interpolateColor(0xffff00, 0xff8800, t)}`;
        } else if (fighter.damage < 75) {
            const t = fighter.damage / 75;
            color = `#${interpolateColor(0xffffff, 0xffff00, t)}`;
        }

        damageCounter.style.color = color;
        damageCounter.innerHTML = damageText.replace(/(\.\d)?%/, '<span class="damage-decimal">$1%</span>');

        const meter = damageMeters[i];
        meter.classList.remove('high-damage', 'very-high-damage');

        if (fighter.eliminated) {
            meter.classList.add('eliminated');
        } else {
            meter.classList.remove('eliminated');
            if (fighter.damage >= 200) {
                meter.classList.add('very-high-damage');
            } else if (fighter.damage >= 120) {
                meter.classList.add('high-damage');
            }
        }

        // if (fighter.isKOd) {
        //     meter.classList.add('KOd');
        // } else {
        //     meter.classList.remove('KOd');
        // }
    }
}

function interpolateColor(color1, color2, t) {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;
    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, '0');
    const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, '0');
    const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, '0');
    return r + g + b;
}

// ========== KO / RESPAWN / PARTICLE SYSTEMS ==========

// Create spark and confetti particles for a blast KO
function createBlastKOEffect(position, color) {
    const stageCenter = {
        x: (CAMERA_BOUNDS.minX + CAMERA_BOUNDS.maxX) / 2,
        y: (CAMERA_BOUNDS.minY + CAMERA_BOUNDS.maxY) / 2
    };

    const dirX = stageCenter.x - position.x;
    const dirY = stageCenter.y - position.y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const normX = dirX / len;
    const normY = dirY / len;

    // --- Sparks: large colored particles aimed at stage center ---
    for (let i = 0; i < 45; i++) {
        const size = 3 + Math.random() * 0.8;
        const geo = new THREE.PlaneGeometry(size, size * 2.5);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(position.x, position.y, position.z || 0);
        mesh.rotation.z = Math.random() * Math.PI * 2;

        const speed = 30 + Math.random() * 50;
        const spread = (Math.random() - 0.5) * 1.5;

        scene.add(mesh);
        activeParticles.push({
            mesh,
            vx: (normX + spread * (Math.random() - 0.5)) * speed,
            vy: (normY + spread * (Math.random() - 0.5)) * speed,
            life: 1.0,
            decay: 0.012 + Math.random() * 0.018,
            type: 'spark'
        });
    }

    // --- Confetti: small colorful rectangles ---
    const confettiColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, color];
    for (let i = 0; i < 30; i++) {
        const size = 0.1 + Math.random() * 0.2;
        const geo = new THREE.PlaneGeometry(size, size * 0.6);
        const mat = new THREE.MeshBasicMaterial({
            color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(position.x, position.y, position.z || 0);

        const speed = 4 + Math.random() * 12;
        const spread = (Math.random() - 0.5) * 2;

        scene.add(mesh);
        activeParticles.push({
            mesh,
            vx: (normX + spread) * speed,
            vy: (normY + spread) * speed + Math.random() * 4,
            life: 1.0,
            decay: 0.008 + Math.random() * 0.012,
            rotSpeed: (Math.random() - 0.5) * 10,
            type: 'confetti'
        });
    }
}

// Update all active particles (sparks + confetti)
function updateParticles(dt) {
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.life -= p.decay * dt;

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            activeParticles.splice(i, 1);
            continue;
        }

        const frameDt = (1 / 60) * dt;
        p.mesh.position.x += p.vx * frameDt;
        p.mesh.position.y += p.vy * frameDt;
        p.mesh.material.opacity = Math.max(0, p.life);

        if (p.type === 'confetti') {
            p.vy -= 5 * frameDt; // gravity
            p.mesh.rotation.z += (p.rotSpeed || 0) * frameDt;
        }
        if (p.type === 'spark') {
            const scale = 0.5 + p.life * 0.5;
            p.mesh.scale.set(scale, scale, scale);
        }
    }
}

// Handle a blast KO for the given fighter
function blastKO(fighter) {
    // Player color for effect (gray for CPU)
    let color = 0x888888;
    if (fighter.tag !== "CPU") {
        color = PlayerColors[fighter.tag] || 0x888888;
    }

    const pos = fighter.object.position.clone();
    createBlastKOEffect(pos, color);

    koFocusPosition.copy(pos);
    koFocusTimer = KO_FOCUS_DURATION;

    // --- Scoring ---
    const isSD = (fighter.lastHitBy === null || fighter.lastHitBy === fighter);

    if (gameMode === "stock") {
        fighter.stock -= isSD ? CONFIG.SD_penalty : 1;
    } else {
        // Timed / point mode
        fighter.score -= isSD ? CONFIG.SD_penalty : 1;
        if (!isSD && fighter.lastHitBy) {
            fighter.lastHitBy.score += 1;
        }
    }
    fighter.stock = Math.max(0, fighter.stock);

    // --- Set KO state ---
    fighter.isKOd = true;
    fighter.lastHitBy = null;
    scene.remove(fighter.object);

    // --- Damage counter shatter effect ---
    const idx = fighters.indexOf(fighter);
    const damageMeters = document.getElementsByClassName('damage-meter');
    if (damageMeters[idx]) {
        const counter = damageMeters[idx].getElementsByClassName('damage-counter')[0];
        if (counter) counter.classList.add('shatter');
    }

    // --- Update stock display ---
    updateStockDisplay(fighter, idx);

    // --- Check elimination ---
    if (gameMode === "stock" && fighter.stock <= 0) {
        fighter.eliminated = true;
        if (damageMeters[idx]) {
            damageMeters[idx].classList.remove('KOd');
            damageMeters[idx].classList.add('eliminated');
        }
    } else {
        // Queue respawn
        respawnTimers.push({ fighter, timer: 0, duration: RESPAWN_DELAY });
    }
}

// Respawn a fighter after KO delay
function respawnFighter(fighter) {
    fighter.isKOd = false;
    fighter.damage = 0;
    fighter.respawning = true;
    fighter.intangible = true;
    fighter.velocity = { x: 0, y: 0, z: 0 };

    // Add fighter back to scene
    scene.add(fighter.object);
    fighter.object.visible = true;

    // Create respawn platform
    const platform = new RespawnPlatform(fighter, scene, camera, CAMERA_BOUNDS);
    fighter.respawnPlatform = platform;
    activeRespawnPlatforms.push(platform);

    // Reappear damage counter
    const idx = fighters.indexOf(fighter);
    const damageMeters = document.getElementsByClassName('damage-meter');
    if (damageMeters[idx]) {
        damageMeters[idx].classList.remove('KOd');
        const counter = damageMeters[idx].getElementsByClassName('damage-counter')[0];
        if (counter) {
            counter.classList.remove('shatter');
            counter.classList.add('reappear');
            setTimeout(() => counter.classList.remove('reappear'), 400);
        }
    }
}

// Refresh the stock icon display for a fighter
function updateStockDisplay(fighter, idx) {
    const damageMeters = document.getElementsByClassName('damage-meter');
    if (!damageMeters[idx]) return;

    const stockContainer = damageMeters[idx].getElementsByClassName('stock-container')[0];
    if (!stockContainer) return;

    stockContainer.innerHTML = '';
    if (fighter.stock <= 0) return;

    if (fighter.stock <= 5) {
        for (let i = 0; i < fighter.stock; i++) {
            const stockIcon = document.createElement('div');
            stockIcon.className = 'stock';
            stockIcon.style.backgroundImage = `url('./src/img/stock_icon/${fighter.character}.png')`;
            stockContainer.appendChild(stockIcon);
        }
    } else {
        const headIcon = document.createElement('div');
        headIcon.className = 'stock';
        headIcon.style.backgroundImage = `url('./src/img/stock_icon/${fighter.character}.png')`;
        stockContainer.appendChild(headIcon);
        const stockCount = document.createElement('div');
        stockCount.className = 'stock-count';
        stockCount.textContent = 'x' + fighter.stock;
        stockContainer.appendChild(stockCount);
    }
}

// Check all fighters against KO boundaries
function checkKOBounds() {
    for (let i = 0; i < fighters.length; i++) {
        const fighter = fighters[i];
        if (fighter.isKOd || fighter.eliminated || fighter.respawning) continue;

        const pos = fighter.object.position;
        if (pos.x < CAMERA_BOUNDS.minX - KO_BOUNDS.minX ||
            pos.x > CAMERA_BOUNDS.maxX + KO_BOUNDS.maxX ||
            pos.y < CAMERA_BOUNDS.minY - KO_BOUNDS.minY ||
            pos.y > CAMERA_BOUNDS.maxY + KO_BOUNDS.maxY) {
            blastKO(fighter);
        }
    }
}

// Update respawn timers — spawn fighters after delay
function updateRespawnTimers(dt) {
    for (let i = respawnTimers.length - 1; i >= 0; i--) {
        const rt = respawnTimers[i];
        rt.timer += (1 / 60) * dt;
        if (rt.timer >= rt.duration) {
            respawnFighter(rt.fighter);
            respawnTimers.splice(i, 1);
        }
    }
}

// Update all active respawn platforms
function updateRespawnPlatforms(dt) {
    for (let i = activeRespawnPlatforms.length - 1; i >= 0; i--) {
        const platform = activeRespawnPlatforms[i];
        platform.update(dt);
        if (platform.removed) {
            activeRespawnPlatforms.splice(i, 1);
        }
    }
}

// Animation loop
let lastTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);

    // Delta time: normalize to dt=1 at 60fps so existing tuning values stay the same
    const deltaSeconds = Math.min((currentTime - lastTime) / 1000, 0.05); // cap to prevent spiral of death
    const dt = deltaSeconds * 60;
    lastTime = currentTime;

    if (koFocusTimer > 0) {
        koFocusTimer = Math.max(0, koFocusTimer - deltaSeconds);
    }

    let me = PLAYERS[0];

    // --- Respawn platform input check ---
    // If on a stopped respawn platform, any action triggers removal
    if (me && !me.isKOd && !me.eliminated && me.frameStun <= 0) {
        const onStopped = me.respawnPlatform && me.respawnPlatform.isStopped && !me.respawnPlatform.removing;
        const onDescending = me.respawning && me.respawnPlatform && me.respawnPlatform.isDescending;

        if (onStopped) {
            if (KEY["W"] || KEY["A"] || KEY["D"] || KEY["S"]) {
                me.respawnPlatform.triggerRemoval();
            }
        } else if (!onDescending && !me.respawning) {
            // Jump (instant impulse — not scaled by dt)
            if (KEY["W"] && !KEY_PREV["W"]) {
                if (me.isGrounded) {
                    me.isGrounded = false;
                    me.velocity.y = me.jumpHeight;
                } else if (me.canMidairJump) {
                    me.hasMidairJumped++;
                    me.velocity.y = me.midairJumpHeight;
                    if (me.hasMidairJumped >= me.midairJumps) {
                        me.canMidairJump = false;
                    }
                }
            }

            // Walking left and right with acceleration
            const isPressingA = !!KEY["A"];
            const isPressingD = !!KEY["D"];

            if (isPressingA || isPressingD) {
                // Most recently pressed key takes priority
                const timeA = KEY_PRESS_TIME["A"] ?? 0;
                const timeD = KEY_PRESS_TIME["D"] ?? 0;

                const targetVelocity = timeA > timeD ? -me.speed : me.speed;

                // Accelerate towards target velocity (scaled by dt)
                if (me.velocity.x < targetVelocity) {
                    me.velocity.x = Math.min(me.velocity.x + me.acceleration * dt, targetVelocity);
                } else if (me.velocity.x > targetVelocity) {
                    me.velocity.x = Math.max(me.velocity.x - me.acceleration * dt, targetVelocity);
                }
            } else {
                // Apply traction (deceleration) — frame-rate independent via pow
                if (Math.abs(me.velocity.x) > 0.01) {
                    me.velocity.x *= Math.pow(1 - (me.traction / 5), dt);
                } else {
                    me.velocity.x = 0;
                }
            }
        }
    }

    // Update previous key states for next frame
    for (let key in KEY) {
        KEY_PREV[key] = KEY[key];
    }

    for (let i = 0; i < fighters.length; i++) {
        fighters[i].update(dt);
    }

    // --- KO / Respawn / Particle systems ---
    checkKOBounds();
    updateRespawnTimers(dt);
    updateRespawnPlatforms(dt);
    updateParticles(dt);

    updateCamera();
    updateOffscreenIndicators();
    updateDamageMeters();   
    
    // Render main scene
    renderer.render(scene, camera);
    
    // Render off-screen indicators on top
    renderer.autoClear = false;
    renderer.render(indicatorScene, indicatorCamera);
    renderer.autoClear = true;
}

//////////// EVENT LISTENERS //////////////

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Update indicator camera
    indicatorCamera.left = -window.innerWidth / 2;
    indicatorCamera.right = window.innerWidth / 2;
    indicatorCamera.top = window.innerHeight / 2;
    indicatorCamera.bottom = -window.innerHeight / 2;
    indicatorCamera.updateProjectionMatrix();
});

// keyboard input for player controls
window.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();
    if (!KEY[key]) {
        KEY_PRESS_TIME[key] = Date.now(); // Record when key was first pressed
    }
    KEY[key] = true;
});
window.addEventListener('keyup', (event) => {
    const key = event.key.toUpperCase();
    KEY[key] = false;
    delete KEY_PRESS_TIME[key]; // Clear press time when key is released
});

//////////// exports //////////////
export default { scene, camera, renderer, fighters, platforms };

///////////// MAIN EXECUTION //////////////
setupGame();