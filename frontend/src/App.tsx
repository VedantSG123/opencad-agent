import * as React from 'react';
import * as THREE from 'three';

import { CadViewer } from './components-3d/cad-viewer';
import { useBuilderStore } from './store/builder';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

function App() {
  const shapes = useBuilderStore((state) => state.shapes);
  const hasError = !!useBuilderStore((state) => state.error);
  const build = useBuilderStore((state) => state.build);
  const initWorker = useBuilderStore((state) => state.initWorker);
  const workerReady = useBuilderStore((state) => state.workerReady);

  React.useEffect(() => {
    initWorker();
  }, [initWorker]);

  React.useEffect(() => {
    if (workerReady) {
      build();
    }
  }, [build, workerReady]);

  if (!workerReady) {
    return (
      <div className='w-full h-full fixed top-0 left-0 -z-10 bg-black flex items-center justify-center text-white'>
        Loading...
      </div>
    );
  }

  return (
    <div className='w-full h-screen fixed top-0 left-0 -z-10 bg-black'>
      <CadViewer shapes={shapes || []} hasError={hasError} />
    </div>
  );
}

export default App;
