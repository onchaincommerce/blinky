"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type EyeLogoProps = {
  className?: string;
};

function createCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas is not available");
  }

  return { canvas, context };
}

function createEyeballTexture() {
  const { canvas, context } = createCanvas(1024);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  context.fillStyle = "#faf2f4";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const edgeTint = context.createRadialGradient(centerX, centerY, canvas.width * 0.16, centerX, centerY, canvas.width * 0.58);
  edgeTint.addColorStop(0, "rgba(255, 250, 252, 0)");
  edgeTint.addColorStop(0.7, "rgba(214, 116, 132, 0.1)");
  edgeTint.addColorStop(1, "rgba(136, 18, 38, 0.32)");
  context.fillStyle = edgeTint;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const vesselColors = ["rgba(150, 16, 37, 0.56)", "rgba(183, 23, 46, 0.42)", "rgba(208, 43, 66, 0.24)"];
  const branches = [
    { startX: 74, endX: 392, direction: 1 },
    { startX: 96, endX: 428, direction: -1 },
    { startX: 950, endX: 634, direction: -1 },
    { startX: 928, endX: 600, direction: 1 }
  ] as const;

  for (const branch of branches) {
    for (let index = 0; index < 12; index += 1) {
      const startY = 176 + index * 54;
      const endY = 214 + index * 20 * branch.direction;
      const swing = Math.sin(index * 1.37) * 44;
      const midX = (branch.startX + branch.endX) / 2 + swing;
      const midY = (startY + endY) / 2 + Math.cos(index * 1.91) * 32;

      context.beginPath();
      context.moveTo(branch.startX, startY);
      context.quadraticCurveTo(midX, midY, branch.endX, endY);
      context.strokeStyle = vesselColors[index % vesselColors.length];
      context.lineWidth = 1.5 + (index % 3) * 0.7;
      context.lineCap = "round";
      context.stroke();

      context.beginPath();
      context.moveTo(midX, midY);
      context.quadraticCurveTo(
        midX + branch.direction * 56,
        midY - Math.sin(index * 0.84) * 34,
        branch.endX + branch.direction * 28,
        endY + Math.cos(index * 1.23) * 26
      );
      context.strokeStyle = "rgba(208, 43, 66, 0.2)";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  const hotSpot = context.createRadialGradient(centerX - 100, centerY - 110, 14, centerX - 100, centerY - 110, 180);
  hotSpot.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  hotSpot.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = hotSpot;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createIrisTexture() {
  const { canvas, context } = createCanvas(1024);
  const radius = canvas.width / 2;

  context.translate(radius, radius);

  const fill = context.createRadialGradient(-110, -140, 28, 0, 0, radius);
  fill.addColorStop(0, "#ebfaff");
  fill.addColorStop(0.18, "#a1e2ff");
  fill.addColorStop(0.44, "#2f97ea");
  fill.addColorStop(0.72, "#1c3d69");
  fill.addColorStop(1, "#080d16");
  context.fillStyle = fill;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 220; index += 1) {
    const angle = (index / 220) * Math.PI * 2;
    const inner = radius * 0.16;
    const outer = radius * (0.56 + (Math.sin(index * 2.1) + 1) * 0.11);

    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.strokeStyle = index % 8 === 0 ? "rgba(255,255,255,0.3)" : "rgba(6, 16, 32, 0.18)";
    context.lineWidth = index % 5 === 0 ? 3.2 : 2;
    context.stroke();
  }

  context.beginPath();
  context.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
  context.strokeStyle = "rgba(5, 10, 18, 0.82)";
  context.lineWidth = 28;
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createGlowTexture() {
  const { canvas, context } = createCanvas(512);
  const radius = canvas.width / 2;

  const redGlow = context.createRadialGradient(radius + 72, radius + 8, 18, radius + 72, radius + 8, 220);
  redGlow.addColorStop(0, "rgba(255, 90, 110, 0.42)");
  redGlow.addColorStop(1, "rgba(255, 90, 110, 0)");
  context.fillStyle = redGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cyanGlow = context.createRadialGradient(radius - 92, radius - 72, 12, radius - 92, radius - 72, 170);
  cyanGlow.addColorStop(0, "rgba(107, 231, 255, 0.24)");
  cyanGlow.addColorStop(1, "rgba(107, 231, 255, 0)");
  context.fillStyle = cyanGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function EyeLogo({ className }: EyeLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const root = new THREE.Group();
    root.scale.setScalar(1.05);
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 1.18));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-0.9, 1.6, 5.4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaadfff, 0.8);
    fillLight.position.set(-2.4, -0.7, 3.8);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff4d5f, 8, 16, 2);
    rimLight.position.set(2.6, -1.2, 3.6);
    scene.add(rimLight);

    const glowTexture = createGlowTexture();
    const eyeballTexture = createEyeballTexture();
    const irisTexture = createIrisTexture();

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 3.5),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    halo.position.z = -1.15;
    root.add(halo);

    const eyeRig = new THREE.Group();
    eyeRig.position.z = 0.12;
    root.add(eyeRig);

    const gazeRig = new THREE.Group();
    eyeRig.add(gazeRig);

    const eyeball = new THREE.Mesh(
      new THREE.SphereGeometry(1.22, 96, 96),
      new THREE.MeshPhysicalMaterial({
        map: eyeballTexture,
        color: 0xfff8fb,
        roughness: 0.5,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.16
      })
    );
    eyeRig.add(eyeball);

    const cornea = new THREE.Mesh(
      new THREE.SphereGeometry(1.255, 96, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        roughness: 0.02,
        metalness: 0,
        transmission: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0
      })
    );
    eyeRig.add(cornea);

    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 96),
      new THREE.MeshStandardMaterial({
        map: irisTexture,
        transparent: true,
        roughness: 0.32,
        metalness: 0.08
      })
    );
    iris.position.z = 1.245;
    iris.renderOrder = 2;
    gazeRig.add(iris);

    const irisRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.615, 0.028, 20, 96),
      new THREE.MeshBasicMaterial({
        color: 0x08111c,
        transparent: true,
        opacity: 0.58
      })
    );
    irisRing.position.z = 1.248;
    irisRing.renderOrder = 3;
    gazeRig.add(irisRing);

    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 64),
      new THREE.MeshBasicMaterial({
        color: 0x020304
      })
    );
    pupil.position.z = 1.258;
    pupil.renderOrder = 4;
    gazeRig.add(pupil);

    const pupilCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0c121b
      })
    );
    pupilCore.position.z = 1.268;
    pupilCore.renderOrder = 5;
    gazeRig.add(pupilCore);

    const tipDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000
      })
    );
    tipDot.position.set(0, 0, 1.295);
    tipDot.renderOrder = 6;
    gazeRig.add(tipDot);

    const highlightLarge = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92
      })
    );
    highlightLarge.position.set(-0.25, 0.3, 1.285);
    highlightLarge.renderOrder = 7;
    gazeRig.add(highlightLarge);

    const highlightSmall = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45
      })
    );
    highlightSmall.position.set(-0.06, 0.1, 1.29);
    highlightSmall.renderOrder = 8;
    gazeRig.add(highlightSmall);

    const clock = new THREE.Clock();
    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerSmooth = new THREE.Vector2(0, 0);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      pointerTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    };

    const resetPointer = () => {
      pointerTarget.set(0, 0);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", resetPointer);
    window.addEventListener("blur", resetPointer);
    resize();

    renderer.setAnimationLoop(() => {
      const elapsed = clock.getElapsedTime();

      pointerSmooth.lerp(pointerTarget, 0.08);

      gazeRig.position.x = pointerSmooth.x * 0.34;
      gazeRig.position.y = -pointerSmooth.y * 0.18;
      eyeRig.rotation.y = -pointerSmooth.x * 0.05;
      eyeRig.rotation.x = pointerSmooth.y * 0.06;
      eyeRig.position.z = 0.12;

      halo.rotation.z = Math.sin(elapsed * 0.7) * 0.06;
      root.rotation.z = Math.sin(elapsed * 0.45) * 0.02;
      root.position.y = Math.sin(elapsed * 1.1) * 0.035;

      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer);

      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!("geometry" in mesh)) return;

        mesh.geometry?.dispose();

        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const entry of material) {
            entry.dispose();
          }
        } else {
          material?.dispose();
        }
      });

      glowTexture.dispose();
      eyeballTexture.dispose();
      irisTexture.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      aria-label="Blinky three-dimensional eye logo"
      className={["eye-logo", className].filter(Boolean).join(" ")}
      ref={containerRef}
      role="img"
    />
  );
}
