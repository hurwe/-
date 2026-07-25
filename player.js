import { THREE } from './game.js';

const GRAVITY = -22;
const JUMP_FORCE = 8.2;
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.6;
const SWIM_SPEED = 3.2;
const EYE_HEIGHT = 1.65;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;

    this.position = new THREE.Vector3(0, 30, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.08;

    this.onGround = false;
    this.inWater = false;
    this.sprinting = false;

    // vitals
    this.health = 100;
    this.stamina = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.alive = true;

    // input state (set externally by touch controls)
    this.moveVec = { x: 0, y: 0 }; // joystick
    this.lookDelta = { x: 0, y: 0 };
    this.wantJump = false;

    this.radius = 0.4;

    // find initial spawn height
    const h = world.getHeightAt(0, 0);
    this.position.set(0, h + 5, 0);
  }

  respawn() {
    this.health = 100; this.stamina = 100; this.hunger = 80; this.thirst = 80;
    this.alive = true;
    const h = this.world.getHeightAt(this.spawnX || 0, this.spawnZ || 0);
    this.position.set(this.spawnX || 0, h + 3, this.spawnZ || 0);
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    if (!this.alive) return;

    // apply look delta
    this.yaw -= this.lookDelta.x * 0.0028;
    this.pitch -= this.lookDelta.y * 0.0028;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.lookDelta.x = 0; this.lookDelta.y = 0;

    const groundH = this.world.getHeightAt(this.position.x, this.position.z);
    this.inWater = this.position.y < groundH + 1.0 && groundH < 1.2 + 0.6 && this.position.y < 1.2 + 0.9;

    // movement direction relative to yaw
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const mx = this.moveVec.x, my = this.moveVec.y;
    const moveLen = Math.min(1, Math.sqrt(mx * mx + my * my));

    let speed = this.sprinting && this.stamina > 1 && moveLen > 0.1 ? SPRINT_SPEED : WALK_SPEED;
    if (this.inWater) speed = SWIM_SPEED;

    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -my);
    moveDir.addScaledVector(right, mx);
    if (moveDir.lengthSq() > 0) moveDir.normalize().multiplyScalar(speed * moveLen);

    this.velocity.x = moveDir.x;
    this.velocity.z = moveDir.z;

    // stamina drain/regen
    if (this.sprinting && moveLen > 0.1 && this.onGround) {
      this.stamina = Math.max(0, this.stamina - dt * 14);
      if (this.stamina <= 0) this.sprinting = false;
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 8);
    }

    // gravity / jump / swim
    if (this.inWater) {
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, this.wantJump ? 2.2 : -0.6, dt * 3);
    } else {
      this.velocity.y += GRAVITY * dt;
      if (this.wantJump && this.onGround) {
        this.velocity.y = JUMP_FORCE;
        this.onGround = false;
        this.stamina = Math.max(0, this.stamina - 8);
      }
    }
    this.wantJump = false;

    // integrate
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // ground collision
    const newGroundH = this.world.getHeightAt(this.position.x, this.position.z);
    const feetY = this.position.y;
    if (feetY <= newGroundH) {
      this.position.y = newGroundH;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (feetY <= newGroundH + 0.12) {
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // vitals drain
    this.hunger = Math.max(0, this.hunger - dt * 0.045);
    this.thirst = Math.max(0, this.thirst - dt * 0.065);
    if (this.hunger <= 0 || this.thirst <= 0) {
      this.health = Math.max(0, this.health - dt * 1.2);
    } else if (this.hunger > 60 && this.thirst > 60 && this.health < 100) {
      this.health = Math.min(100, this.health + dt * 0.6);
    }
    if (feetY < -30) this.health = 0; // fell into void safety
    if (this.health <= 0) this.alive = false;

    // camera sync
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  getForwardVector() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }
}
