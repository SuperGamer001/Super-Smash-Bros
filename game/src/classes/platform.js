export class Platform {
    object = null;  // 3D model object for the ground
    bounds = null;  // Cached AABB (platforms are static)

    constructor(size = {x: 30, y: 5, z: 15}, position = {x: 0, y: 0, z: 0}, color = 0x228822) {
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.MeshPhongMaterial({ color: color });
        this.object = new THREE.Mesh(geometry, material);
        this.object.position.set(position.x, position.y, position.z);

        // Pre-compute AABB since platforms never move
        this.bounds = {
            min: { x: position.x - size.x / 2, y: position.y - size.y / 2, z: position.z - size.z / 2 },
            max: { x: position.x + size.x / 2, y: position.y + size.y / 2, z: position.z + size.z / 2 }
        };
    }
}