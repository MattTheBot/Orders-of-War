import * as THREE from 'three';

export class Unit {
    constructor(scene, type, position, color) {
        this.scene = scene;
        this.type = type; // 'tank' or 'infantry'
        this.position = position.clone();
        this.targetPosition = null;
        this.mesh = null;
        
        // Logic constraints
        if (type === 'tank') {
            this.maxSlope = 0.15; // Tanks can only handle very flat ground
            this.baseSpeed = 2.0;
            this.color = 0xffb3ba; // Pastel Red
        } else {
            this.maxSlope = 0.8; // Infantry can climb steeper
            this.baseSpeed = 4.0;
            this.color = 0xbae1ff; // Pastel Blue (if friendly) or Green
        }

        this.createMesh();
    }

    createMesh() {
        const geometry = this.type === 'tank' 
            ? new THREE.BoxGeometry(1.5, 0.8, 2.5) 
            : new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);

        const material = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.4,
            metalness: 0.1
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.copy(this.position);
        
        // Add a marker on top so we can see orientation
        const markerGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(0, 1, 0);
        marker.rotation.x = Math.PI / 2;
        this.mesh.add(marker);

        this.scene.add(this.mesh);
    }

    setTarget(position) {
        this.targetPosition = position.clone();
    }

    update(delta, terrain) {
        if (!this.targetPosition) return;

        const currentPos = this.mesh.position;
        const direction = new THREE.Vector3().subVectors(this.targetPosition, currentPos);
        direction.y = 0; // We only care about horizontal distance for movement

        const distance = direction.length();
        
        if (distance < 0.1) {
            this.targetPosition = null;
            return;
        }

        direction.normalize();

        // Calculate slope
        const targetHeight = terrain.getHeightAt(this.targetPosition.x, this.targetPosition.z);
        const currentHeight = terrain.getHeightAt(currentPos.x, currentPos.z);
        
        // Slope = rise / run
        const heightDiff = Math.abs(targetHeight - currentHeight);
        const slope = heightDiff / distance;

        // Terrain logic
        let speedMultiplier = 1.0;
        
        if (slope > this.maxSlope) {
            // Too steep! Stop moving.
            this.targetPosition = null;
            return;
        } else {
            // Slow down based on slope. The steeper it is, the slower.
            // Normalize slope against maxSlope
            speedMultiplier = 1.0 - (slope / this.maxSlope) * 0.8; // Max 80% speed reduction
        }

        // Move the unit
        const moveDistance = this.baseSpeed * speedMultiplier * delta;
        const moveStep = direction.multiplyScalar(Math.min(moveDistance, distance));
        
        currentPos.add(moveStep);
        
        // Snap Y to terrain height
        currentPos.y = terrain.getHeightAt(currentPos.x, currentPos.z);

        // Rotate to face movement direction
        const angle = Math.atan2(direction.x, direction.z);
        this.mesh.rotation.y = angle;
    }
}
