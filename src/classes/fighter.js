import {platforms} from "../main.js";

export class Fighter {

    // Fighter stats
    damage = 0.0;               // Percentage damage accumulated
    stock = Infinity;           // Number of lives (stocks) remaining (infinite for timed battles)
    speed = 1.0;                // Max walk speed
    acceleration = 0.15;        // How quickly the character accelerates
    jumpHeight = 2.5;           // Initial jump height
    midairJumpHeight = 2;     // Midair jump height
    midairJumps = 5;            // Number of midair jumps
    fallSpeed = 5.0;            // Max fall speed
    traction = 1;             // How quickly the character decelerates when no input
    
    // character info
    tag = "CPU";                // CPU fighter or player (P1, P2, etc.)
    character = "Steve";        // Fighter used (e.g. Mario, Link, etc.)
    object = null;              // 3D model object for the fighter
    outline = null;             // Outline object for better visibility

    // character state
    isGrounded = false;
    canMidairJump = true;
    hasMidairJumped = 0;
    hasJumpedThisFrame = false;
    velocity = {
        x: 0.0,
        y: 0.0,
        z: 0.0
    }

    
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

    }

    update() {
        // Apply gravity if not grounded
        if (!this.isGrounded) {
            this.velocity.y -= this.fallSpeed * 0.02;
        }
        else {
            this.velocity.y = 0.0;
            this.canMidairJump = true; // Reset midair jump when grounded
            this.hasMidairJumped = 0;
        }

        // move based on velocity
        this.object.position.x += this.velocity.x / 10;
        this.object.position.y += this.velocity.y / 10;
        this.object.position.z += this.velocity.z / 10;

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
        const size = { x: 1, y: 2, z: 1 }; // Fighter BoxGeometry size
        return {
            min: { x: pos.x - size.x / 2, y: pos.y - size.y / 2, z: pos.z - size.z / 2 },
            max: { x: pos.x + size.x / 2, y: pos.y + size.y / 2, z: pos.z + size.z / 2 }
        };
    }

    getPlatformBounds(platform) {
        const pos = platform.object.position;
        const scale = platform.object.scale;
        // Get the platform's geometry to access its size
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

        // Reset mid-air jump when landing
        if (fighterBounds.min.y >= platformBounds.max.y - 0.1) {
            this.canMidairJump = true;
            this.hasMidairJumped = 0;
        }

        // Determine collision direction (which side the fighter hit)
        const overlaps = {
            top: fighterBounds.min.y < platformBounds.max.y && this.velocity.y < 0,
            bottom: fighterBounds.max.y > platformBounds.min.y && this.velocity.y > 0,
            left: fighterBounds.max.x > platformBounds.min.x && this.velocity.x > 0,
            right: fighterBounds.min.x < platformBounds.max.x && this.velocity.x < 0,
            front: fighterBounds.max.z > platformBounds.min.z && this.velocity.z < 0,
            back: fighterBounds.min.z < platformBounds.max.z && this.velocity.z > 0
        };

        // Find the direction with least overlap to resolve
        const yOverlap = Math.min(
            Math.abs(fighterBounds.max.y - platformBounds.min.y),
            Math.abs(platformBounds.max.y - fighterBounds.min.y)
        );
        const xOverlap = Math.min(
            Math.abs(fighterBounds.max.x - platformBounds.min.x),
            Math.abs(platformBounds.max.x - fighterBounds.min.x)
        );
        const zOverlap = Math.min(
            Math.abs(fighterBounds.max.z - platformBounds.min.z),
            Math.abs(platformBounds.max.z - fighterBounds.min.z)
        );

        // Resolve collision on the axis with smallest overlap
        if (yOverlap < xOverlap && yOverlap < zOverlap) {
            // Collision on Y axis
            if (overlaps.top && this.velocity.y < 0) {
                this.object.position.y = platformBounds.max.y + 1;
                this.velocity.y = 0;
                this.isGrounded = true;
                this.canMidairJump = true;
                this.hasMidairJumped = 0;
            } else if (overlaps.bottom && this.velocity.y > 0) {
                this.object.position.y = platformBounds.min.y - 1;
                this.velocity.y = 0;
            }
        } else if (xOverlap < zOverlap) {
            // Collision on X axis
            if (overlaps.left && this.velocity.x > 0) {
                this.object.position.x = platformBounds.min.x - 0.5;
                this.velocity.x = 0;
            } else if (overlaps.right && this.velocity.x < 0) {
                this.object.position.x = platformBounds.max.x + 0.5;
                this.velocity.x = 0;
            }
        } else {
            // Collision on Z axis
            if (overlaps.front && this.velocity.z < 0) {
                this.object.position.z = platformBounds.max.z + 0.5;
                this.velocity.z = 0;
            } else if (overlaps.back && this.velocity.z > 0) {
                this.object.position.z = platformBounds.min.z - 0.5;
                this.velocity.z = 0;
            }
        }
    }
}