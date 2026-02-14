import { AudioSys } from './AudioSys.js';

export class EntityManager {
    constructor(game) {
        this.game = game;
        this.list = []; // Entities
        this.mines = [];
        this.projectiles = [];
        this.particles = [];
        this.texts = [];
        this.slashLines = [];
        this.shockwaves = [];
        this.spawnQueue = [];
    }

    reset() {
        this.list = [];
        this.mines = [];
        this.projectiles = [];
        this.particles = [];
        this.texts = [];
        this.slashLines = [];
        this.shockwaves = [];
        this.spawnQueue = [];
    }

    spawnText(x, y, text, color) {
        this.texts.push({ x: x, y: y, text: text, color: color, life: 50, size: 30 });
    }

    spawnConfetti(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 15 + 5;
            this.particles.push({
                x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: Math.random() * 30 + 20, color: color, w: Math.random() * 8 + 4, h: Math.random() * 4 + 2,
                angle: Math.random() * 10, vAngle: (Math.random() - 0.5) * 0.5, type: 'confetti'
            });
        }
    }

    spawnPickup(x, y, type) {
        // Types: 'explosion', 'range', 'echo', 'phase', 'nanites', 'voltage'
        let color = '#fff';
        if (type === 'explosion') color = '#f80'; // Orange
        if (type === 'range') color = '#fff'; // White
        if (type === 'echo') color = '#0ff'; // Cyan
        if (type === 'phase') color = '#f0f'; // Magenta
        if (type === 'nanites') color = '#0f0'; // Green
        if (type === 'voltage') color = '#ff0'; // Yellow

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;

        this.particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 600, // 10 seconds
            color: color,
            size: 6, // Larger than data
            type: 'pickup',
            pickupType: type
        });
    }

    queueSpawn(count = 1) {
        if (this.game.bossActive || this.game.finalBossActive) return;
        for (let i = 0; i < count; i++) {
            let x, y, d;
            do {
                x = Math.random() * this.game.width;
                y = Math.random() * this.game.height;
                const dx = x - this.game.player.x;
                const dy = y - this.game.player.y;
                d = Math.sqrt(dx * dx + dy * dy);
            } while (d < 200);
            this.spawnQueue.push({ x: x, y: y, timer: 60 });
        }
    }

    spawnEnemy(x, y) {
        const rand = Math.random();
        let e = { x: x, y: y, vx: 0, vy: 0, radius: 20, color: '#f0f', speed: 2, hasShield: false, shieldAngle: 0, stunned: 0, type: 0, timer: 0, opacity: 1 };

        if (rand > 0.9) { e.type = 3; e.color = '#a0f'; e.radius = 30; e.speed = 0; e.warmupTimer = 60; } // Gravity: Purple
        else if (rand > 0.8) { e.type = 5; e.color = '#0f0'; e.radius = 15; e.speed = 4; e.timer = 0; e.lives = 2; } // Glitch: Green
        else if (rand > 0.65) { e.type = 1; e.color = '#ff0'; e.radius = 25; e.speed = 0.5; e.timer = 100; } // Shooter: Yellow
        else if (rand > 0.45) { e.hasShield = true; e.color = '#fff'; e.shieldAngle = Math.random() * Math.PI * 2; e.speed = 1.5; } // Shielded

        this.list.push(e);
    }

    spawnMine() {
        // Mine Cap
        if (!this.game.finalBossActive) {
            const cap = Math.max(3, this.list.length * 0.5);
            if (this.mines.length >= cap) return;
        }

        let x, y, d;
        do {
            x = Math.random() * this.game.width;
            y = Math.random() * this.game.height;
            const dx = x - this.game.player.x;
            const dy = y - this.game.player.y;
            d = Math.sqrt(dx * dx + dy * dy);
        } while (d < 200);
        this.mines.push({ x: x, y: y, radius: 15, color: '#f00' });
    }

    spawnBoss() {
        this.game.bossActive = true;
        this.game.bossEncounters++;
        document.getElementById('boss-warning').style.display = 'block';
        setTimeout(() => document.getElementById('boss-warning').style.display = 'none', 3000);
        AudioSys.warn();

        let bx = this.game.width / 2;
        let by = this.game.height / 2;
        if (Math.hypot(bx - this.game.player.x, by - this.game.player.y) < 200) {
            bx += 200; // Offset if player is too close
        }

        this.list.push({
            x: bx, y: by, vx: 0, vy: 0, radius: 50, color: '#f00', speed: 0.5,
            hasShield: true, shieldAngle: 0, stunned: 0,
            type: 4, timer: 0,
            shields: [0, Math.PI] // 2 Layers
        });
    }

    fireProjectile(enemy) {
        const dx = this.game.player.x - enemy.x;
        const dy = this.game.player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.projectiles.push({ x: enemy.x, y: enemy.y, vx: (dx / dist) * 3, vy: (dy / dist) * 3, radius: 10, life: 300 });
        AudioSys.shoot();
    }

    update(dt) {
        const timeScale = dt;

        // Spawn Queue
        for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
            let s = this.spawnQueue[i];
            s.timer -= timeScale;
            if (Math.floor(s.timer) % 10 === 0 && s.timer > 0) this.game.grid.applyForce(s.x, s.y, 25, 10);
            if (s.timer <= 0) {
                this.spawnEnemy(s.x, s.y);
                this.spawnQueue.splice(i, 1);
                this.game.grid.applyForce(s.x, s.y, 50, 50);
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];

            if (p.type === 'pickup') {
                const dx = this.game.player.x - p.x; const dy = this.game.player.y - p.y; const dist = Math.sqrt(dx * dx + dy * dy);

                // Magnetism
                if (dist < 300) {
                    const force = (400 - dist) / 20;
                    p.vx += (dx / dist) * force * timeScale;
                    p.vy += (dy / dist) * force * timeScale;
                }

                if (dist < this.game.player.radius + p.size + 10) {
                    AudioSys.collect();
                    // Add Ammo
                    if (this.game.upgrades[p.pickupType] !== undefined) {
                        this.game.upgrades[p.pickupType] += 5; // +5 Charges
                        this.spawnText(this.game.player.x, this.game.player.y - 30, `+5 ${p.pickupType.toUpperCase()}`, p.color);
                    }
                    p.life = 0;
                    this.game.updateUI();
                }
                p.vx *= 0.92; p.vy *= 0.92;
            }
            else if (p.type === 'confetti') { p.angle += p.vAngle * timeScale; p.vx *= 0.9; p.vy *= 0.9; }
            else if (p.type === 'nanite') {
                let target = null; let minDist = 9999;
                this.list.forEach(e => {
                    if (e.type === 4) return;
                    const d = Math.hypot(e.x - p.x, e.y - p.y);
                    if (d < minDist) { minDist = d; target = e; }
                });

                if (target) {
                    const dx = target.x - p.x; const dy = target.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    p.vx += (dx / dist) * 0.5; p.vy += (dy / dist) * 0.5;
                    if (dist < target.radius) {
                        const targetIndex = this.list.indexOf(target);
                        if (targetIndex > -1) this.game.killEnemy(targetIndex, 'nanite'); // Pass source
                        p.life = 0;
                    }
                }
                p.vx *= 0.95; p.vy *= 0.95;
            }

            p.x += p.vx * timeScale; p.y += p.vy * timeScale; p.life -= 1 * timeScale;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Shockwaves & Texts
        for (let i = this.shockwaves.length - 1; i >= 0; i--) { let s = this.shockwaves[i]; s.radius += (s.maxRadius - s.radius) * 0.2 * timeScale; s.life -= timeScale; if (s.life <= 0) this.shockwaves.splice(i, 1); }
        for (let i = this.texts.length - 1; i >= 0; i--) { let t = this.texts[i]; t.y -= 1 * timeScale; t.life -= 1 * timeScale; if (t.life <= 0) this.texts.splice(i, 1); }

        // Entities
        for (let i = this.list.length - 1; i >= 0; i--) {
            let e = this.list[i];
            const dx = this.game.player.x - e.x; const dy = this.game.player.y - e.y; const d = Math.sqrt(dx * dx + dy * dy);

            if (e.type !== 3 && e.type !== 4) {
                e.vx = (dx / d) * e.speed; e.vy = (dy / d) * e.speed; e.x += e.vx * timeScale; e.y += e.vy * timeScale;
            }

            if (e.type === 1) { // Shooter
                e.timer -= 1 * timeScale;
                if (e.timer <= 0) { this.fireProjectile(e); e.timer = 150; }
            }
            if (e.type === 2) { // Ghost
                e.timer += 0.05 * timeScale; e.opacity = (Math.sin(e.timer) + 1) / 2; if (e.opacity < 0.2) e.opacity = 0.2;
            }
            if (e.type === 5) { // Glitch
                e.timer -= 1 * timeScale;
                const dodgeChance = this.game.aim.active ? 0.1 : 0.02;
                if ((e.timer <= 0 || Math.random() < dodgeChance) && !e.frozen) {
                    e.x += (Math.random() - 0.5) * 150 * 2;
                    e.y += (Math.random() - 0.5) * 150 * 2;
                    e.x = Math.max(0, Math.min(this.game.width, e.x));
                    e.y = Math.max(0, Math.min(this.game.height, e.y));
                    e.timer = 40 + Math.random() * 20;
                    this.spawnConfetti(e.x, e.y, '#0ff', 2);
                }
            }
            if (e.type === 4) { // BOSS
                e.timer += 0.02 * timeScale;
                e.x += (dx / d) * 0.5 * timeScale; e.y += (dy / d) * 0.5 * timeScale;
                e.shields[0] += 0.015 * timeScale;
                e.shields[1] -= 0.02 * timeScale;

                let fireRate = 100;
                if (this.game.bossEncounters > 1) fireRate = 60;
                if (this.game.bossEncounters > 3) fireRate = 30;

                if (Math.floor(e.timer * 50) % fireRate === 0) {
                    this.fireProjectile(e);
                }
            }

            if (e.stunned > 0) e.stunned -= 1 * timeScale;

            if (e.hasShield && e.stunned <= 0) {
                const targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - e.shieldAngle;
                while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;

                const maxTurn = 0.1 * timeScale;
                if (Math.abs(diff) > maxTurn) diff = Math.sign(diff) * maxTurn;

                e.shieldAngle += diff;
            }

            // Singularity Pull
            if (e.type === 3) {
                if (e.warmupTimer > 0) {
                    e.warmupTimer -= timeScale;
                } else {
                    const dist = d;
                    const pullRange = 450;

                    // Visual Warp for Range
                    if (Math.random() < 0.5) this.game.grid.applyForce(e.x, e.y, pullRange, -5);

                    if (dist < pullRange) {
                        const force = 0.35 * timeScale;
                        this.game.player.vx += (dx / dist) * force; this.game.player.vy += (dy / dist) * force;
                    }
                }
            }

            if (d < e.radius + this.game.player.radius) {
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
            let p = this.projectiles[i]; p.x += p.vx * timeScale; p.y += p.vy * timeScale; p.life -= 1 * timeScale;
            if (Math.hypot(p.x - this.game.player.x, p.y - this.game.player.y) < p.radius + this.game.player.radius) {
                this.game.triggerGameOver("LOGIC BOMB");
            }
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }
}
