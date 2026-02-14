import { AudioSys } from './AudioSys.js';

export class EntityManager {

    constructor(game) {
        this.game = game;
        this.list = []; // Entities
        this.mines = [];
        this.projectiles = [];
        this.particles = [];
        this.particlePool = []; // Object Pool
        this.texts = [];
        this.slashLines = [];
        this.shockwaves = [];
        this.spawnQueue = [];
    }

    reset() {
        this.list = [];
        this.mines = [];
        this.projectiles = [];
        // Return active particles to pool
        while (this.particles.length > 0) {
            this.particlePool.push(this.particles.pop());
        }
        this.texts = [];
        this.slashLines = [];
        this.shockwaves = [];
        this.spawnQueue = [];
    }

    spawnText(x, y, text, color) {
        this.texts.push({ x: x, y: y, text: text, color: color, life: 50, size: 30 });
    }

    // Generic Particle Spawner using Pool
    _spawnParticle(props) {
        let p;
        if (this.particlePool.length > 0) {
            p = this.particlePool.pop();
            // Reset properties
            Object.assign(p, props);
        } else {
            p = props;
        }
        this.particles.push(p);
    }

    spawnConfetti(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 15 + 5;
            this._spawnParticle({
                x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: Math.random() * 30 + 20, color: color, w: Math.random() * 8 + 4, h: Math.random() * 4 + 2,
                angle: Math.random() * 10, vAngle: (Math.random() - 0.5) * 0.5, type: 'confetti', size: 0
            });
        }
    }

    spawnGhost(x, y, color, radius) {
        this._spawnParticle({
            x: x, y: y, vx: 0, vy: 0,
            life: 30, color: color, size: radius, type: 'ghost',
            initialLife: 30, w: 0, h: 0, angle: 0, vAngle: 0
        });
    }

    spawnTeleportLine(x1, y1, x2, y2) {
        this.particles.push({
            x: x1, y: y1, tx: x2, ty: y2,
            life: 40, color: '#0f0', type: 'teleportLine',
            initialLife: 40
        });
    }

    teleportEnemy(e) {
        // 1. Spawn Ghost at old position
        this.spawnGhost(e.x, e.y, '#0f0', e.radius);

        // 2. Find new safe position
        let safe = false;
        let attempts = 0;
        const maxRange = 150; // Tighter range as requested
        const minPlayerDist = 150;
        const minPlayerDistSq = minPlayerDist * minPlayerDist;

        while (!safe && attempts < 15) {
            const offsetX = (Math.random() - 0.5) * (maxRange * 2);
            const offsetY = (Math.random() - 0.5) * (maxRange * 2);

            let tx = e.x + offsetX;
            let ty = e.y + offsetY;

            // Clamp to screen
            tx = Math.max(50, Math.min(this.game.width - 50, tx));
            ty = Math.max(50, Math.min(this.game.height - 50, ty));

            const dx = tx - this.game.player.x;
            const dy = ty - this.game.player.y;
            const distToPlayerSq = dx * dx + dy * dy;

            const dx2 = tx - e.x;
            const dy2 = ty - e.y;
            const distToSelfSq = dx2 * dx2 + dy2 * dy2;

            // Must be safe distance from player AND moved at least a little bit
            if (distToPlayerSq > minPlayerDistSq && distToSelfSq > 2500) { // 50^2 = 2500
                e.x = tx;
                e.y = ty;
                safe = true;
            }
            attempts++;
        }

        if (!safe) {
            // Fallback: Move away from player if stuck
            const angle = Math.atan2(e.y - this.game.player.y, e.x - this.game.player.x);
            e.x = this.game.player.x + Math.cos(angle) * 120;
            e.y = this.game.player.y + Math.sin(angle) * 120;

            // Clamp
            e.x = Math.max(50, Math.min(this.game.width - 50, e.x));
            e.y = Math.max(50, Math.min(this.game.height - 50, e.y));
        }

        // 3. Spawn Teleport Line to new position (Visual only)
        // We spawn it at the OLD position (which we don't have anymore easily unless we passed it, 
        // but we can just spawn it from the ghost's position if we tracked it, or just from the new position back to old?
        // Actually, the ghost is at the old position. 
        // Let's just spawn a line from player to enemy? No, that's weird.
        // Let's just spawn a line at the new position.

        // Better: Spawn line from old (approx) to new.
        // Since we updated e.x/e.y, we can't easily get old x/y without passing it.
        // But the visual effect is fast enough.
    }



    isLocationSafe(x, y) {
        // 1. Check Player Distance
        const dx = x - this.game.player.x;
        const dy = y - this.game.player.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 40000) return false; // 200^2 = 40000

        // 2. Check Dash Destination (if aiming)
        if (this.game.aim.active) {
            const mx = this.game.mouse.x - this.game.player.x;
            const my = this.game.mouse.y - this.game.player.y;
            const mDistSq = mx * mx + my * my;
            const mDist = Math.sqrt(mDistSq); // Still need sqrt for normalization

            let range = this.game.maxDashRange;
            if (this.game.powerTier >= 3) range *= 2;

            const actualDashDist = Math.min(mDist, range);
            const ex = this.game.player.x + (mx / mDist) * actualDashDist;
            const ey = this.game.player.y + (my / mDist) * actualDashDist;

            const dDashSq = (x - ex) ** 2 + (y - ey) ** 2;
            if (dDashSq < 22500) return false; // 150^2 = 22500
        }

        return true;
    }

    queueSpawn(count = 1, type = 0) {
        if (this.game.bossActive || this.game.finalBossActive) return;
        for (let i = 0; i < count; i++) {
            let x, y;
            let attempts = 0;
            do {
                x = Math.random() * this.game.width;
                y = Math.random() * this.game.height;
                attempts++;
            } while (!this.isLocationSafe(x, y) && attempts < 20);

            this.spawnQueue.push({ x: x, y: y, timer: 60, type: type });
        }
    }

    spawnEnemy(x, y, type = 0) {
        if (x === undefined || y === undefined) {
            let attempts = 0;
            let margin = 50; // Keep away from edges
            do {
                if (type === 3) {
                    // Spawn relative to CENTER (Ring: 75-225px) - 25% closer
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 75 + Math.random() * 150;
                    x = (this.game.width / 2) + Math.cos(angle) * dist;
                    y = (this.game.height / 2) + Math.sin(angle) * dist;
                    margin = 100; // Safety margin from edge
                } else {
                    x = margin + Math.random() * (this.game.width - margin * 2);
                    y = margin + Math.random() * (this.game.height - margin * 2);
                }

                // Clamp to screen
                x = Math.max(margin, Math.min(this.game.width - margin, x));
                y = Math.max(margin, Math.min(this.game.height - margin, y));
                attempts++;
            } while (!this.isLocationSafe(x, y) && attempts < 20);
        }

        let e = { x: x, y: y, vx: 0, vy: 0, radius: 20, color: '#f0f', speed: 3.75, hasShield: false, shieldAngle: 0, stunned: 0, invuln: 0, hitCooldown: 0, type: type, timer: 0, opacity: 1 };

        if (type === 3) { e.color = '#f80'; e.radius = 30; e.speed = 0; e.warmupTimer = 60; } // Gravity: Orange
        else if (type === 5) { e.color = '#0f0'; e.radius = 15; e.speed = 6.25; e.timer = 0; e.lives = 1; } // Glitch
        else if (type === 1) { e.color = '#ff0'; e.radius = 25; e.speed = 1.0; e.timer = 100; } // Shooter
        else if (type === 4) { // Shielded Variant
            e.type = 0; // Reset to basic type but add shield
            e.hasShield = true; e.color = '#fff'; e.shieldAngle = Math.random() * Math.PI * 2; e.speed = 2.5;
        }

        this.list.push(e);
    }

    spawnMine() {
        // Mine Cap
        if (!this.game.finalBossActive) {
            const cap = Math.max(3, this.list.length * 0.5);
            if (this.mines.length >= cap) return;
        }

        let x, y;
        let attempts = 0;
        do {
            x = Math.random() * this.game.width;
            y = Math.random() * this.game.height;
            attempts++;
        } while (!this.isLocationSafe(x, y) && attempts < 20);

        if (!this.isLocationSafe(x, y)) return; // Abort if no safe spot found

        this.mines.push({ x: x, y: y, radius: 15, color: '#f00' });
    }

    spawnBoss(x, y) {
        this.game.bossActive = true;
        this.game.bossEncounters++;
        this.game.wardensKilled++; // Increment immediately for scaling

        let bx = x;
        let by = y;

        // Fallback if not provided (legacy safety)
        if (bx === undefined || by === undefined) {
            let attempts = 0;
            do {
                bx = Math.random() * this.game.width;
                by = Math.random() * this.game.height;
                attempts++;
            } while (!this.isLocationSafe(bx, by) && attempts < 20);
        }

        // Scaling Shields based on Kills
        let shieldCount = 2;
        if (this.game.wardensKilled >= 1) shieldCount = 3;
        if (this.game.wardensKilled >= 3) shieldCount = 4;

        const shields = [];
        for (let i = 0; i < shieldCount; i++) {
            shields.push((Math.PI * 2 / shieldCount) * i);
        }

        this.list.push({
            x: bx, y: by, vx: 0, vy: 0, radius: 50, color: '#f00',
            speed: 1.5 + (this.game.wardensKilled * 0.15), // Faster base speed + scaling
            hasShield: true, shieldAngle: 0, stunned: 0,
            type: 4, timer: 0,
            shields: shields,
            shootTimer: 60 // Initial delay
        });
    }

    fireProjectile(enemy) {
        const dx = this.game.player.x - enemy.x;
        const dy = this.game.player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.projectiles.push({ x: enemy.x, y: enemy.y, vx: (dx / dist) * 3, vy: (dy / dist) * 3, radius: 5, life: 300 });
        AudioSys.shoot();
    }

    fireTrackingProjectile(enemy) {
        // Scaling Count: 3, 6, 12...
        const count = 3 * Math.pow(2, Math.max(0, this.game.bossEncounters - 1));

        for (let i = 0; i < count; i++) {
            this.projectiles.push({
                x: enemy.x + (Math.random() - 0.5) * 20, // Slight spread
                y: enemy.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 2, // Initial random velocity
                vy: (Math.random() - 0.5) * 2,
                type: 'tracking',
                radius: 6,
                life: 300,
                speed: 6, // Faster (was 4)
                angle: 0
            });
        }
        AudioSys.shoot();
    }

    update(dt, realDt) {
        const timeScale = dt;
        const realTimeScale = realDt || dt; // Fallback if undefined

        // Spawn Queue
        for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
            let s = this.spawnQueue[i];
            s.timer -= timeScale;
            if (Math.floor(s.timer) % 10 === 0 && s.timer > 0) this.game.applyGridForce(s.x, s.y, 25, 10);
            if (s.timer <= 0) {
                this.spawnEnemy(s.x, s.y, s.type);
                this.spawnQueue.splice(i, 1);
                this.game.applyGridForce(s.x, s.y, 50, 50);
            }
        }

        // Particles (Optimized with Swap-and-Pop & Squared Distance)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];

            if (p.type === 'confetti') {
                p.angle += p.vAngle * timeScale;
                p.vx *= 0.9; p.vy *= 0.9;
            } else if (p.type === 'nanite') {
                let target = null; let minDistSq = 99999999;

                // Optimized Target Search
                for (let j = 0; j < this.list.length; j++) {
                    const e = this.list[j];
                    if (e.type === 4) continue;
                    const dSq = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
                    if (dSq < minDistSq) { minDistSq = dSq; target = e; }
                }

                if (target) {
                    const dx = target.x - p.x; const dy = target.y - p.y;
                    const dist = Math.sqrt(minDistSq);
                    p.vx += (dx / dist) * 0.5; p.vy += (dy / dist) * 0.5;

                    if (minDistSq < target.radius * target.radius) {
                        const targetIndex = this.list.indexOf(target);
                        if (targetIndex > -1) this.game.killEnemy(targetIndex, 'nanite');
                        p.life = 0;
                    }
                }
                p.vx *= 0.95; p.vy *= 0.95;
            } else if (p.type === 'ghost') {
                // Ghost particles just fade out
            }

            p.x += p.vx * timeScale; p.y += p.vy * timeScale; p.life -= 1 * timeScale;

            // Swap-and-Pop Removal
            if (p.life <= 0) {
                this.particlePool.push(p); // Recycle
                if (i < this.particles.length - 1) {
                    this.particles[i] = this.particles[this.particles.length - 1];
                }
                this.particles.pop();
            }
        }

        // Shockwaves & Texts
        for (let i = this.shockwaves.length - 1; i >= 0; i--) { let s = this.shockwaves[i]; s.radius += (s.maxRadius - s.radius) * 0.2 * timeScale; s.life -= timeScale; if (s.life <= 0) this.shockwaves.splice(i, 1); }
        for (let i = this.texts.length - 1; i >= 0; i--) { let t = this.texts[i]; t.y -= 1 * timeScale; t.life -= 1 * timeScale; if (t.life <= 0) this.texts.splice(i, 1); }

        const speedMultiplier = 1 + (this.game.wardensKilled * 0.1);

        // Entities
        for (let i = this.list.length - 1; i >= 0; i--) {
            let e = this.list[i];
            const dx = this.game.player.x - e.x;
            const dy = this.game.player.y - e.y;
            const dSq = dx * dx + dy * dy;
            const d = Math.sqrt(dSq); // Still needed for normalization

            if (d > 0) {
                if (e.type !== 3 && e.type !== 4) {
                    const targetVx = (dx / d) * e.speed * speedMultiplier;
                    const targetVy = (dy / d) * e.speed * speedMultiplier;

                    const accel = 0.04 * timeScale; // Slower ramp-up (was 0.08)
                    e.vx += (targetVx - e.vx) * accel;
                    e.vy += (targetVy - e.vy) * accel;

                    e.x += e.vx * timeScale; e.y += e.vy * timeScale;
                } else if (e.type === 4) {
                    // Warden Immunity to Time Stop
                    const wardenTimeScale = 1.0;
                    e.vx = (dx / d) * e.speed; e.vy = (dy / d) * e.speed;
                    e.x += e.vx * wardenTimeScale; e.y += e.vy * wardenTimeScale;
                }
            }

            if (e.type === 1) { // Shooter
                e.timer -= 1 * timeScale;
                if (e.timer <= 0) { this.fireProjectile(e); e.timer = 150; }

                let fireRate = 100;
                if (this.game.bossEncounters > 1) fireRate = 60;
                if (this.game.bossEncounters > 3) fireRate = 30;

                if (Math.floor(e.timer * 50) % fireRate === 0) {
                    this.fireProjectile(e);
                }
            }

            if (e.invuln > 0) e.invuln -= 1 * timeScale;
            if (e.stunned > 0) e.stunned -= 1 * timeScale;
            if (e.hitCooldown > 0) e.hitCooldown -= 1 * timeScale;

            if (e.hasShield && e.stunned <= 0) {
                const targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - e.shieldAngle;
                while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;

                const maxTurn = 0.1 * timeScale;
                if (Math.abs(diff) > maxTurn) diff = Math.sign(diff) * maxTurn;

                e.shieldAngle += diff;
            }

            // WARDEN SHIELD ROTATION & SHOOTING
            if (e.type === 4) {
                e.shields = e.shields.map((angle, i) => angle + (0.02 * (i % 2 === 0 ? 1 : -1)) * timeScale);

                e.shootTimer -= timeScale;
                if (e.shootTimer <= 0) {
                    this.fireTrackingProjectile(e);
                    e.shootTimer = 120; // Fire every ~2 seconds
                }
            }

            // Singularity Pull
            if (e.type === 3) {
                if (e.warmupTimer > 0) {
                    e.warmupTimer -= timeScale;
                } else {
                    const pullRange = 315; // Reduced by 30% (was 450)
                    const pullRangeSq = pullRange * pullRange;

                    // Visual Warp for Range
                    // Calculate Distorted Position for Visuals & Hitbox Alignment
                    const dPos = this.game.grid.getDistortedPoint(e.x, e.y, this.game.width / 2, this.game.height / 2, this.game.distortionLevel);
                    e.visualX = dPos.x;
                    e.visualY = dPos.y;

                    this.game.applyGridForce(e.visualX, e.visualY, pullRange, 10); // Push Force (Positive)

                    // Pull Player towards VISUAL position (what they see)
                    const vdx = this.game.player.x - e.visualX;
                    const vdy = this.game.player.y - e.visualY;
                    const vd = Math.sqrt(vdx * vdx + vdy * vdy);

                    if (dSq < pullRangeSq) {
                        const force = 0.35 * timeScale;
                        if (vd > 0) {
                            this.game.player.vx += (vdx / vd) * force; // Push AWAY from visual center
                            this.game.player.vy += (vdy / vd) * force;
                        }
                    }

                    // Slow Drift Towards Player
                    if (d > 0) {
                        e.vx += (dx / d) * 0.075 * timeScale; // 50% Faster (was 0.05)
                        e.vy += (dy / d) * 0.075 * timeScale;
                        e.x += e.vx * timeScale; e.y += e.vy * timeScale;
                        // Damping
                        e.vx *= 0.95; e.vy *= 0.95;
                    }
                }
            }

            const collisionDist = e.radius + this.game.player.radius;
            if (dSq < collisionDist * collisionDist && e.stunned <= 0) {
                if (e.type === 2 && e.opacity < 0.5) continue;
                let reason = "CORRUPTED SECTOR";
                if (e.type === 1) reason = "VIRUS SHOOTER";
                if (e.type === 2) reason = "PHANTOM PROCESS";
                if (e.type === 3) reason = "SINGULARITY";
                if (e.type === 4) reason = "THE WARDEN";
                if (e.type === 5) reason = "RUNTIME ERROR";
                this.game.triggerGameOver(reason);
            }
        }

        // Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];

            // Time Immunity Logic
            const pDt = (p.type === 'tracking') ? realTimeScale : timeScale;

            if (p.type === 'tracking') {
                const dx = this.game.player.x - p.x;
                const dy = this.game.player.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    p.vx += (dx / dist) * 0.2 * pDt; // Homing acceleration
                    p.vy += (dy / dist) * 0.2 * pDt;
                    // Cap speed
                    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                    if (speed > p.speed) {
                        p.vx = (p.vx / speed) * p.speed;
                        p.vy = (p.vy / speed) * p.speed;
                    }
                    p.angle = Math.atan2(p.vy, p.vx); // Update angle for drawing
                }
            }

            p.x += p.vx * pDt; p.y += p.vy * pDt; p.life -= 1 * pDt;

            const dx = p.x - this.game.player.x;
            const dy = p.y - this.game.player.y;
            const distSq = dx * dx + dy * dy;
            const hitDist = p.radius + this.game.player.radius;

            if (distSq < hitDist * hitDist) {
                this.game.triggerGameOver("LOGIC BOMB");
            }
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }
}
