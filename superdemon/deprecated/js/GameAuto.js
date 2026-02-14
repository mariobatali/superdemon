import { WarpGrid } from './WarpGrid.js';
import { AudioSys } from './AudioSys.js';
import { WARDENS_NEEDED_FOR_RITUAL } from './Constants.js';
import { EntityManager } from './Entities.js';

export const GameAuto = {
    canvas: null, ctx: null,
    width: 0, height: 0, active: false, paused: false, victoryMode: false,
    grid: null, hue: 0, gameFrame: 0, timeScale: 1.0, targetTimeScale: 1.0,
    player: { x: 0, y: 0, vx: 0, vy: 0, radius: 10, ram: 3, maxRam: 3, overheat: 0, aimTimer: 0 },
    upgrades: { explosion: 0, range: 0, echo: 0, phase: 0, nanites: 0, voltage: 0, ram: 0 },
    combo: 0, comboTimer: 0, maxDashRange: 600, bossSpawnScore: 2000, nextBossScore: 2000, bossActive: false, bossEncounters: 0, wardensKilled: 0,
    mouse: { x: 0, y: 0, down: false }, aim: { active: false, x: 0, y: 0 },
    score: 0, shake: 0,
    em: null, // Entity Manager
    lastTime: 0, accumulator: 0, step: 1 / 60,

    // KINETIC EVOLUTION SPECIFIC
    powerTier: 0, // 0, 1, 2, 3

    // FINAL BOSS STUFF
    finalBossActive: false,
    finalBossStage: 0,
    starNodes: [],
    nextStarTarget: 1,
    finalZoneRadius: 0,

    // ATTEMPT TRACKING
    attempt: 0,

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.em = new EntityManager(this);

        this.resize(); window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        window.addEventListener('mousedown', () => this.onInputDown()); window.addEventListener('mouseup', () => this.onInputUp());
        window.addEventListener('touchstart', e => { e.preventDefault(); this.mouse.x = e.touches[0].clientX; this.mouse.y = e.touches[0].clientY; this.onInputDown(); }, { passive: false });
        window.addEventListener('touchmove', e => { e.preventDefault(); this.mouse.x = e.touches[0].clientX; this.mouse.y = e.touches[0].clientY; }, { passive: false });
        window.addEventListener('touchend', e => this.onInputUp());

        requestAnimationFrame(t => this.loop(t));
    },

    onInputDown() { if (!this.active || this.paused) return; this.mouse.down = true; if (this.player.overheat <= 0) { this.targetTimeScale = 0.02; this.aim.active = true; this.player.aimTimer = 0; AudioSys.slowDown(); } else { AudioSys.error(); } },
    onInputUp() { if (!this.active || this.paused) return; this.mouse.down = false; this.targetTimeScale = 1.0; if (this.aim.active) { this.executeDash(); this.aim.active = false; } },
    resize() { this.width = this.canvas.width = window.innerWidth; this.height = this.canvas.height = window.innerHeight; this.grid = new WarpGrid(this.width, this.height, 25); },

    start() {
        // Increment Attempt
        this.attempt++;
        localStorage.setItem('superdemon_attempts', this.attempt);

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('victory-screen').classList.remove('active');

        AudioSys.init();
        AudioSys.startHum(); // Start Ambient Hum
        this.active = true; this.paused = false; this.victoryMode = false; this.score = 0;
        this.player.x = this.width / 2; this.player.y = this.height / 2; this.player.vx = 0; this.player.vy = 0;
        this.player.maxRam = 3; this.player.ram = 3; this.player.overheat = 0;

        this.powerTier = 0;

        this.upgrades = { explosion: 0, range: 0, echo: 0, phase: 0, nanites: 0, voltage: 0, ram: 0 };
        this.combo = 0; this.comboTimer = 0; this.nextBossScore = 2000; this.bossActive = false; this.bossEncounters = 0; this.wardensKilled = 0;

        this.em.reset();
        this.shake = 0; this.grid = new WarpGrid(this.width, this.height, 30);

        // Final Boss Reset
        this.finalBossActive = false;
        this.finalZoneRadius = 0;
        this.starNodes = [];

        document.getElementById('boss-warning').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex';
        this.em.queueSpawn(2);
        this.updateUI();
    },

    triggerGameOver(reason) {
        this.active = false;
        this.em.texts = [];
        AudioSys.stopHum(); // Stop Hum

        const goScreen = document.getElementById('game-over-screen');
        document.getElementById('final-score').innerText = Math.floor(this.score);

        const reasonEl = document.getElementById('death-reason');
        if (reasonEl) reasonEl.innerText = `KILLED BY: ${reason}`;

        const attemptEl = document.getElementById('attempt-num');
        if (attemptEl) attemptEl.innerText = this.attempt;

        goScreen.classList.add('active');
    },

    initFinalBoss() {
        this.finalBossActive = true;
        this.bossActive = false;
        this.em.reset();

        this.nextStarTarget = 1;
        this.finalZoneRadius = Math.max(this.width, this.height);

        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 250;

        const indices = [0, 2, 4, 1, 3];
        const colors = ['#f00', '#f80', '#ff0', '#0f0', '#00f'];

        for (let i = 0; i < 5; i++) {
            const idx = indices[i];
            const angle = (idx * (Math.PI * 2 / 5)) - Math.PI / 2;

            this.starNodes.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                id: i + 1,
                points: i + 3,
                color: colors[i],
                active: true,
                radius: 25
            });
        }

        AudioSys.warn();
        this.em.spawnText(centerX, centerY, "INITIATE RITUAL", "#fff");
    },

    triggerVictory() {
        this.victoryMode = true;
        this.active = false;
        AudioSys.stopHum();
        AudioSys.playVictoryJingle();

        const vScreen = document.getElementById('victory-screen');
        vScreen.classList.add('active');
        document.getElementById('victory-score').innerText = Math.floor(this.score);

        // Save High Score
        const high = localStorage.getItem('superdemon_highscore') || 0;
        if (this.score > high) {
            localStorage.setItem('superdemon_highscore', Math.floor(this.score));
        }
    },

    checkShieldBlock(px, py, boss) {
        const angleToPlayer = Math.atan2(py - boss.y, px - boss.x);
        const shieldWidth = Math.PI * 0.4; // Shield width
        for (let sAngle of boss.shields) {
            let diff = angleToPlayer - (sAngle + shieldWidth / 2);
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < shieldWidth / 2) return true;
        }
        return false;
    },

    executeDash() {
        if (this.player.ram <= 0) return;
        const dx = this.mouse.x - this.player.x; const dy = this.mouse.y - this.player.y; const dist = Math.sqrt(dx * dx + dy * dy);

        // TIER 3: Nuclear Range (Increased Dash Range)
        let currentDashRange = this.maxDashRange;
        if (this.powerTier >= 3) currentDashRange *= 1.5;

        const dashDist = Math.min(dist, currentDashRange);
        let ex = this.player.x + (dx / dist) * dashDist; let ey = this.player.y + (dy / dist) * dashDist;
        let startX = this.player.x; let startY = this.player.y;

        ex = Math.max(0, Math.min(this.width, ex)); ey = Math.max(0, Math.min(this.height, ey));

        // TIER 1: Echo Slash
        const hasEcho = this.powerTier >= 1;
        const lineLife = 30 + (hasEcho ? 20 : 0);
        this.em.slashLines.push({ x1: startX, y1: startY, x2: ex, y2: ey, life: lineLife, width: 15, lethal: hasEcho });

        this.grid.applyForce(startX, startY, 125, 100);
        this.grid.applyForce(ex, ey, 125, 100);

        this.player.x = ex; this.player.y = ey; this.player.vx = (dx / dist) * 2; this.player.vy = (dy / dist) * 2;

        let hitCount = 0; let hitMine = false;
        let bossKilled = false;

        // CHECK STAR NODES (Final Boss)
        if (this.finalBossActive) {
            for (let i = 0; i < this.starNodes.length; i++) {
                const node = this.starNodes[i];
                if (!node.active) continue;

                if (this.lineCircleCollide(startX, startY, ex, ey, node)) {
                    if (node.id === this.nextStarTarget) {
                        // Correct
                        node.active = false;
                        this.nextStarTarget++;
                        this.createExplosion(node.x, node.y, 200);
                        AudioSys.kill(this.combo);
                        this.em.spawnText(node.x, node.y - 30, node.id + "/5", node.color);
                        this.grid.applyForce(node.x, node.y, 300, 200);
                        hitCount++;

                        if (this.nextStarTarget > 5) {
                            this.triggerVictory();
                            return; // Stop processing
                        }
                    } else {
                        // Wrong Hit - Immediate Stop
                        AudioSys.error();
                        this.shake = 20;
                        this.em.spawnText(node.x, node.y - 30, "RESET", "#f00");

                        this.nextStarTarget = 1;
                        this.starNodes.forEach(n => n.active = true);

                        this.player.ram = 0;
                        this.player.overheat = 60;

                        this.player.vx *= -0.5;
                        this.player.vy *= -0.5;
                        this.player.x = startX;
                        this.player.y = startY;

                        return; // HALT DASH
                    }
                }
            }
        }

        for (let i = this.em.mines.length - 1; i >= 0; i--) {
            let m = this.em.mines[i];
            if (this.lineCircleCollide(startX, startY, ex, ey, m)) {
                // TIER 2: Mine Mastery
                if (this.powerTier >= 2) {
                    this.em.mines.splice(i, 1);
                    // this.em.spawnText(m.x, m.y, "ABSORBED", `hsl(${this.hue}, 100%, 50%)`);
                    this.em.spawnConfetti(m.x, m.y, `hsl(${this.hue}, 100%, 50%)`, 8);

                    // Mine Mastery Effect: Stun Shockwave + Combo
                    const stunRadius = 400;
                    this.em.shockwaves.push({ x: m.x, y: m.y, radius: 0, maxRadius: stunRadius, life: 20, color: '#0ff' });
                    this.grid.applyForce(m.x, m.y, stunRadius, 100);

                    this.em.list.forEach(other => {
                        const d = Math.hypot(other.x - m.x, other.y - m.y);
                        if (d < stunRadius) { other.stunned = 120; }
                    });

                    this.combo++;
                    this.comboTimer = 240;
                }
                else { hitMine = true; this.shake += 40; AudioSys.error(); for (let k = 0; k < 8; k++) this.em.spawnConfetti(m.x, m.y, '#f00', 15); this.em.mines.splice(i, 1); this.grid.applyForce(m.x, m.y, 300, 200); }
            }
        }

        if (hitMine) {
            this.player.ram = 0;
            this.player.overheat = 180;
            this.player.vx *= -2;
            this.player.vy *= -2;
            this.combo = 0;
            this.updateUI();
            this.triggerGameOver("DATA MINE");
            return;
        }

        for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
            let p = this.em.projectiles[i];
            if (this.lineCircleCollide(startX, startY, ex, ey, p)) { this.em.projectiles.splice(i, 1); this.em.spawnConfetti(p.x, p.y, '#f0f', 5); /* this.em.spawnText(p.x, p.y, "DENIED", "#f0f"); */ }
        }

        if (this.powerTier >= 3) {
            const radius = 250; // Massive radius
            this.createExplosion(ex, ey, radius); this.grid.applyForce(ex, ey, radius * 2, 150);
            for (let i = this.em.list.length - 1; i >= 0; i--) {
                let e = this.em.list[i];
                if (Math.hypot(e.x - ex, e.y - ey) < radius + e.radius) {
                    let blocked = false;
                    if (e.type === 4) {
                        blocked = this.checkShieldBlock(ex, ey, e);
                    } else if (e.hasShield && e.stunned <= 0) {
                        const angleToEnemy = Math.atan2(e.y - ey, e.x - ex);
                        let diff = angleToEnemy - e.shieldAngle;
                        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < Math.PI / 2) blocked = true;
                    }

                    if (!blocked) {
                        if (this.killEnemy(i, 'explosion')) bossKilled = true;
                        hitCount++;
                    }
                    else { /* this.em.spawnText(e.x, e.y - 20, "BLOCKED", "#fff"); */ AudioSys.deflect(); }
                }
                if (bossKilled) break;
            }
        }

        if (!bossKilled) {
            for (let i = this.em.list.length - 1; i >= 0; i--) {
                let e = this.em.list[i];
                if (e.type === 2 && e.opacity < 0.8) continue;
                if (this.lineCircleCollide(startX, startY, ex, ey, e)) {
                    let allowed = true;
                    if (e.type === 4) { if (this.checkShieldBlock(startX, startY, e)) allowed = false; }
                    else if (e.hasShield && e.stunned <= 0) {
                        const toPlayerX = startX - e.x; const toPlayerY = startY - e.y;
                        const toPlayerAngle = Math.atan2(toPlayerY, toPlayerX);
                        let diff = toPlayerAngle - e.shieldAngle;
                        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < Math.PI / 2) allowed = false;
                    }
                    if (allowed) { if (this.killEnemy(i, 'dash')) bossKilled = true; hitCount++; }
                    else { AudioSys.deflect(); this.em.spawnConfetti(e.x, e.y, '#fff', 8); /* this.em.spawnText(e.x, e.y - 20, "BLOCKED", "#fff"); */ this.player.vx *= -1; this.player.vy *= -1; }
                }
                if (bossKilled) break;
            }
        }

        AudioSys.dash(this.combo); this.shake = 20;

        if (hitCount > 0) {
            this.player.ram = Math.min(this.player.maxRam, this.player.ram + 1);
            this.shake += hitCount * 10; this.combo += hitCount; this.comboTimer = 240;
            if (hitCount >= 2) this.triggerPrismNova(ex, ey);
        } else {
            this.player.ram--;
            if (this.player.ram <= 0) { this.player.overheat = 120; AudioSys.error(); this.combo = 0; }
        }
        this.updateUI();
    },

    triggerPrismNova(x, y) {
        // Replaced overlay shockwave with Grid Color Shockwave
        this.grid.addColorShockwave(x, y, 1500, '#fff', 40);
        this.grid.applyForce(x, y, 1000, 300); this.shake = 50;
        AudioSys.nova(this.combo);
        // this.em.spawnText(x, y - 50, "PRISM NOVA!", `hsl(${this.hue}, 100%, 50%)`);
        this.em.list.forEach(e => {
            const dx = e.x - x; const dy = e.y - y; const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 800) { e.vx += (dx / d) * 30; e.vy += (dy / d) * 30; e.stunned = 120; }
        });
    },

    lineCircleCollide(x1, y1, x2, y2, circle) {
        const acX = circle.x - x1; const acY = circle.y - y1;
        const abX = x2 - x1; const abY = y2 - y1;
        const t = (acX * abX + acY * abY) / (abX * abX + abY * abY);
        let closestX, closestY;
        if (t < 0) { closestX = x1; closestY = y1; } else if (t > 1) { closestX = x2; closestY = y2; } else { closestX = x1 + t * abX; closestY = y1 + t * abY; }
        const distX = circle.x - closestX; const distY = circle.y - closestY;
        return (distX * distX + distY * distY) < (circle.radius * circle.radius);
    },

    killEnemy(index, source) {
        const deadEnemy = this.em.list[index]; const dx = deadEnemy.x; const dy = deadEnemy.y;

        if (deadEnemy.type === 4) { // Boss
            this.bossActive = false;
            this.wardensKilled++;
            this.score += 5000;
            this.nextBossScore = this.score + 3000;

            // this.em.spawnText(dx, dy, "SYSTEM EVOLVED", "#0ff");
            this.grid.applyForce(dx, dy, 1000, 400);
            this.createExplosion(dx, dy, 300);

            this.em.list.splice(index, 1);
            return true;
        }

        if (deadEnemy.type === 5 && deadEnemy.lives > 0) {
            deadEnemy.lives--;
            // this.em.spawnText(dx, dy, "GLITCH", "#0f0");
            AudioSys.deflect();

            // Safe Teleport (Local Area + Min Distance)
            let safe = false;
            let attempts = 0;
            while (!safe && attempts < 15) {
                // Try to stay within 400px of current position
                const offsetX = (Math.random() - 0.5) * 800;
                const offsetY = (Math.random() - 0.5) * 800;

                let tx = deadEnemy.x + offsetX;
                let ty = deadEnemy.y + offsetY;

                // Clamp to screen
                tx = Math.max(50, Math.min(this.width - 50, tx));
                ty = Math.max(50, Math.min(this.height - 50, ty));

                const distToPlayer = Math.hypot(tx - this.player.x, ty - this.player.y);

                // Must be > 250px away from player
                if (distToPlayer > 250) {
                    deadEnemy.x = tx;
                    deadEnemy.y = ty;
                    safe = true;
                }
                attempts++;
            }
            if (!safe) {
                // Fallback: Just move it away from player vector
                const angle = Math.atan2(deadEnemy.y - this.player.y, deadEnemy.x - this.player.x);
                deadEnemy.x = this.player.x + Math.cos(angle) * 400;
                deadEnemy.y = this.player.y + Math.sin(angle) * 400;

                // Clamp
                deadEnemy.x = Math.max(50, Math.min(this.width - 50, deadEnemy.x));
                deadEnemy.y = Math.max(50, Math.min(this.height - 50, deadEnemy.y));
            }
            return false;
        }

        this.em.list.splice(index, 1);

        if (source === 'nanite' || source === 'mine') {
            this.combo++;
            this.comboTimer = 240;
        }

        const comboMult = Math.max(1, this.combo); this.score += 100 * comboMult; AudioSys.kill(this.combo);

        const stunRadius = 300;
        // Replaced overlay shockwave with Grid Color Shockwave
        this.grid.addColorShockwave(dx, dy, stunRadius, '#0ff', 20);
        this.grid.applyForce(dx, dy, stunRadius, 100);

        let stunnedCount = 0;
        this.em.list.forEach(other => {
            if (other.hasShield) {
                const d = Math.hypot(other.x - dx, other.y - dy);
                if (d < stunRadius) { other.stunned = 180; /* this.em.spawnText(other.x, other.y - 30, "STUNNED", "#0ff"); */ this.em.spawnConfetti(other.x, other.y, '#0ff', 8); stunnedCount++; }
            }
        });
        if (stunnedCount > 0) AudioSys.stun();

        const hue = this.combo > 5 ? this.hue : 0;
        const color = hue ? `hsl(${hue}, 100%, 50%)` : deadEnemy.color;
        this.em.spawnConfetti(dx, dy, color, 20);
        const dropCount = Math.min(8, 3 + Math.floor(this.combo / 5));

        for (let i = 0; i < dropCount; i++) {
            const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 8 + 4;
            this.em.particles.push({
                x: dx, y: dy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 400, color: '#fff', size: 2, type: 'data'
            });
        }
        this.updateUI();
        return false;
    },

    createExplosion(x, y, radius) {
        // Replaced overlay shockwave with Grid Color Shockwave
        this.grid.addColorShockwave(x, y, radius, '#f80', 20);
        AudioSys.explode(this.combo);
    },

    update(dt) {
        const timeDelta = dt * 60;
        const scaledDt = timeDelta * this.timeScale;
        if (this.victoryMode) {
            this.grid.update();
            if (Math.random() < 0.1) {
                const x = Math.random() * this.width;
                const y = Math.random() * this.height;
                const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                this.em.spawnConfetti(x, y, color, 20);
                this.createExplosion(x, y, 100);
            }
            // Update Particles only
            for (let i = this.em.particles.length - 1; i >= 0; i--) {
                let p = this.em.particles[i];
                p.x += p.vx * timeDelta; p.y += p.vy * timeDelta; p.life -= timeDelta;
                if (p.type === 'confetti') { p.angle += p.vAngle * timeDelta; p.vx *= 0.9; p.vy *= 0.9; }
                if (p.life <= 0) this.em.particles.splice(i, 1);
            }
            return;
        }

        if (!this.active || this.paused) return;
        this.gameFrame += scaledDt; this.hue = (this.hue + 2 * scaledDt) % 360; this.timeScale += (this.targetTimeScale - this.timeScale) * 0.2 * timeDelta;
        this.grid.update();
        this.em.update(scaledDt);

        // Update Ambient Hum
        AudioSys.updateHum(this.combo);

        // KINETIC EVOLUTION: Update Power Tier
        if (this.combo < 10) this.powerTier = 0;
        else if (this.combo < 25) this.powerTier = 1;
        else if (this.combo < 50) this.powerTier = 2;
        else this.powerTier = 3;

        if (this.wardensKilled >= WARDENS_NEEDED_FOR_RITUAL && !this.victoryMode && !this.finalBossActive) {
            this.initFinalBoss();
        }

        const mobCap = 4 + (this.score / 1350);
        let spawnRate = 0.01 + (this.score / 90000);

        // Redirect mine spawn rate to enemies if no warden killed yet
        if (this.wardensKilled === 0) spawnRate += 0.005;

        if (this.em.list.length < mobCap && !this.bossActive && !this.finalBossActive) {
            if (Math.random() < spawnRate * scaledDt) this.em.queueSpawn(1);
        }

        if (this.score > this.nextBossScore && !this.bossActive && !this.finalBossActive && this.wardensKilled < WARDENS_NEEDED_FOR_RITUAL) { this.em.spawnBoss(); }
        if (this.combo > 0) { this.comboTimer -= 1 * scaledDt; if (this.comboTimer <= 0) { this.combo = 0; this.updateUI(); } }
        if (this.player.overheat > 0) { this.player.overheat -= scaledDt; if (this.player.overheat <= 0) { this.player.ram = this.player.maxRam; this.updateUI(); } }

        // Final Boss Logic
        if (this.finalBossActive) {
            this.score = Math.max(0, this.score - 55);
            if (this.finalZoneRadius > 300) {
                this.finalZoneRadius -= 0.2 * scaledDt;
            }
            const distFromCenter = Math.sqrt((this.player.x - this.width / 2) ** 2 + (this.player.y - this.height / 2) ** 2);
            if (distFromCenter > this.finalZoneRadius) {
                this.triggerGameOver("CONTAINMENT FIELD");
            }
        }

        this.player.x += this.player.vx * scaledDt; this.player.y += this.player.vy * scaledDt;
        this.player.vx *= Math.pow(0.95, scaledDt); this.player.vy *= Math.pow(0.95, scaledDt);

        if (this.player.x < 0 || this.player.x > this.width) { this.player.vx *= -1; this.player.x = Math.max(0, Math.min(this.width, this.player.x)); }
        if (this.player.y < 0 || this.player.y > this.height) { this.player.vy *= -1; this.player.y = Math.max(0, Math.min(this.height, this.player.y)); }

        let mineRate = 0.005;
        if (this.wardensKilled === 0) mineRate = 0; // No mines until first warden
        if (this.finalBossActive) mineRate = 0.05;
        if (Math.random() < mineRate * scaledDt) this.em.spawnMine();

        for (let i = this.em.slashLines.length - 1; i >= 0; i--) {
            let l = this.em.slashLines[i]; l.life -= 1 * scaledDt; l.width *= 0.95;
            if (l.lethal && l.life > 5) {
                for (let j = this.em.list.length - 1; j >= 0; j--) {
                    let e = this.em.list[j];
                    if (this.lineCircleCollide(l.x1, l.y1, l.x2, l.y2, e)) {
                        // TIER 1: Echo Slash Logic
                        let blocked = false;
                        const cx = (l.x1 + l.x2) / 2; const cy = (l.y1 + l.y2) / 2;

                        if (e.type === 4) {
                            blocked = this.checkShieldBlock(cx, cy, e);
                        } else if (e.hasShield && e.stunned <= 0) {
                            const angleToAttacker = Math.atan2(cy - e.y, cx - e.x);
                            let diff = angleToAttacker - e.shieldAngle;
                            while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                            if (Math.abs(diff) < Math.PI / 2) blocked = true;
                        }

                        if (!blocked) {
                            if (this.powerTier >= 1) {
                                // Warden Immunity to Echo
                                if (e.type === 4) {
                                    // AudioSys.deflect(); // Silent
                                } else {
                                    e.x += (cx - e.x) * 0.2; e.y += (cy - e.y) * 0.2;
                                    this.killEnemy(j, 'echo');
                                    // this.em.spawnText(e.x, e.y, "ECHO", `hsl(${this.hue}, 100%, 50%)`);
                                    break;
                                }
                            }
                        } else {
                            // Fix: Only show blocked once per cooldown
                            if (!e.lastBlockTime || this.gameFrame - e.lastBlockTime > 30) {
                                // this.em.spawnText(e.x, e.y - 20, "BLOCKED", "#fff");
                                if (e.type !== 4) AudioSys.deflect();
                                e.lastBlockTime = this.gameFrame;
                            }
                        }
                    }
                }
            }
            if (l.life <= 0) this.em.slashLines.splice(i, 1);
        }
    },

    updateUI() {
        const ramEl = document.getElementById('ram-disp');
        if (this.player.overheat > 0) { ramEl.innerText = "OVERHEAT"; ramEl.style.color = "#f00"; } else { let dots = ""; for (let i = 0; i < this.player.maxRam; i++) { dots += (i < this.player.ram) ? "█" : "░"; } ramEl.innerText = dots; ramEl.style.color = `hsl(${this.hue}, 100%, 50%)`; }
        document.getElementById('score-disp').innerText = Math.floor(this.score);

        // HEAT / TIER GAUGE
        const heatFill = document.getElementById('heat-gauge-fill');
        const tierText = document.getElementById('heat-tier-text');

        if (heatFill && tierText) {
            let progress = 0;
            let tierName = "BASE";
            if (this.powerTier === 0) {
                progress = (this.combo / 10) * 100;
                tierName = "TIER 0";
            } else if (this.powerTier === 1) {
                progress = ((this.combo - 10) / (25 - 10)) * 100;
                tierName = "TIER 1: ECHO";
            } else if (this.powerTier === 2) {
                progress = ((this.combo - 25) / (50 - 25)) * 100;
                tierName = "TIER 2: MINE";
            } else {
                progress = 100;
                tierName = "TIER 3: NUKE";
            }

            heatFill.style.width = Math.min(100, Math.max(0, progress)) + "%";
            heatFill.style.backgroundColor = `hsl(${this.hue}, 100%, 50%)`;
            tierText.innerText = tierName;
            tierText.style.color = `hsl(${this.hue}, 100%, 50%)`;
        }

        const comboEl = document.getElementById('combo-disp'); if (this.combo > 1) { comboEl.style.display = 'block'; document.getElementById('combo-val').innerText = this.combo; comboEl.style.color = `hsl(${this.hue}, 100%, 50%)`; comboEl.style.transform = `scale(${1 + (this.combo / 20)})`; } else { comboEl.style.display = 'none'; }
    },

    draw() {
        // Regular composite for background fade
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = 'rgba(5, 5, 5, 0.3)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Additive blending for shiny objects
        this.ctx.globalCompositeOperation = 'lighter';

        let sx = 0, sy = 0;
        if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= 0.9; if (this.shake < 0.5) this.shake = 0; }
        this.ctx.save();
        this.ctx.translate(sx, sy);
        if (this.shake > 5) this.ctx.translate(2, 0);

        const flowColor = this.combo > 5 ? `hsl(${this.hue}, 100%, 50%)` : '#0ff';

        this.grid.draw(this.ctx, this.hue, this.width / 2, this.height / 2, this.combo, this.finalBossActive);

        // Final Boss Zone
        if (this.finalBossActive) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.beginPath();
            this.ctx.arc(this.width / 2, this.height / 2, this.finalZoneRadius, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 5;
            this.ctx.setLineDash([20, 10]);
            this.ctx.stroke();

            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.fillStyle = 'rgba(20, 0, 0, 0.5)';
            this.ctx.beginPath();
            this.ctx.rect(0, 0, this.width, this.height);
            this.ctx.arc(this.width / 2, this.height / 2, this.finalZoneRadius, 0, Math.PI * 2, true);
            this.ctx.fill();

            this.ctx.globalCompositeOperation = 'lighter';
            this.starNodes.forEach(node => {
                if (!node.active) return;

                this.ctx.beginPath();
                this.ctx.fillStyle = node.id === this.nextStarTarget ? '#fff' : node.color;
                this.ctx.strokeStyle = node.color;
                this.ctx.lineWidth = 3;

                this.ctx.moveTo(node.x + node.radius * Math.cos(-Math.PI / 2), node.y + node.radius * Math.sin(-Math.PI / 2));
                const step = Math.PI * 2 / (node.points * 2);
                for (let i = 0; i < node.points * 2; i++) {
                    const r = (i % 2 === 0) ? node.radius : node.radius / 2;
                    const a = (i * step) - Math.PI / 2;
                    this.ctx.lineTo(node.x + Math.cos(a) * r, node.y + Math.sin(a) * r);
                }
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.fillStyle = '#000';
                this.ctx.font = 'bold 16px Courier New';
                this.ctx.fillText(node.id, node.x - 5, node.y + 5);

                if (node.id === this.nextStarTarget) {
                    this.ctx.beginPath();
                    this.ctx.arc(node.x, node.y, node.radius + 10 + Math.sin(this.gameFrame * 0.2) * 5, 0, Math.PI * 2);
                    this.ctx.strokeStyle = '#fff';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            });
            this.ctx.restore();
        }

        this.em.spawnQueue.forEach(s => {
            this.ctx.beginPath();
            const size = 40 * (s.timer / 60);
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${1 - s.timer / 60})`;
            this.ctx.rect(s.x - size / 2, s.y - size / 2, size, size);
            this.ctx.stroke();
        });

        this.em.slashLines.forEach(l => {
            this.ctx.beginPath(); this.ctx.moveTo(l.x1, l.y1); this.ctx.lineTo(l.x2, l.y2);
            this.ctx.strokeStyle = l.lethal ? flowColor : '#fff'; this.ctx.lineWidth = l.width;
            this.ctx.shadowBlur = 20; this.ctx.shadowColor = l.lethal ? flowColor : '#fff'; this.ctx.stroke();
        });
        this.ctx.shadowBlur = 0;

        if (this.aim.active && this.player.ram > 0) {
            this.ctx.beginPath(); this.ctx.moveTo(this.player.x, this.player.y);
            const dx = this.mouse.x - this.player.x; const dy = this.mouse.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // TIER 3: Visual range increase
            let currentDashRange = this.maxDashRange;
            if (this.powerTier >= 3) currentDashRange *= 1.5;

            const d = Math.min(dist, currentDashRange);
            this.ctx.lineTo(this.player.x + (dx / dist) * d, this.player.y + (dy / dist) * d);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; this.ctx.setLineDash([10, 10]); this.ctx.lineWidth = 4; this.ctx.stroke(); this.ctx.setLineDash([]);
            this.ctx.beginPath(); this.ctx.arc(this.player.x, this.player.y, currentDashRange, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; this.ctx.stroke();
        }

        const pGrad = this.ctx.createRadialGradient(this.player.x, this.player.y, 0, this.player.x, this.player.y, this.player.radius);
        if (this.player.overheat > 0) {
            pGrad.addColorStop(0, '#fff'); pGrad.addColorStop(0.3, '#f00'); pGrad.addColorStop(1, '#500');
        } else {
            pGrad.addColorStop(0, '#fff'); pGrad.addColorStop(0.4, '#eee'); pGrad.addColorStop(1, '#aaa');
        }

        this.ctx.beginPath(); this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = pGrad; this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(this.player.x, this.player.y, this.player.radius * 0.4, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff'; this.ctx.fill();

        this.em.mines.forEach(m => {
            this.ctx.beginPath(); const spikes = 8;
            for (let i = 0; i < spikes * 2; i++) { const angle = (Math.PI * 2 / (spikes * 2)) * i; const r = (i % 2 === 0) ? m.radius : m.radius * 1.5; this.ctx.lineTo(m.x + Math.cos(angle) * r, m.y + Math.sin(angle) * r); }
            this.ctx.closePath();
            const mGrad = this.ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * 1.5);
            mGrad.addColorStop(0, '#f88'); mGrad.addColorStop(1, '#f00');
            this.ctx.fillStyle = mGrad; this.ctx.fill();
        });

        this.em.projectiles.forEach(p => {
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#fa0'; this.ctx.fill();
        });

        this.em.list.forEach(e => {
            this.ctx.globalAlpha = e.opacity !== undefined ? e.opacity : 1.0;

            if (e.type === 4) {
                this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 10;
                e.shields.forEach((angle, i) => {
                    this.ctx.beginPath(); const r = e.radius + 20 + (i * 15);
                    this.ctx.arc(e.x, e.y, r, angle, angle + Math.PI * 0.4);
                    this.ctx.stroke();
                });
            }
            else if (e.hasShield) {
                this.ctx.beginPath(); this.ctx.arc(e.x, e.y, e.radius + 8, e.shieldAngle - Math.PI / 2, e.shieldAngle + Math.PI / 2);
                if (e.stunned > 0) { this.ctx.strokeStyle = '#0ff'; this.ctx.lineWidth = 6; this.ctx.setLineDash([5, 5]); }
                else { this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 6; this.ctx.setLineDash([]); }
                this.ctx.stroke(); this.ctx.setLineDash([]);
            }

            this.ctx.beginPath();
            if (e.type === 1) { for (let i = 0; i < 6; i++) { const ang = (Math.PI * 2 / 6) * i; this.ctx.lineTo(e.x + Math.cos(ang) * e.radius, e.y + Math.sin(ang) * e.radius); } }
            else if (e.type === 5) {
                // Glitch: Green normally, Red if damaged
                const glitchColor = (e.lives < 2) ? '#f00' : '#0f0';

                if (e.frozen) { this.ctx.strokeStyle = '#0ff'; this.ctx.setLineDash([2, 2]); }
                else { this.ctx.strokeStyle = glitchColor; this.ctx.setLineDash([]); }

                this.ctx.rect(e.x - e.radius, e.y - e.radius, e.radius * 2, e.radius * 2);
                this.ctx.stroke();
                this.ctx.fillStyle = glitchColor;
                this.ctx.fillRect(e.x - e.radius / 2 + (Math.random() - 0.5) * 5, e.y - e.radius / 2 + (Math.random() - 0.5) * 5, e.radius, e.radius);
                return;
            }
            else if (e.type === 3) {
                // LIME GREEN SINGULARITY - Glowing Ball
                // Reduced brightness (shadowBlur 15 -> 10) and darker color
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#28a428';
                this.ctx.fillStyle = '#28a428'; // Darker Lime Green
                this.ctx.beginPath();
                this.ctx.arc(e.x, e.y, e.radius * 0.8, 0, Math.PI * 2);
                this.ctx.fill();

                // White core
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Slightly less intense core
                this.ctx.beginPath();
                this.ctx.arc(e.x, e.y, e.radius * 0.4, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.shadowBlur = 0;
                return; // Skip default drawing
            }
            else { this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); }

            const eGrad = this.ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
            eGrad.addColorStop(0, '#fff');
            eGrad.addColorStop(0.6, e.color);
            eGrad.addColorStop(1, '#000');

            this.ctx.fillStyle = eGrad; this.ctx.fill();

            this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.ctx.beginPath(); this.ctx.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.3, e.radius * 0.2, 0, Math.PI * 2); this.ctx.fill();

            this.ctx.globalAlpha = 1.0;
        });

        this.em.particles.forEach(p => {
            this.ctx.save(); this.ctx.translate(p.x, p.y);
            if (p.type === 'confetti') {
                this.ctx.rotate(p.angle); this.ctx.fillStyle = p.color;
                this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            } else if (p.type === 'data') {
                this.ctx.fillStyle = '#fff';
                this.ctx.shadowBlur = 0;
                this.ctx.fillRect(-1, -1, 2, 2);
            } else if (p.type === 'nanite') {
                this.ctx.fillStyle = '#0f0';
                this.ctx.beginPath(); this.ctx.arc(0, 0, p.size, 0, Math.PI * 2); this.ctx.fill();
            } else {
                this.ctx.fillStyle = p.color; this.ctx.beginPath(); this.ctx.arc(0, 0, p.size, 0, Math.PI * 2); this.ctx.fill();
            }
            this.ctx.restore();
        });

        this.ctx.font = "900 24px Courier New";
        this.em.texts.forEach(t => {
            this.ctx.fillStyle = t.color; this.ctx.font = `900 ${t.size}px Courier New`; this.ctx.fillText(t.text, t.x, t.y);
        });

        if (this.timeScale < 0.5) {
            this.ctx.globalCompositeOperation = 'source-over';
            const grad = this.ctx.createRadialGradient(this.width / 2, this.height / 2, this.height / 3, this.width / 2, this.height / 2, this.height);
            grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, `rgba(0, 20, 20, 0.5)`);
            this.ctx.fillStyle = grad; this.ctx.fillRect(0, 0, this.width, this.height);
        }
        this.ctx.restore();
    },



    loop(timestamp) {
        try {
            if (!this.lastTime) { this.lastTime = timestamp; }
            let dt = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;

            if (isNaN(dt)) dt = 0;
            if (dt < 0) dt = 0;
            if (dt > 0.1) dt = 0.1;

            this.update(dt);
            this.draw();
        } catch (e) {
            console.error("Game Loop Error:", e);
        }
        requestAnimationFrame(t => this.loop(t));
    }
};
