import {platforms} from "../main.js";

export class Fighter {

    // Fighter geometry half-extents (from BoxGeometry(1, 2, 1))
    static HALF_SIZE = { x: 0.5, y: 1.0, z: 0.5 };

    // Fighter stats
    damage = 0;                   // Percentage damage accumulated
    stock = 6;                    // Number of lives (stocks) remaining (infinite for timed battles)
    score = 0;                    // Score (for score-based modes like timed battles)
    speed = 1.0;                  // Max walk speed
    acceleration = 0.15;          // How quickly the character accelerates
    jumpHeight = 2.5;             // Initial jump height
    midairJumpHeight = 2.3;       // Midair jump height
    midairJumps = 1;              // Number of midair jumps
    gravity = 5.0;                // Gravity strength
    maxFallSpeed = 8.0;           // Maximum fall speed
    traction = 1;                 // How quickly the character decelerates when no input
    
    // character info
    tag = "CPU";                  // CPU fighter or player (P1, P2, etc.)
    character = "Mario";          // Fighter used (e.g. Mario, Link, etc.)
    series = "Smash Bros";         // Series the fighter belongs to (e.g. Super Mario, Legend of Zelda, etc.)
    photoZoom = 180;              // Zoom level for character photo in damage meter (if needed)
    photoOffset = { x: 92, y: 0 };// Offset for character photo in damage meter (if needed)

    // 3D objects
    object = null;                // 3D model object for the fighter
    outline = null;               // Outline object for better visibility

    // character state
    isGrounded = false;
    canMidairJump = true;
    hasMidairJumped = 0;
    velocity = {
        x: 0.0,
        y: 0.0,
        z: 0.0
    }

    // KO and respawn state
    isKOd = false;                // True while KO'd and waiting to respawn
    respawning = false;           // True while on respawn platform (prevents magnifying glass)
    intangible = false;           // True during respawn (attacks pass through)
    frameStun = 0;                // Frames to freeze (for respawn platform removal)
    eliminated = false;           // True when all stocks are gone
    lastHitBy = null;             // Reference to the last fighter who landed a hit
    respawnPlatform = null;       // Reference to active respawn platform

    
    constructor(tag = "CPU", character = "Steve", position = {x: -8, y: 0}) {
        this.tag = tag;
        this.character = character;

        // Render block
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
        this.object = new THREE.Mesh(geometry, material);
        this.object.position.set(position.x, position.y, 0);

        // Add outline for better visibility
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const outline = new THREE.LineSegments(edges, lineMaterial);
        this.object.add(outline);
        this.outline = outline;

        if (this.character === "Mario") {
            this.series = "Mario";
            this.photoZoom = 220;
            this.photoOffset = { x: 5, y: 1 };
        } else if (this.character === "Steve") {
            this.series = "Minecraft";
            this.photoZoom = 180;
            this.photoOffset = { x: 92, y: 0 };
        }
    }

    update(dt = 1) {
        // Don't update if KO'd or eliminated
        if (this.isKOd || this.eliminated) return;

        // Handle frame stun (freeze frames for respawn platform removal)
        if (this.frameStun > 0) {
            this.frameStun--;
            if (this.frameStun === 0 && this.respawning) {
                this.respawning = false;
                this.intangible = false;
            }
            return;
        }

        // If respawning on platform, platform handles position
        if (this.respawning && this.respawnPlatform) return;

        // Apply gravity if not grounded (scaled by dt)
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * 0.02 * dt;
            // Clamp fall speed to terminal velocity
            if (this.velocity.y < -this.maxFallSpeed) {
                this.velocity.y = -this.maxFallSpeed;
            }
        }
        else {
            this.velocity.y = 0.0;
            this.canMidairJump = true;
            this.hasMidairJumped = 0;
        }

        // Move based on velocity (scaled by dt)
        this.object.position.x += this.velocity.x / 10 * dt;
        this.object.position.y += this.velocity.y / 10 * dt;
        this.object.position.z += this.velocity.z / 10 * dt;

        // Check for collision with platforms
        this.isGrounded = false;
        for (let platform of platforms) {
            if (this.checkCollision(platform)) {
                this.resolveCollision(platform);
            }
        }
    }

    checkCollision(platform) {
        // Get bounding boxes
        const fighterBounds = this.getWorldBounds();
        const platformBounds = this.getPlatformBounds(platform);

        // AABB collision detection
        return !(fighterBounds.max.x < platformBounds.min.x || 
                 fighterBounds.min.x > platformBounds.max.x ||
                 fighterBounds.max.y < platformBounds.min.y || 
                 fighterBounds.min.y > platformBounds.max.y ||
                 fighterBounds.max.z < platformBounds.min.z || 
                 fighterBounds.min.z > platformBounds.max.z);
    }

    getWorldBounds() {
        const pos = this.object.position;
        const h = Fighter.HALF_SIZE;
        return {
            min: { x: pos.x - h.x, y: pos.y - h.y, z: pos.z - h.z },
            max: { x: pos.x + h.x, y: pos.y + h.y, z: pos.z + h.z }
        };
    }

    getPlatformBounds(platform) {
        // Use cached bounds if available (platforms don't move)
        if (platform.bounds) return platform.bounds;

        const pos = platform.object.position;
        const scale = platform.object.scale;
        const geometry = platform.object.geometry;
        geometry.computeBoundingBox();
        const size = {
            x: (geometry.boundingBox.max.x - geometry.boundingBox.min.x) * scale.x,
            y: (geometry.boundingBox.max.y - geometry.boundingBox.min.y) * scale.y,
            z: (geometry.boundingBox.max.z - geometry.boundingBox.min.z) * scale.z
        };
        return {
            min: { x: pos.x - size.x / 2, y: pos.y - size.y / 2, z: pos.z - size.z / 2 },
            max: { x: pos.x + size.x / 2, y: pos.y + size.y / 2, z: pos.z + size.z / 2 }
        };
    }

    resolveCollision(platform) {
        const fighterBounds = this.getWorldBounds();
        const platformBounds = this.getPlatformBounds(platform);
        const h = Fighter.HALF_SIZE;

        // Calculate penetration depth from each side
        const overlapRight = fighterBounds.max.x - platformBounds.min.x; // fighter entered from left
        const overlapLeft  = platformBounds.max.x - fighterBounds.min.x; // fighter entered from right
        const overlapUp    = fighterBounds.max.y - platformBounds.min.y; // fighter entered from below
        const overlapDown  = platformBounds.max.y - fighterBounds.min.y; // fighter entered from above (landing)
        const overlapFront = fighterBounds.max.z - platformBounds.min.z;
        const overlapBack  = platformBounds.max.z - fighterBounds.min.z;

        // Minimum overlap per axis (smallest push needed)
        const xOverlap = Math.min(overlapRight, overlapLeft);
        const yOverlap = Math.min(overlapUp, overlapDown);
        const zOverlap = Math.min(overlapFront, overlapBack);

        // Resolve on the axis with smallest penetration (minimum translation distance)
        if (yOverlap <= xOverlap && yOverlap <= zOverlap) {
            if (overlapDown < overlapUp) {
                // Landing on top of platform
                this.object.position.y = platformBounds.max.y + h.y;
                this.velocity.y = 0;
                this.isGrounded = true;
                this.canMidairJump = true;
                this.hasMidairJumped = 0;
            } else {
                // Hitting platform from below
                this.object.position.y = platformBounds.min.y - h.y;
                this.velocity.y = 0;
            }
        } else if (xOverlap <= zOverlap) {
            if (overlapRight < overlapLeft) {
                this.object.position.x = platformBounds.min.x - h.x;
            } else {
                this.object.position.x = platformBounds.max.x + h.x;
            }
            this.velocity.x = 0;
        } else {
            if (overlapFront < overlapBack) {
                this.object.position.z = platformBounds.min.z - h.z;
            } else {
                this.object.position.z = platformBounds.max.z + h.z;
            }
            this.velocity.z = 0;
        }
    }
}