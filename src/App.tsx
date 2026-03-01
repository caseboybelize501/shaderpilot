import { Canvas, useFrame } from '@react-three/fiber';
import { FlyControls, Sky, Stars, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, DepthOfField } from '@react-three/postprocessing';
import { useControls, folder } from 'leva';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  varying float vElevation;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uElevationScale;
  uniform float uNoiseScale;

  // 2D Random
  float random (in vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // 2D Noise based on Morgan McGuire @morgan3d
  float noise (in vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);

      // Four corners in 2D of a tile
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));

      // Smooth Interpolation
      vec2 u = f*f*(3.0-2.0*f);

      // Mix 4 coorners percentages
      return mix(a, b, u.x) +
              (c - a)* u.y * (1.0 - u.x) +
              (d - b) * u.x * u.y;
  }

  float fbm (in vec2 st) {
      float value = 0.0;
      float amplitude = .5;
      float frequency = 0.;
      // Loop of octaves
      for (int i = 0; i < 6; i++) {
          value += amplitude * noise(st);
          st *= 2.;
          amplitude *= .5;
      }
      return value;
  }

  void main() {
    vUv = uv;
    
    vec2 noisePos = uv * uNoiseScale + vec2(0.0, uTime * uSpeed);
    float elevation = fbm(noisePos) * uElevationScale;
    
    vElevation = elevation;
    
    vec3 newPosition = position;
    newPosition.z += elevation;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  varying float vElevation;

  uniform vec3 uColorWater;
  uniform vec3 uColorSand;
  uniform vec3 uColorGrass;
  uniform vec3 uColorRock;
  uniform vec3 uColorSnow;
  uniform vec3 uGridColor;
  uniform float uGridOpacity;
  uniform float uElevationScale;

  void main() {
    float normalizedElevation = vElevation / uElevationScale;
    
    vec3 color = uColorWater;
    
    if (normalizedElevation < 0.2) {
      color = uColorWater;
    } else if (normalizedElevation < 0.3) {
      float mixRatio = smoothstep(0.2, 0.3, normalizedElevation);
      color = mix(uColorWater, uColorSand, mixRatio);
    } else if (normalizedElevation < 0.5) {
      float mixRatio = smoothstep(0.3, 0.5, normalizedElevation);
      color = mix(uColorSand, uColorGrass, mixRatio);
    } else if (normalizedElevation < 0.7) {
      float mixRatio = smoothstep(0.5, 0.7, normalizedElevation);
      color = mix(uColorGrass, uColorRock, mixRatio);
    } else {
      float mixRatio = smoothstep(0.7, 0.9, normalizedElevation);
      color = mix(uColorRock, uColorSnow, mixRatio);
    }

    // Add some simple grid lines for a "synthwave" or "pilot" feel
    vec2 grid = fract(vUv * 100.0);
    float line = step(0.98, grid.x) + step(0.98, grid.y);
    color = mix(color, uGridColor, line * uGridOpacity);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

const Terrain = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const {
    speed,
    elevationScale,
    noiseScale,
    colorWater,
    colorSand,
    colorGrass,
    colorRock,
    colorSnow,
    gridColor,
    gridOpacity,
    wireframe
  } = useControls('Terrain Shader', {
    speed: { value: 0.05, min: 0, max: 0.5, step: 0.01 },
    elevationScale: { value: 20.0, min: 1, max: 50, step: 0.1 },
    noiseScale: { value: 10.0, min: 1, max: 50, step: 0.1 },
    Colors: folder({
      colorWater: '#0f172a',
      colorSand: '#b45309',
      colorGrass: '#065f46',
      colorRock: '#3f3f46',
      colorSnow: '#f8fafc',
    }),
    Grid: folder({
      gridColor: '#06b6d4',
      gridOpacity: { value: 0.3, min: 0, max: 1, step: 0.05 }
    }),
    wireframe: false
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uElevationScale: { value: elevationScale },
      uNoiseScale: { value: noiseScale },
      uColorWater: { value: new THREE.Color(colorWater) },
      uColorSand: { value: new THREE.Color(colorSand) },
      uColorGrass: { value: new THREE.Color(colorGrass) },
      uColorRock: { value: new THREE.Color(colorRock) },
      uColorSnow: { value: new THREE.Color(colorSnow) },
      uGridColor: { value: new THREE.Color(gridColor) },
      uGridOpacity: { value: gridOpacity }
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uSpeed.value = speed;
      materialRef.current.uniforms.uElevationScale.value = elevationScale;
      materialRef.current.uniforms.uNoiseScale.value = noiseScale;
      materialRef.current.uniforms.uColorWater.value.set(colorWater);
      materialRef.current.uniforms.uColorSand.value.set(colorSand);
      materialRef.current.uniforms.uColorGrass.value.set(colorGrass);
      materialRef.current.uniforms.uColorRock.value.set(colorRock);
      materialRef.current.uniforms.uColorSnow.value.set(colorSnow);
      materialRef.current.uniforms.uGridColor.value.set(gridColor);
      materialRef.current.uniforms.uGridOpacity.value = gridOpacity;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry args={[400, 400, 256, 256]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        wireframe={wireframe}
      />
    </mesh>
  );
};

const PostProcessing = () => {
  const { bloomIntensity, vignetteDarkness } = useControls('Post Processing', {
    bloomIntensity: { value: 0.5, min: 0, max: 2, step: 0.1 },
    vignetteDarkness: { value: 0.5, min: 0, max: 1, step: 0.05 }
  });

  return (
    <EffectComposer>
      <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />
      <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={bloomIntensity} />
      <Vignette eskil={false} offset={0.1} darkness={vignetteDarkness} />
    </EffectComposer>
  );
};

const FloatingRings = () => {
  const { ringCount, ringRadius, ringColor } = useControls('Rings', {
    ringCount: { value: 20, min: 0, max: 100, step: 1 },
    ringRadius: { value: 5, min: 1, max: 20, step: 0.5 },
    ringColor: '#06b6d4'
  });

  const rings = useMemo(() => {
    const temp = [];
    for (let i = 0; i < ringCount; i++) {
      temp.push({
        position: [
          (Math.random() - 0.5) * 200,
          Math.random() * 30 + 10,
          (Math.random() - 0.5) * 200
        ],
        rotation: [
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          0
        ],
        scale: Math.random() * 0.5 + 0.5
      });
    }
    return temp;
  }, [ringCount]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.rotation.x += 0.01 * (i % 2 === 0 ? 1 : -1);
        child.rotation.y += 0.005 * (i % 3 === 0 ? 1 : -1);
        child.position.y += Math.sin(state.clock.elapsedTime * 2 + i) * 0.05;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {rings.map((props, i) => (
        <mesh key={i} position={props.position as [number, number, number]} rotation={props.rotation as [number, number, number]} scale={props.scale}>
          <torusGeometry args={[ringRadius, 0.5, 16, 100]} />
          <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.5} wireframe />
        </mesh>
      ))}
    </group>
  );
};

export default function App() {
  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans">
      <Canvas camera={{ position: [0, 10, 30], fov: 60 }}>
        <color attach="background" args={['#020617']} />
        <Sky sunPosition={[100, 10, 100]} turbidity={0.1} rayleigh={0.5} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        
        <Terrain />
        <FloatingRings />
        <PostProcessing />
        
        <FlyControls movementSpeed={20} rollSpeed={0.5} dragToLook />
      </Canvas>
      
      <div className="absolute top-6 left-6 text-white pointer-events-none z-10">
        <h1 className="text-4xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
          SHADER PILOT
        </h1>
        <div className="space-y-1 text-sm text-slate-300 font-mono bg-black/40 p-4 rounded-lg backdrop-blur-sm border border-white/10">
          <p><span className="text-cyan-400">MOUSE</span> Click + Drag to look</p>
          <p><span className="text-cyan-400">W A S D</span> Move forward/left/back/right</p>
          <p><span className="text-cyan-400">R F</span> Move up/down</p>
          <p><span className="text-cyan-400">Q E</span> Roll left/right</p>
        </div>
      </div>
    </div>
  );
}
