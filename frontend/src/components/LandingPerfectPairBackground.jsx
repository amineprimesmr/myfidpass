import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { Plane, shaderMaterial } from "@react-three/drei";
import { createRoot } from "react-dom/client";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uLineOpacity;
uniform float uScale;
uniform float uLineThickness;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 0.001);
  vec2 centered = uv - 0.5;
  centered.x *= aspect;
  float dist = length(centered);
  float radius = 0.63;
  float mask = 1.0 - smoothstep(radius - 0.01, radius + 0.01, dist);

  vec2 nUv = uv;
  nUv.x *= aspect;
  float n = noise(nUv * uScale + vec2(uTime * 0.04, uTime * 0.025));
  float lines = fract(n * 6.5);
  float pattern = smoothstep(0.5 - uLineThickness, 0.5, lines) - smoothstep(0.5, 0.5 + uLineThickness, lines);

  float grain = (hash(vUv * 177.31 + uTime * 0.001) - 0.5) * 0.08;
  vec3 finalColor = uColor + grain;
  gl_FragColor = vec4(finalColor, pattern * uLineOpacity * mask * uOpacity);
}
`;

const TopographyMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color("#2f3d57"),
    uResolution: new THREE.Vector2(1, 1),
    uOpacity: 1,
    uLineOpacity: 0.42,
    uScale: 3.2,
    uLineThickness: 0.045,
  },
  vertexShader,
  fragmentShader
);

extend({ TopographyMaterial });

function TopologyPlane() {
  const materialRef = useRef(null);
  const { viewport } = useThree();
  const planeSize = useMemo(() => [90, 42], []);

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uTime += delta;
    materialRef.current.uResolution.set(viewport.width, viewport.height);
  });

  return (
    <Plane args={planeSize} position={[0, 0, -10]} renderOrder={-1}>
      <topographyMaterial ref={materialRef} transparent depthWrite={false} />
    </Plane>
  );
}

function LandingPerfectPairBackground() {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
      <TopologyPlane />
    </Canvas>
  );
}

let mountedRoot = null;

export function mountLandingPerfectPairBackground() {
  const rootEl = document.getElementById("landing-perfect-pair-bg-root");
  if (!rootEl) return;
  if (!mountedRoot) mountedRoot = createRoot(rootEl);
  mountedRoot.render(<LandingPerfectPairBackground />);
}
