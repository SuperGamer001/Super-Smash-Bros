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

export var fighters = []; // Array to hold all fighters in the game
export var platforms = []; // Array to hold all ground platforms in the game
const PLAYERS = [] // Fighters that are player-controlled (not CPU)
const KEY = {}; // Object to track key states
const KEY_PREV = {}; // Object to track previous frame's key states
const KEY_PRESS_TIME = {}; // Object to track when each key was pressed
const PlayerColors = [0xcc0000, 0x0000cc, 0xcccc00, 0x00cc00, 0xcc8800, 0x7070ff, 0x880088, 0x555555, 0x00dd99, 0x884400]; // Colors for player fighters

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
    // for (let i = 0; i < 500; i++) {
    //     fighters.push(new Fighter("CPU", "Steve"));
    // }

    for (let i = 0; i < fighters.length; i++) {
        if (fighters[i].tag !== "CPU") {
            let player = parseInt(fighters[i].tag.replace("P", "")) - 1; // Extract player number from tag
            fighters[i].object.material.color.set(PlayerColors[player]);
            PLAYERS[PLAYERS.length] = fighters[i];
        }
        scene.add(fighters[i].object);  
    }

    // Initialize key states
    KEY_PREV["W"] = false;
    
    platforms[0] = new Platform({x: 30, y: 5, z: 15}, {x: 0, y: -5.5, z: -5}, 0x118811);

    for (let i = 0; i < platforms.length; i++) {
        scene.add(platforms[i].object);
    }

    console.log('Game setup complete');

    animate();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    let me = PLAYERS[0];

    // Reset jump flag each frame
    me.hasJumpedThisFrame = false;

    // Move player fighters according to input (only trigger jump on key press, not hold)
    if (KEY["W"] == true && KEY_PREV["W"] == false && !me.hasJumpedThisFrame) {
        if (me.isGrounded == true) {
            me.isGrounded = false;
            me.velocity.y = me.jumpHeight;
            me.hasJumpedThisFrame = true;
            console.log("Jump!");
        }
        else if (me.canMidairJump == true) {
            me.hasMidairJumped++;
            me.velocity.y = me.midairJumpHeight;
            me.hasJumpedThisFrame = true;
            if (me.hasMidairJumped >= me.midairJumps) {
                me.canMidairJump = false;
            }
            console.log("Midair Jump!");
        }
    }

    // Walking left and right with acceleration
    const isPressingA = KEY["A"] == true;
    const isPressingD = KEY["D"] == true;
    
    if (isPressingA || isPressingD) {
        // Determine which direction based on which key was pressed first
        const timeA = KEY_PRESS_TIME["A"] ?? Infinity;
        const timeD = KEY_PRESS_TIME["D"] ?? Infinity;
        
        const targetVelocity = timeA < timeD ? -me.speed : me.speed;
        
        // Accelerate towards target velocity
        if (me.velocity.x < targetVelocity) {
            me.velocity.x = Math.min(me.velocity.x + me.acceleration, targetVelocity);
        } else if (me.velocity.x > targetVelocity) {
            me.velocity.x = Math.max(me.velocity.x - me.acceleration, targetVelocity);
        }
    } else {
        // Apply traction (deceleration) when no movement keys pressed
        if (Math.abs(me.velocity.x) > 0.01) {
            me.velocity.x *= 1 - (me.traction / 5);
        } else {
            me.velocity.x = 0;
        }
    }

    // Update previous key states for next frame
    for (let key in KEY) {
        KEY_PREV[key] = KEY[key];
    }

    for (let i = 0; i < fighters.length; i++) {
        fighters[i].update();
    }
    
    renderer.render(scene, camera);
}

//////////// EVENT LISTENERS //////////////

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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