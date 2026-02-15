import { create } from 'zustand';

import { getBuilderApi } from '@/kernels/replicad/builderApi';
import { inSeries } from '@/kernels/replicad/inSeries';
import type { MeshRenderOutput, SvgRenderOutput } from '@/types';

type BuilderState = {
  code: string;
  shapes: (MeshRenderOutput | SvgRenderOutput)[] | null;
  error: Error | null;
  workerReady: boolean;
};

type BuilderActions = {
  setCode: (code: string) => void;
  build: () => Promise<void>;
  initWorker: () => Promise<void>;
};

const DEFAULT_SCRIPT = `
const { draw } = replicad;

const main = () => {
  const baseWidth = 20;
  const height = 100;

  const profile = draw()
    .hLine(baseWidth)
    .smoothSplineTo([baseWidth * 1.5, height * 0.2], {
      endTangent: [0, 1],
    })
    .smoothSplineTo([baseWidth * 0.7, height * 0.7], {
      endTangent: [0, 1],
      startFactor: 3,
    })
    .smoothSplineTo([baseWidth , height], {
      endTangent: [0, 1],
      startFactor: 3,
    })
    .lineTo([0, height])
    .close();

  return profile
    .sketchOnPlane("XZ")
    .revolve()
    .shell(5, (f) => f.containsPoint([0, 0, height]))
    .fillet(1.7, (e) => e.inPlane("XY", height));
};
`;

export const useBuilderStore = create<BuilderState & BuilderActions>(
  (set, get) => {
    const builderApi = getBuilderApi();

    const initWorker = async () => {
      try {
        const workerReady = await builderApi.init();
        set({ workerReady });
      } catch (e) {
        console.error('Error initializing worker:', e);
      }
    };

    const build = async () => {
      const { code } = get();
      if (!code) {
        set({ shapes: null, error: null });
        return;
      }

      try {
        const result = await builderApi.buildFromCode(code);

        console.log('Build result:', result);

        // result is either shapes[] or an error object
        if (Array.isArray(result)) {
          set({ shapes: result, error: null });
        } else {
          // if your worker returns an error object instead of throwing
          set({
            shapes: null,
            error: new Error(result.message),
          });
        }
      } catch (e) {
        set({
          shapes: null,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    };

    const runBuild = inSeries(build);

    return {
      code: DEFAULT_SCRIPT.trim(),
      workerReady: false,
      shapes: null,
      error: null,
      setCode: (code: string) => {
        set({ code });
      },
      build: runBuild,
      initWorker,
    };
  },
);
