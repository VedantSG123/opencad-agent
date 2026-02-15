import { Plane } from '@react-three/drei';
import * as React from 'react';
import * as THREE from 'three';

interface InfiniteGridOptions {
  size1?: number;
  size2?: number;
  color?: THREE.Color | string | number;
  distance?: number;
  axes?: 'xy' | 'xz' | 'yz';
}

export function InfiniteGridMaterial({
  size1 = 10,
  size2 = 100,
  color = new THREE.Color('#888888'),
  distance = 8000,
  axes = 'xy',
}: InfiniteGridOptions = {}): THREE.ShaderMaterial {
  const planeAxes = axes.slice(0, 2);

  // GLSL expression for positioning depending on chosen axes
  function axisToVec3(axes: 'xy' | 'xz' | 'yz'): string {
    switch (axes) {
      case 'xz':
        return 'vec3(position.xz * uDistance, 0.0)';
      case 'xy':
        return 'vec3(position.xy * uDistance, 0.0)';
      case 'yz':
        return 'vec3(0.0, position.yz * uDistance)';
      default:
        throw new Error(`Invalid axes`);
    }
  }

  const positionExpr = axisToVec3(axes);

  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,

    uniforms: {
      uSize1: { value: size1 },
      uSize2: { value: size2 },
      uColor: { value: new THREE.Color(color) },
      uDistance: { value: distance },
    },

    vertexShader: `
      varying vec3 worldPosition;
      uniform float uDistance;
      void main() {
        vec3 pos = ${positionExpr};
        pos.${planeAxes} += cameraPosition.${planeAxes};
        worldPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,

    fragmentShader: `
      varying vec3 worldPosition;
      uniform float uSize1;
      uniform float uSize2;
      uniform vec3 uColor;
      uniform float uDistance;

      float getGrid(float size) {
        vec2 r = worldPosition.${planeAxes} / size;
        vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
        float line = min(grid.x, grid.y);
        return 1.0 - min(line, 1.0);
      }

      void main() {
        float d = 1.0 - min(distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes}) / uDistance, 1.0);
        float g1 = getGrid(uSize1);
        float g2 = getGrid(uSize2);

        vec4 color = vec4(uColor.rgb, mix(g2, g1, g1) * pow(d, 3.0));
        color.a = mix(0.5 * color.a, color.a, g2);

        if (color.a <= 0.0) discard;
        gl_FragColor = color;
      }
    `,
  });
}

export function InfiniteGrid() {
  const gridMaterial = React.useRef(InfiniteGridMaterial());

  return <Plane material={gridMaterial.current} />;
}
