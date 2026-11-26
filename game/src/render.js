// Sky Courier's renderer: a chase-view pseudo-3D scene painted on one canvas.
// The camera sits behind the plane and looks down the course; the valley floor
// is drawn as a projected mesh, peaks as cones, rings as glowing hoops, and the
// plane itself as a drawn jet seen from behind. The HUD — altitude, speed,
// heading, fuel, throttle, artificial horizon, score — is drawn over it, and
// the title, pause and end screens are drawn over that.

import {
  CAMERA,
  COURSE_LENGTH,
  FIELD,
  FONT,
  MISSIONS,
  PALETTE,
  RING,
  RUNWAY_LENGTH,
  RUNWAY_WIDTH,
} from './config.js';
import { clamp, degToRad, lerp, radToDeg } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

/** How far the ground mesh reaches ahead of the camera, in metres. */
const VIEW_DISTANCE = 2600;
/** Metres between ground-mesh samples across the valley. */
const MESH_STEP_X = 75;
/** Screen-space size of the plane drawing, in pixels. */
const PLANE_WIDTH = 300;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;
  const CX = W / 2;
  const CY = H * 0.46;

  // --- projection ---------------------------------------------------------
  // The camera rides behind the plane. A world point is turned into camera
  // space (right, up, forward), then pinhole-projected onto the screen.
  function cameraFor(plane) {
    const headingRad = degToRad(plane.heading);
    return {
      x: plane.x - Math.sin(headingRad) * CAMERA.behind,
      y: plane.alt + CAMERA.above,
      z: plane.z - Math.cos(headingRad) * CAMERA.behind,
      heading: plane.heading,
      // The camera looks where the nose points, softened, and a touch down.
      pitch: plane.pitch * 0.4 + 2,
    };
  }

  function project(cam, x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const headingRad = degToRad(cam.heading);
    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    const forward = dx * sinH + dz * cosH;
    const right = dx * cosH - dz * sinH;
    const pitchRad = degToRad(cam.pitch);
    const up = dy * Math.cos(pitchRad) - forward * Math.sin(pitchRad);
    const depth = dy * Math.sin(pitchRad) + forward * Math.cos(pitchRad);
    if (depth < 2) return null;
    return {
      x: CX + (right / depth) * CAMERA.fov,
      y: CY - (up / depth) * CAMERA.fov,
      depth,
    };
  }

  // --- sky ----------------------------------------------------------------
  function drawSky(plane, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(0.78, PALETTE.skyHorizon);
    grad.addColorStop(1, PALETTE.terrainNear);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // The sun hangs ahead and to the right of the course, drifting with the
    // plane's heading so it stays put in the world, not on the screen.
    const sunAngle = degToRad(plane.heading + 38);
    const sunX = CX + Math.sin(sunAngle) * 420 - Math.sin(degToRad(plane.heading)) * 120;
    const sunY = 118 - plane.pitch * 1.4;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- terrain ------------------------------------------------------------
  function drawGround(cam, world) {
    // Depth slices grow geometrically: dense nearby, sparse far away.
    const slices = [];
    let z = cam.z + 10;
    while (z < cam.z + VIEW_DISTANCE) {
      slices.push(z);
      z += Math.max(14, (z - cam.z) * 0.16);
    }
    slices.push(cam.z + VIEW_DISTANCE);

    for (let s = slices.length - 1; s > 0; s -= 1) {
      const zFar = slices[s];
      const zNear = slices[s - 1];
      const far = (zFar - cam.z) / VIEW_DISTANCE;
      const pointsFar = [];
      const pointsNear = [];
      for (let x = -900; x <= 900; x += MESH_STEP_X) {
        const yFar = world.terrainHeight(x, zFar);
        const yNear = world.terrainHeight(x, zNear);
        pointsFar.push(project(cam, x, yFar, zFar));
        pointsNear.push(project(cam, x, yNear, zNear));
      }
      if (pointsFar.some((p) => p === null) || pointsNear.some((p) => p === null)) continue;
      // Colour: near ground is deep green, far ground fades into haze; high
      // ground turns rocky.
      const midHeight = world.terrainHeight(0, (zFar + zNear) / 2);
      let colour = mixColor(PALETTE.terrainNear, PALETTE.terrainFar, far);
      if (midHeight > 90) colour = mixColor(colour, PALETTE.peakRock, clamp((midHeight - 90) / 160, 0, 0.55));
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(pointsNear[0].x, pointsNear[0].y);
      for (const p of pointsNear) ctx.lineTo(p.x, p.y);
      for (let i = pointsFar.length - 1; i >= 0; i -= 1) ctx.lineTo(pointsFar[i].x, pointsFar[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(cam, world, z0) {
    const half = RUNWAY_WIDTH / 2;
    const corners = [
      project(cam, -half, 0.6, z0),
      project(cam, half, 0.6, z0),
      project(cam, half, 0.6, z0 + RUNWAY_LENGTH),
      project(cam, -half, 0.6, z0 + RUNWAY_LENGTH),
    ];
    if (corners.some((p) => p === null)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const p of corners) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and the threshold bars, drawn as small quads.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let dz = 20; dz < RUNWAY_LENGTH - 10; dz += 46) {
      const a = project(cam, -2.5, 0.8, z0 + dz);
      const b = project(cam, 2.5, 0.8, z0 + dz);
      const c = project(cam, 2.5, 0.8, z0 + dz + 22);
      const d = project(cam, -2.5, 0.8, z0 + dz + 22);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    // Edge lines.
    ctx.strokeStyle = PALETTE.runwayEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.moveTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.stroke();
  }

  function drawPeaks(cam, world) {
    const peaks = [...world.state.terrain.peaks].sort((a, b) => b.z - a.z);
    for (const peak of peaks) {
      const base = project(cam, peak.x, world.terrainHeight(peak.x, peak.z), peak.z);
      const apex = project(cam, peak.x, world.terrainHeight(peak.x, peak.z) + peak.height, peak.z);
      const left = project(cam, peak.x - peak.radius, world.terrainHeight(peak.x - peak.radius, peak.z), peak.z);
      const right = project(cam, peak.x + peak.radius, world.terrainHeight(peak.x + peak.radius, peak.z), peak.z);
      if (!base || !apex || !left || !right) continue;
      ctx.fillStyle = PALETTE.peakRock;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(apex.x, apex.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fill();
      // Snow cap: the top third of the triangle, in a lighter shade.
      const capY = lerp(apex.y, base.y, 0.34);
      const capLeftX = lerp(apex.x, left.x, 0.34);
      const capRightX = lerp(apex.x, right.x, 0.34);
      ctx.fillStyle = PALETTE.peakSnow;
      ctx.beginPath();
      ctx.moveTo(capLeftX, capY);
      ctx.lineTo(apex.x, apex.y);
      ctx.lineTo(capRightX, capY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(cam, world) {
    const clouds = [...world.state.clouds].sort((a, b) => b.z - a.z);
    for (const cloud of clouds) {
      const p = project(cam, cloud.x, cloud.alt, cloud.z);
      if (!p) continue;
      const scale = (cloud.size / p.depth) * CAMERA.fov;
      if (scale < 3) continue;
      ctx.fillStyle = PALETTE.cloud;
      ctx.globalAlpha = clamp(0.85 - p.depth / 3200, 0.15, 0.85);
      for (const [ox, oy, r] of [[-0.5, 0.1, 0.55], [0, -0.12, 0.7], [0.5, 0.08, 0.5]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * scale, p.y + oy * scale, r * scale, r * scale * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawRings(cam, world) {
    const rings = [...world.state.rings].sort((a, b) => b.z - a.z);
    for (const ring of rings) {
      const centre = project(cam, ring.x, ring.alt, ring.z);
      if (!centre) continue;
      const radius = (RING.radius / centre.depth) * CAMERA.fov;
      if (radius < 2) continue;
      const ground = project(cam, ring.x, world.terrainHeight(ring.x, ring.z), ring.z);
      // A faint tether down to the ground, so the ring's height reads.
      if (ground && !ring.done) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.lineTo(ground.x, ground.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const colour = ring.done ? PALETTE.ringDone : ring.missed ? PALETTE.hudMuted : PALETTE.ring;
      ctx.strokeStyle = ring.done ? 'rgba(126, 224, 129, 0.4)' : PALETTE.ringGlow;
      ctx.lineWidth = Math.max(3, radius * 0.28);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(2, radius * 0.12);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner tick marks make the hoop read as a ring, not a circle.
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1.5, radius * 0.06);
      for (let i = 0; i < 4; i += 1) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(centre.x + Math.cos(angle) * radius * 0.78, centre.y + Math.sin(angle) * radius * 0.78);
        ctx.lineTo(centre.x + Math.cos(angle) * radius * 0.94, centre.y + Math.sin(angle) * radius * 0.94);
        ctx.stroke();
      }
    }
  }

  // --- the plane ----------------------------------------------------------
  function drawPlaneShadow(cam, world) {
    const plane = world.state.plane;
    const ground = world.terrainHeight(plane.x, plane.z);
    const p = project(cam, plane.x, ground + 0.6, plane.z);
    if (!p) return;
    const size = clamp((26 / p.depth) * CAMERA.fov, 6, 120);
    ctx.fillStyle = PALETTE.planeShadow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The courier jet, seen from behind: fuselage, swept wings, tail, engines. */
  function drawPlane(world) {
    const plane = world.state.plane;
    const x = CX;
    const y = H * 0.66 + plane.pitch * 1.2;
    const scale = PLANE_WIDTH / 300;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degToRad(-plane.roll));
    ctx.scale(scale, scale);
    // Wings: one swept shape, accent-tipped.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-150, 26);
    ctx.lineTo(-138, 44);
    ctx.lineTo(-10, 22);
    ctx.lineTo(10, 22);
    ctx.lineTo(138, 44);
    ctx.lineTo(150, 26);
    ctx.lineTo(14, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.beginPath();
    ctx.moveTo(-150, 26);
    ctx.lineTo(-138, 44);
    ctx.lineTo(-118, 40);
    ctx.lineTo(-128, 28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(150, 26);
    ctx.lineTo(138, 44);
    ctx.lineTo(118, 40);
    ctx.lineTo(128, 28);
    ctx.closePath();
    ctx.fill();
    // Tail fin.
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.beginPath();
    ctx.moveTo(-8, -34);
    ctx.lineTo(0, -72);
    ctx.lineTo(8, -34);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering toward the nose (up the screen, away from us).
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-16, 34);
    ctx.quadraticCurveTo(-20, -30, -8, -58);
    ctx.lineTo(8, -58);
    ctx.quadraticCurveTo(20, -30, 16, 34);
    ctx.quadraticCurveTo(0, 44, -16, 34);
    ctx.closePath();
    ctx.fill();
    // Centreline stripe and cockpit glass hint.
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.fillRect(-2.5, -56, 5, 84);
    ctx.fillStyle = PALETTE.planeGlass;
    ctx.beginPath();
    ctx.ellipse(0, -46, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Engine glow: brighter with throttle.
    const glow = 0.35 + plane.throttle * 0.65;
    ctx.fillStyle = `rgba(255, 180, 80, ${glow})`;
    ctx.beginPath();
    ctx.ellipse(-11, 38, 6, 9 + plane.throttle * 8, 0, 0, Math.PI * 2);
    ctx.ellipse(11, 38, 6, 9 + plane.throttle * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- HUD ----------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function text(str, x, y, size, colour, align = 'left', weight = 600) {
    ctx.fillStyle = colour;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function drawHud(world, opts) {
    const plane = world.state.plane;
    const mission = world.state.mission;
    const speedKt = Math.round(plane.speed * 1.944);
    const altFt = Math.max(0, Math.round(plane.alt * 3.281));

    // Speed (top left), altitude (top right), compass (top centre).
    panel(18, 16, 150, 64);
    text(`${speedKt}`, 30, 52, 34, PALETTE.hudText, 'left', 800);
    text('KT', 108, 52, 15, PALETTE.hudMuted);
    text('SPEED', 30, 70, 11, PALETTE.hudMuted);
    panel(W - 168, 16, 150, 64);
    text(`${altFt}`, W - 156, 52, 34, PALETTE.hudText, 'left', 800);
    text('FT', W - 62, 52, 15, PALETTE.hudMuted);
    text('ALTITUDE', W - 156, 70, 11, PALETTE.hudMuted);

    const heading = world.compassHeading();
    panel(CX - 170, 16, 340, 64);
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let d = -60; d <= 60; d += 15) {
      const h = Math.round(((heading + d) % 360 + 360) % 360);
      const x = CX + (d / 60) * 150;
      const major = h % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.hudText : PALETTE.hudMuted;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 66);
      ctx.lineTo(x, major ? 52 : 58);
      ctx.stroke();
      if (major) text(labels[Math.round(h / 45) % 8], x, 44, 13, PALETTE.hudText, 'center', 700);
    }
    text(`${String(Math.round(heading)).padStart(3, '0')}°`, CX, 30, 16, PALETTE.hudAmber, 'center', 800);
    ctx.strokeStyle = PALETTE.hudAmber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CX, 48);
    ctx.lineTo(CX - 6, 58);
    ctx.lineTo(CX + 6, 58);
    ctx.closePath();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fill();

    // Left gauges: throttle, fuel, hull.
    panel(18, 96, 150, 150);
    text('THROTTLE', 30, 118, 11, PALETTE.hudMuted);
    bar(30, 126, 126, 12, plane.throttle, PALETTE.hudAmber);
    text('FUEL', 30, 162, 11, PALETTE.hudMuted);
    bar(30, 170, 126, 12, plane.fuel / 100, plane.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen);
    text('HULL', 30, 206, 11, PALETTE.hudMuted);
    bar(30, 214, 126, 12, 1 - plane.damage / 100, plane.damage > 0 ? PALETTE.hudRed : PALETTE.hudGreen);
    if (plane.fuel < 20) text('LOW FUEL', 30, 240, 12, PALETTE.hudRed, 'left', 800);

    // Right block: score, rings, time, mission.
    panel(W - 168, 96, 150, 150);
    text('SCORE', W - 156, 118, 11, PALETTE.hudMuted);
    text(`${world.state.score}`, W - 156, 146, 26, PALETTE.hudText, 'left', 800);
    text(`RINGS  ${world.state.ringsDone}/${mission.rings}`, W - 156, 172, 13, PALETTE.hudText);
    const mins = Math.floor(world.state.time / 60);
    const secs = Math.floor(world.state.time % 60);
    text(`TIME  ${mins}:${String(secs).padStart(2, '0')}`, W - 156, 194, 13, PALETTE.hudText);
    text(mission.name, W - 156, 218, 11, PALETTE.hudAmber, 'left', 700);

    drawArtificialHorizon(world);
    drawNextRingMarker(world);
    drawProgressStrip(world);

    // Toasts and warnings, centred below the next-ring marker so the two
    // never sit on top of each other.
    if (world.state.toastTimer > 0 && world.state.toast) {
      ctx.globalAlpha = clamp(world.state.toastTimer / 0.6, 0, 1);
      text(world.state.toast, CX, 178, 26, PALETTE.hudText, 'center', 800);
      ctx.globalAlpha = 1;
    }
    if (opts.muted) text('MUTED  (M)', W - 24, H - 18, 12, PALETTE.hudMuted, 'right');
  }

  function bar(x, y, w, h, fraction, colour) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * clamp(fraction, 0, 1)), h, h / 2);
    ctx.fill();
  }

  function drawArtificialHorizon(world) {
    const plane = world.state.plane;
    const cx = 92;
    const cy = H - 92;
    const r = 56;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#7fb0d8';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(degToRad(-plane.roll));
    ctx.translate(0, clamp(plane.pitch * 1.6, -r, r));
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.fillStyle = '#eef4f8';
    ctx.fillRect(-r, -1.5, r * 2, 3);
    ctx.restore();
    ctx.strokeStyle = PALETTE.hudAmber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    text('ATTITUDE', cx, cy + r + 18, 11, PALETTE.hudMuted, 'center');
  }

  function drawNextRingMarker(world) {
    const ring = world.nextRingTarget();
    if (!ring || world.state.status !== 'flying') return;
    const plane = world.state.plane;
    const dx = ring.x - plane.x;
    const dz = Math.max(1, ring.z - plane.z);
    const dist = Math.round(Math.sqrt(dx * dx + dz * dz + (ring.alt - plane.alt) ** 2));
    // Bearing relative to the nose, in degrees: 0 is straight ahead.
    const bearing = radToDeg(Math.atan2(dx, dz)) - plane.heading;
    const wrapped = ((bearing + 540) % 360) - 180;
    const clamped = clamp(wrapped, -70, 70);
    const x = CX + (clamped / 70) * (W / 2 - 90);
    const y = 108;
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x - 9, y - 6);
    ctx.lineTo(x + 9, y - 6);
    ctx.closePath();
    ctx.fill();
    text(`NEXT RING  ${dist}m`, x, y + 34, 13, PALETTE.hudAmber, 'center', 700);
  }

  function drawProgressStrip(world) {
    const y = H - 26;
    const x0 = CX - 220;
    const w = 440;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(x0, y, w, 6, 3);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.roundRect(x0, y, Math.max(6, w * world.progress()), 6, 3);
    ctx.fill();
    for (const ring of world.state.rings) {
      const x = x0 + (ring.z / COURSE_LENGTH) * w;
      ctx.fillStyle = ring.done ? PALETTE.ringDone : ring.missed ? PALETTE.hudMuted : PALETTE.ring;
      ctx.beginPath();
      ctx.arc(x, y + 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    text('HOME', x0 - 8, y + 5, 11, PALETTE.hudMuted, 'right', 700);
    text('DEST', x0 + w + 8, y + 5, 11, PALETTE.hudMuted, 'left', 700);
  }

  // --- screens ------------------------------------------------------------
  function drawTitle(world, opts) {
    ctx.fillStyle = 'rgba(8, 18, 30, 0.45)';
    ctx.fillRect(0, 0, W, H);
    text('SKY COURIER', CX, 150, 72, PALETTE.hudText, 'center', 800);
    text('a pocket flight game — fly the rings, land the parcel', CX, 192, 20, PALETTE.hudAmber, 'center');
    MISSIONS.forEach((mission, i) => {
      const y = 250 + i * 96;
      const selected = opts.selectedMission === i;
      ctx.fillStyle = selected ? 'rgba(255, 207, 61, 0.16)' : PALETTE.hudPanel;
      ctx.beginPath();
      ctx.roundRect(CX - 330, y, 660, 80, 12);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = PALETTE.hudAmber;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(`${i + 1}  ${mission.name}`, CX - 310, y + 32, 22, PALETTE.hudText, 'left', 800);
      text(mission.tagline, CX - 310, y + 58, 14, PALETTE.hudMuted);
      const best = opts.best[i] || 0;
      text(best > 0 ? `BEST ${best}` : 'NOT FLOWN YET', CX + 310, y + 32, 14, best > 0 ? PALETTE.hudGreen : PALETTE.hudMuted, 'right', 700);
    });
    text('Click a mission or press 1 / 2 / 3, then press SPACE to take off', CX, 566, 17, PALETTE.hudText, 'center');
    text('← → steer    ↑ ↓ pitch    SHIFT throttle up    Q throttle down    drag to steer on touch    P pause    M mute', CX, 596, 14, PALETTE.hudMuted, 'center');
    text('Fly every ring, mind the fuel, and land gently on the far runway.', CX, 626, 14, PALETTE.hudMuted, 'center');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 18, 30, 0.6)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSED', CX, 330, 56, PALETTE.hudText, 'center', 800);
    text('Press P or ESC to keep flying — SPACE restarts the mission', CX, 380, 17, PALETTE.hudMuted, 'center');
  }

  function drawOver(world, opts) {
    const state = world.state;
    ctx.fillStyle = 'rgba(20, 8, 8, 0.55)';
    ctx.fillRect(0, 0, W, H);
    text('SORTIE LOST', CX, 250, 56, PALETTE.hudRed, 'center', 800);
    text(state.crashReason, CX, 296, 19, PALETTE.hudText, 'center');
    text(`SCORE  ${state.score}     RINGS  ${state.ringsDone}/${state.mission.rings}`, CX, 350, 20, PALETTE.hudText, 'center', 700);
    const best = opts.best[state.missionIndex] || 0;
    if (state.score > best && state.score > 0) text('NEW BEST SCORE!', CX, 392, 20, PALETTE.hudGreen, 'center', 800);
    text('Press SPACE to fly again — P for the mission picker', CX, 450, 17, PALETTE.hudMuted, 'center');
  }

  function drawLanded(world, opts) {
    const state = world.state;
    const q = state.landingQuality ?? { sink: 0, centreOffset: 0, speed: 0 };
    ctx.fillStyle = 'rgba(8, 24, 14, 0.55)';
    ctx.fillRect(0, 0, W, H);
    text(state.landedHome ? 'BACK HOME' : 'DELIVERED!', CX, 220, 56, PALETTE.hudGreen, 'center', 800);
    text(state.landedHome ? 'You came home early — the parcel never arrived.' : 'Parcel delivered, wheels down, engines off.', CX, 266, 19, PALETTE.hudText, 'center');
    const lines = [
      ['TOUCHDOWN', `${q.sink.toFixed(1)} m/s down, ${q.centreOffset.toFixed(0)} m off centre`],
      ['RINGS', `${state.ringsDone} of ${state.mission.rings}`],
      ['TIME', `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}  (par ${state.mission.parSeconds}s)`],
      ['FUEL LEFT', `${Math.round(state.plane.fuel)}%`],
      ['FINAL SCORE', `${state.score}`],
    ];
    lines.forEach(([label, value], i) => {
      const y = 320 + i * 34;
      text(label, CX - 190, y, 15, PALETTE.hudMuted, 'left', 700);
      text(value, CX + 190, y, 17, i === lines.length - 1 ? PALETTE.hudAmber : PALETTE.hudText, 'right', 800);
    });
    const best = opts.best[state.missionIndex] || 0;
    if (state.score > best && state.score > 0) text('NEW BEST SCORE!', CX, 516, 20, PALETTE.hudGreen, 'center', 800);
    text('Press SPACE to fly again — P for the mission picker', CX, 556, 17, PALETTE.hudMuted, 'center');
  }

  function drawRain(time) {
    ctx.strokeStyle = PALETTE.rain;
    ctx.lineWidth = 1;
    for (let i = 0; i < 70; i += 1) {
      const seedX = (i * 173.3) % W;
      const seedY = (i * 97.7) % H;
      const x = (seedX + time * 40) % W;
      const y = (seedY + time * 520) % H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + 18);
      ctx.stroke();
    }
  }

  /** Paint one frame. `screen` is one of the SCREEN_* names; `opts` carries
   *  the best scores, the selected mission and the mute flag. */
  function draw(world, screen, opts) {
    const state = world.state;
    const plane = state.plane;
    const time = state.time;
    drawSky(plane, time);
    ctx.save();
    // The world banks with the plane, a little: the horizon tilts, the HUD
    // stays level, and the pilot feels the roll without losing the instruments.
    ctx.translate(CX, CY);
    ctx.rotate(degToRad(-plane.roll * 0.55));
    ctx.translate(-CX, -CY);
    const cam = cameraFor(plane);
    drawGround(cam, world);
    drawRunway(cam, world, 0);
    drawRunway(cam, world, COURSE_LENGTH - RUNWAY_LENGTH);
    drawPeaks(cam, world);
    drawClouds(cam, world);
    drawRings(cam, world);
    ctx.restore();
    drawPlaneShadow(cam, world);
    // The plane is always in frame: parked on the home runway on the title
    // screen, in the air once the sortie has started.
    drawPlane(world);
    if (world.state.mission.rain && screen === SCREEN_PLAY) drawRain(time);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(world, opts);
    if (screen === SCREEN_TITLE) drawTitle(world, opts);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(world, opts);
    if (screen === SCREEN_LANDED) drawLanded(world, opts);
  }

  return { draw };
}
