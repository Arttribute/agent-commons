"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type {
  ExperienceAsset,
  ExperienceStage,
  ExperienceStageNode3D,
} from "@/types/experience";

export function Experience3DStage({
  stage,
  assets,
  reducedMotion,
}: {
  stage: ExperienceStage;
  assets: ExperienceAsset[];
  reducedMotion: boolean;
}) {
  const three = stage.three;
  if (!three) return null;
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{
        position: three.cameraPosition,
        fov: 45,
        near: 0.05,
        far: 1000,
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ background: three.background }}
      fallback={
        <div className="flex h-full items-center justify-center bg-slate-950 text-xs text-white/55">
          3D preview is unavailable on this device.
        </div>
      }
    >
      <Suspense fallback={null}>
        <CameraTarget target={three.cameraTarget} />
        <ambientLight intensity={1.2} />
        <directionalLight
          position={[8, 12, 10]}
          intensity={2.5}
          color="#fff7e8"
        />
        <directionalLight
          position={[-10, 4, -6]}
          intensity={1.4}
          color="#8bd6ff"
        />
        {three.nodes.map((node) => (
          <StageNode
            key={node.id}
            node={node}
            asset={assets.find((asset) => asset.id === node.assetId)}
            reducedMotion={reducedMotion}
          />
        ))}
        <gridHelper args={[80, 80, "#325366", "#1b3443"]} position={[0, -2, 0]} />
        <OrbitControls
          target={three.cameraTarget}
          enablePan={false}
          enableDamping
          minDistance={2}
          maxDistance={40}
          maxPolarAngle={Math.PI * 0.74}
        />
      </Suspense>
    </Canvas>
  );
}

function CameraTarget({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(...target);
  }, [camera, target]);
  return null;
}

function StageNode({
  node,
  asset,
  reducedMotion,
}: {
  node: ExperienceStageNode3D;
  asset?: ExperienceAsset;
  reducedMotion: boolean;
}) {
  if (node.kind === "model" && asset?.url) {
    return (
      <ModelNode
        node={node}
        url={asset.url}
        reducedMotion={reducedMotion}
      />
    );
  }
  return <PrimitiveNode node={node} reducedMotion={reducedMotion} />;
}

function ModelNode({
  node,
  url,
  reducedMotion,
}: {
  node: ExperienceStageNode3D;
  url: string;
  reducedMotion: boolean;
}) {
  const gltf = useGLTF(url);
  const object = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const ref = useRef<THREE.Group>(null);
  useAnimatedNode(ref, node, reducedMotion);
  return (
    <group
      ref={ref}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
    >
      <primitive object={object} />
    </group>
  );
}

function PrimitiveNode({
  node,
  reducedMotion,
}: {
  node: ExperienceStageNode3D;
  reducedMotion: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useAnimatedNode(ref, node, reducedMotion);
  return (
    <mesh
      ref={ref}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      castShadow
      receiveShadow
    >
      {node.kind === "sphere" ? <sphereGeometry args={[1, 40, 24]} /> : null}
      {node.kind === "cylinder" ? (
        <cylinderGeometry args={[1, 1, 2, 40]} />
      ) : null}
      {node.kind === "cone" ? <coneGeometry args={[1, 2, 40]} /> : null}
      {node.kind === "plane" ? <planeGeometry args={[2, 2]} /> : null}
      {node.kind === "box" ? <boxGeometry args={[2, 2, 2]} /> : null}
      <meshStandardMaterial
        color={node.color || "#71E0E7"}
        metalness={node.metallic ?? 0.1}
        roughness={node.roughness ?? 0.55}
      />
    </mesh>
  );
}

function useAnimatedNode(
  ref: React.RefObject<THREE.Object3D | null>,
  node: ExperienceStageNode3D,
  reducedMotion: boolean,
) {
  useFrame((state, delta) => {
    if (!ref.current || reducedMotion) return;
    if (node.animation === "rotate") {
      ref.current.rotation.y += delta * 0.35;
    }
    if (node.animation === "float") {
      ref.current.position.y =
        node.position[1] + Math.sin(state.clock.elapsedTime * 1.2) * 0.15;
    }
  });
}
