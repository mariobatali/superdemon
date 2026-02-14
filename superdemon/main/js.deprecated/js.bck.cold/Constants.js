export const WARDENS_NEEDED_FOR_RITUAL = 3;
export const STARTING_COMBO = 0

export const UPGRADES_DB = {
    explosion: { name: 'Nuke Exit', icon: '💥', max: 5, desc: (l) => `Dash blast radius increases.`, stat: (l) => `Radius: ${70 + l * 20}px` },
    echo: { name: 'Echo Slash', icon: '➰', max: 5, desc: (l) => l >= 2 ? `Trail creates Vacuum.` : `Trail is lethal.`, stat: (l) => `Duration: ${(30 + (l + 1) * 20) / 60}s` },
    phase: { name: 'Mine Eater', icon: '😋', max: 3, desc: (l) => `Dash destroys Mines & grants XP.`, stat: (l) => `XP Bonus: ${l + 1}x` },
    ram: { name: 'RAM Expand', icon: '💾', max: 5, desc: (l) => `Increases Max RAM capacity.`, stat: (l) => `Max RAM: ${3 + (l + 1)}` },
    range: { name: 'Signal Boost', icon: '📡', max: 5, desc: (l) => `Increases Stun Shockwave size.`, stat: (l) => `Range: ${120 + (l + 1) * 50}%` },
    nanites: { name: 'Nanite Swarm', icon: '🦟', max: 5, desc: (l) => `Kills spawn hunter drones.`, stat: (l) => `Drones: ${Math.min(3, l + 1)}` },
    voltage: { name: 'Voltage Leak', icon: '🔥', max: 5, desc: (l) => `Burn enemies while Aiming.`, stat: (l) => `Dmg Radius: ${120 + (l + 1) * 40}px` }
};
