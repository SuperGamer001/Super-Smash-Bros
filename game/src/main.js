//////////// IMPORTS //////////////
import { Fighter } from "./classes/fighter.js";
import { Platform } from "./classes/platform.js";

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

// Camera boundaries (based on stage area)
const CAMERA_BOUNDS = {
    minX: -30,
    maxX: 30,
    minY: -20,
    maxY: 20
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
    fighters[1] = new Fighter("CPU", "Steve", {x: 8, y: 0});

    //// CPU Fighters ////
    for (let i = 0; i < 6; i++) {
        fighters.push(new Fighter("CPU", "Steve"));
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

    for (let fighter of fighters) {
        const pos = fighter.object.position;
        const size = 0.5; // Half-width/height of fighter
        minX = Math.min(minX, pos.x - size);
        maxX = Math.max(maxX, pos.x + size);
        minY = Math.min(minY, pos.y - size);
        maxY = Math.max(maxY, pos.y + size);
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

    const container = document.createElement('div');
    container.className = 'damage-meter';

    const damageCounter = document.createElement('div');
    damageCounter.className = 'damage-counter';
    container.appendChild(damageCounter);

    const fighterName = document.createElement('div');
    fighterName.className = 'fighter-name';
    fighterName.style.borderBottomColor = `#${hash}`;
    fighterName.textContent = fighter.character;
    container.appendChild(fighterName);

    const photoContainer = document.createElement('div');
    photoContainer.className = 'photo-container';
    photoContainer.style.backgroundColor = `#${hash}`;
    container.appendChild(photoContainer);

    const playerPhoto = document.createElement('div');
    playerPhoto.className = 'player-photo';
    playerPhoto.style.backgroundImage = `url('./src/img/fighter_profile/${fighter.character}.png')`;
    playerPhoto.style.backgroundRepeat = 'no-repeat';
    playerPhoto.style.backgroundSize = fighter.photoZoom + '%';
    playerPhoto.style.backgroundPosition = `${fighter.photoOffset.x}% ${fighter.photoOffset.y}%`;
    photoContainer.appendChild(playerPhoto);


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
        const worldPos = fighter.object.position;
        
        // Check if fighter is in camera view
        const fighterSphere = new THREE.Sphere(worldPos, 1);
        const isVisible = frustum.intersectsSphere(fighterSphere);
        
        if (!isVisible) {
            // Fighter is off screen - show indicator
            indicator.group.visible = true;

            // Damage fighter for being off-screen (e.g. 0.1% per frame)
            fighter.damage += 0.015;
            
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
        damageCounter.innerHTML = damageText.replace(/(\.\d)?%/, '<span class="damage-decimal">$1%</span>');
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

    let me = PLAYERS[0];

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

    // Update previous key states for next frame
    for (let key in KEY) {
        KEY_PREV[key] = KEY[key];
    }

    for (let i = 0; i < fighters.length; i++) {
        fighters[i].update(dt);
    }

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