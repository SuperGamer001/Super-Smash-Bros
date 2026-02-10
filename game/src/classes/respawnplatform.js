export class RespawnPlatform {
    object = null;
    edgeLines = null;
    fighter = null;
    scene = null;
    targetY = 0;
    startY = 0;
    isDescending = true;
    isStopped = false;
    countdownElapsed = 0;
    removed = false;
    removing = false;
    speed = 10.0;

    // Colors for each countdown second
    static COLORS = {
        descend: 0x000088,  // dark blue during descent
        5: 0x000088,        // dark blue
        4: 0x4488ff,        // light blue
        3: 0xffff00,        // yellow
        2: 0xff8800,        // orange
        1: 0xff0000,        // red
        0: 0x880000         // dark red
    };

    constructor(fighter, sceneRef, camera, cameraBounds) {
        this.fighter = fighter;
        this.scene = sceneRef;

        const centerX = (cameraBounds.minX + cameraBounds.maxX) / 2;

        this.targetY = cameraBounds.maxY - 15;
        this.startY = cameraBounds.maxY + 5;

        // Create platform mesh
        const geometry = new THREE.BoxGeometry(3, 0.3, 2);
        const material = new THREE.MeshPhongMaterial({
            color: RespawnPlatform.COLORS.descend,
            emissive: RespawnPlatform.COLORS.descend,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.9
        });
        this.object = new THREE.Mesh(geometry, material);
        this.object.position.set(centerX, this.startY, 0);

        // Add glowing edge lines
        const edges = new THREE.EdgesGeometry(geometry);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x4488ff });
        this.edgeLines = new THREE.LineSegments(edges, edgeMat);
        this.object.add(this.edgeLines);

        sceneRef.add(this.object);

        // Position fighter on platform
        fighter.object.position.set(centerX, this.startY + 0.15 + 1.0, 0);
        fighter.velocity.x = 0;
        fighter.velocity.y = 0;
        fighter.velocity.z = 0;
        fighter.isGrounded = true;
    }

    update(dt) {
        if (this.removed) return;

        // Descending phase
        if (this.isDescending) {
            const moveAmount = this.speed * (1 / 30) * dt;
            this.object.position.y -= moveAmount;

            // Lock fighter on platform during descent
            this.fighter.object.position.x = this.object.position.x;
            this.fighter.object.position.y = this.object.position.y + 0.15 + 1.0;
            this.fighter.velocity.x = 0;
            this.fighter.velocity.y = 0;
            this.fighter.isGrounded = true;

            if (this.object.position.y <= this.targetY) {
                this.object.position.y = this.targetY;
                this.fighter.object.position.y = this.targetY + 0.15 + 1.0;
                this.isDescending = false;
                this.isStopped = true;
                this.countdownElapsed = 0;
            }
        }

        // Stopped phase — countdown with color pulses
        if (this.isStopped && !this.removing) {
            this.countdownElapsed += (1 / 60) * dt;
            const remaining = Math.max(0, 5 - Math.floor(this.countdownElapsed));

            // Update platform color based on remaining time
            const colorHex = RespawnPlatform.COLORS[remaining] !== undefined
                ? RespawnPlatform.COLORS[remaining]
                : RespawnPlatform.COLORS[0];
            this.object.material.color.setHex(colorHex);
            this.object.material.emissive.setHex(colorHex);
            this.edgeLines.material.color.setHex(colorHex);

            // Pulse effect
            const pulsePhase = this.countdownElapsed % 1;
            this.object.material.emissiveIntensity = 0.2 + 0.5 * Math.abs(Math.sin(pulsePhase * Math.PI));
            this.object.material.opacity = 0.7 + 0.3 * Math.abs(Math.sin(pulsePhase * Math.PI));

            // Keep fighter locked on platform
            this.fighter.object.position.x = this.object.position.x;
            this.fighter.object.position.y = this.object.position.y + 0.15 + 1.0;
            this.fighter.velocity.x = 0;
            this.fighter.velocity.y = 0;
            this.fighter.isGrounded = true;

            // Auto-remove after 5 seconds
            if (this.countdownElapsed >= 5) {
                this.triggerRemoval();
            }
        }
    }

    /**
     * Trigger the 2-frame freeze + platform removal.
     * The platform disappears on the first freeze frame,
     * leaving the fighter airborne so their next action is aerial.
     */
    triggerRemoval() {
        if (this.removing || this.removed) return;
        this.removing = true;
        this.fighter.frameStun = 2;

        // Remove platform from scene (disappears on first freeze frame)
        this.scene.remove(this.object);
        this.removed = true;
        this.fighter.isGrounded = false;
        this.fighter.respawnPlatform = null;
    }
}
