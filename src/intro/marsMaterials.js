import * as THREE from 'three';
import { INTRO } from './introConfig.js';

/**
 * Shared, framework-agnostic shader + material factories.
 * The React Three Fiber scene builds its meshes from these, so the look lives in one place.
 */

/** Prepare loaded NASA-derived textures for physically based rendering. */
export function prepareMarsTextures({ color, normal }, renderer) {
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
  color.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  for (const tex of [color, normal]) {
    tex.anisotropy = Math.min(8, maxAniso);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }
  return { color, normal };
}

/**
 * Mars surface: a MeshStandardMaterial (PBR, real lighting + normal-mapped relief)
 * extended with three subtle shader touches:
 *  1. colour grading that pulls the albedo back toward the dusty, slightly desaturated
 *     tone seen in calibrated NASA imagery (no cartoon orange)
 *  2. a faint terracotta scatter along the terminator, where sunlight grazes the dust
 *  3. a thin copper haze on the lit limb (the atmosphere seen edge-on)
 */
export function createMarsMaterial({ color, normal }) {
  const uniforms = {
    uSunDirView: { value: new THREE.Vector3(...INTRO.sunDirection).normalize() },
    uLight: { value: 0 }, // 0 → 1 during the reveal
    uTerminator: { value: new THREE.Color(INTRO.colors.terminator) },
    uHaze: { value: new THREE.Color(INTRO.colors.rimOuter) },
  };

  const material = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    normalScale: new THREE.Vector2(INTRO.planet.normalScale, INTRO.planet.normalScale),
    roughness: 0.96,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDirView;
        uniform float uLight;
        uniform vec3 uTerminator;
        uniform vec3 uHaze;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(luma), diffuseColor.rgb, 0.74);
          diffuseColor.rgb *= vec3(1.03, 0.93, 0.86);
        }`
      )
      .replace(
        '#include <dithering_fragment>',
        `{
          vec3 nView = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float ndl = dot(nView, uSunDirView);
          // Thin band either side of the day/night line
          float band = smoothstep(-0.14, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.32, ndl));
          gl_FragColor.rgb += uTerminator * band * 0.045 * uLight;
          // Edge-on haze, only on the sunlit side
          float rim = pow(1.0 - clamp(dot(nView, viewDir), 0.0, 1.0), 3.5);
          float lit = smoothstep(-0.05, 0.55, ndl);
          gl_FragColor.rgb += uHaze * rim * lit * 0.22 * uLight;
          // The night side melts into the same black as space instead of reading as a dark cut-out
          gl_FragColor.rgb = max(gl_FragColor.rgb, vec3(0.0196, 0.0196, 0.0275));
        }
        #include <dithering_fragment>`
      );
  };

  // Make sure the patched program is cached separately from plain standard materials
  material.customProgramCacheKey = () => 'beyond-terra-mars-v1';

  return { material, uniforms };
}

/**
 * Atmosphere: a slightly larger back-facing shell, additively blended.
 * Brightest right at the limb, fading outward, and strongest where the sun hits —
 * the night-side limb fades into darkness instead of glowing like a neon ring.
 */
export function createAtmosphereMaterial() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(...INTRO.sunDirection).normalize() },
    uInner: { value: new THREE.Color(INTRO.colors.rimInner) },
    uOuter: { value: new THREE.Color(INTRO.colors.rimOuter) },
    uLight: { value: 0 },
    uShell: { value: 1.055 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vPosView;
      varying vec3 vNormalWorld;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPosView = mv.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uInner;
      uniform vec3 uOuter;
      uniform float uLight;
      uniform float uShell;
      varying vec3 vNormalView;
      varying vec3 vPosView;
      varying vec3 vNormalWorld;
      void main() {
        vec3 viewDir = normalize(-vPosView);
        // Back faces: facing runs from ~-limbDepth (at the planet's edge) to 0 (shell edge)
        float facing = dot(normalize(vNormalView), viewDir);
        float limbDepth = sqrt(max(1.0 - 1.0 / (uShell * uShell), 1e-4));
        float t = clamp(-facing / limbDepth, 0.0, 1.0);
        float glow = pow(t, 2.6);
        float sun = smoothstep(-0.25, 0.75, dot(normalize(vNormalWorld), uSunDir));
        vec3 col = mix(uOuter, uInner, t);
        float a = glow * (0.12 + 0.88 * sun) * 0.62 * uLight;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { material, uniforms };
}

/** Distant, very faint stars. Mostly dim pin-pricks, a handful slightly brighter. */
export function createStarGeometry({ count, radius }, seed = 7) {
  // Small deterministic PRNG so the sky is identical on every visit
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const warm = new THREE.Color('#F3E5DC');
  const cool = new THREE.Color('#DCE3F2');
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = radius[0] + rand() * (radius[1] - radius[0]);
    const k = Math.sqrt(1 - u * u);
    positions.set([r * k * Math.cos(theta), r * u, r * k * Math.sin(theta)], i * 3);

    const b = Math.pow(rand(), 3.2); // heavy tail: most stars are barely there
    brightness[i] = 0.12 + b * 0.75;
    sizes[i] = 0.7 + b * 1.6;
    tmp.copy(warm).lerp(cool, rand());
    tints.set([tmp.r, tmp.g, tmp.b], i * 3);
    phases[i] = rand() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

export function createStarMaterial(pixelRatio = 1) {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uPixelRatio: { value: pixelRatio },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aBrightness;
      attribute vec3 aTint;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio;
        float twinkle = 0.88 + 0.12 * sin(uTime * 0.9 + aPhase);
        vAlpha = aBrightness * twinkle;
        vTint = aTint;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float soft = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vTint, soft * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { material, uniforms };
}
