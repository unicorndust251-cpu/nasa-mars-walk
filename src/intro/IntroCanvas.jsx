import { Component, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { INTRO } from './introConfig.js';
import IntroScene from './IntroScene.jsx';

/** Any failure inside the 3D tree (texture 404, shader compile error) hands control back to the site. */
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('[Beyond Terra] 3D intro unavailable, continuing to the site.', error);
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The React Three Fiber canvas for the intro.
 * Props: anim (shared mutable state), onReady (first frame rendered), onError.
 */
export default function IntroCanvas({ anim, onReady, onError }) {
  return (
    <SceneBoundary onError={onError}>
      <Canvas
        className="bt-intro__canvas"
        dpr={[1, 2]}
        camera={{ fov: INTRO.camera.fov, near: 0.1, far: 300, position: [0, 0, 8] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(INTRO.colors.space, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onError?.(new Error('WebGL context lost'));
          });
        }}
        aria-hidden="true"
      >
        <SceneBoundary onError={onError}>
          <Suspense fallback={null}>
            <IntroScene anim={anim} onReady={onReady} />
          </Suspense>
        </SceneBoundary>
      </Canvas>
    </SceneBoundary>
  );
}
