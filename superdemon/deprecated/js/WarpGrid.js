export class WarpGrid {
    constructor(width, height, spacing) {
        this.width = width;
        this.height = height;
        this.spacing = spacing;
        this.cols = Math.ceil(width / spacing) + 1;
        this.rows = Math.ceil(height / spacing) + 1;
        this.points = [];
        this.colorShockwaves = [];

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                this.points.push({
                    x: x * spacing,
                    y: y * spacing,
                    bx: x * spacing,
                    by: y * spacing,
                    vx: 0, vy: 0
                });
            }
        }
    }

    applyForce(x, y, radius, force) {
        this.points.forEach(p => {
            const dx = p.x - x; const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < radius * radius) {
                const dist = Math.sqrt(distSq);
                const f = (1 - dist / radius) * force;
                const angle = Math.atan2(dy, dx);
                p.vx += Math.cos(angle) * f;
                p.vy += Math.sin(angle) * f;
            }
        });
    }

    addColorShockwave(x, y, radius, color, life) {
        this.colorShockwaves.push({ x, y, radius, color, life, maxLife: life });
    }

    update() {
        this.points.forEach(p => {
            const dx = p.bx - p.x; const dy = p.by - p.y;
            // Snappy Spring Physics
            p.vx += dx * 0.1; p.vy += dy * 0.1;
            p.vx *= 0.85; p.vy *= 0.85;
            p.x += p.vx; p.y += p.vy;
        });

        for (let i = this.colorShockwaves.length - 1; i >= 0; i--) {
            this.colorShockwaves[i].life--;
            if (this.colorShockwaves[i].life <= 0) this.colorShockwaves.splice(i, 1);
        }
    }

    draw(ctx, hue, centerX, centerY, combo, rainbowMode = false) {
        ctx.lineWidth = 1;

        const getWarpColor = (p1, p2) => {
            const d1 = Math.sqrt((p1.x - p1.bx) ** 2 + (p1.y - p1.by) ** 2);
            const d2 = Math.sqrt((p2.x - p2.bx) ** 2 + (p2.y - p2.by) ** 2);
            const avgDisp = (d1 + d2) / 2;
            const warpThreshold = 3;

            // Check for color shockwaves
            let shockColor = null;
            const mpX = (p1.x + p2.x) / 2;
            const mpY = (p1.y + p2.y) / 2;

            for (let sw of this.colorShockwaves) {
                const dist = Math.hypot(mpX - sw.x, mpY - sw.y);
                if (Math.abs(dist - sw.radius) < 50) { // Ring width
                    shockColor = sw.color;
                    break; // Prioritize most recent? Or blend?
                }
            }

            if (shockColor) return shockColor;

            if (rainbowMode || avgDisp > warpThreshold) {
                const warpHue = (hue + avgDisp * 3 + (rainbowMode ? (p1.x + p1.y) * 0.1 : 0)) % 360;
                const comboFactor = Math.min(1, combo / 50);
                const saturation = rainbowMode ? 100 : Math.min(100, 20 + avgDisp * 2 + comboFactor * 60);
                const lightness = rainbowMode ? 50 : Math.min(70, 30 + avgDisp);
                return `hsl(${warpHue}, ${saturation}%, ${lightness}%)`;
            } else {
                return 'rgba(255, 255, 255, 0.08)';
            }
        };

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const i = y * this.cols + x;
                const p = this.points[i];

                const dx = p.x - centerX;
                const dy = p.y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const distortion = 1 + (dist * 0.0002);
                const fx = centerX + dx * distortion;
                const fy = centerY + dy * distortion;

                if (x < this.cols - 1) {
                    const pRight = this.points[i + 1];
                    const rdx = pRight.x - centerX;
                    const rdy = pRight.y - centerY;
                    const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
                    const rdistort = 1 + (rdist * 0.0002);
                    ctx.strokeStyle = getWarpColor(p, pRight);
                    ctx.beginPath();
                    ctx.moveTo(fx, fy);
                    ctx.lineTo(centerX + rdx * rdistort, centerY + rdy * rdistort);
                    ctx.stroke();
                }
                if (y < this.rows - 1) {
                    const pDown = this.points[i + this.cols];
                    const ddx = pDown.x - centerX;
                    const ddy = pDown.y - centerY;
                    const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
                    const ddistort = 1 + (ddist * 0.0002);
                    ctx.strokeStyle = getWarpColor(p, pDown);
                    ctx.beginPath();
                    ctx.moveTo(fx, fy);
                    ctx.lineTo(centerX + ddx * ddistort, centerY + ddy * ddistort);
                    ctx.stroke();
                }
            }
        }
    }
}
