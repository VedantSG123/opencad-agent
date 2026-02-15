import { wrap } from 'comlink';
import type { CurveType, SurfaceType } from 'replicad';

import type {
  ExportConfiguration,
  ExportFileTypes,
  MeshRenderOutput,
  SvgRenderOutput,
} from '@/types';
import CadWorker from '@/workers/replicad/worker?worker';

// Define the worker service interface based on the exposed service
interface CadWorkerService {
  init(): Promise<boolean>;
  buildFromCode(code: string): Promise<
    | {
        error: true;
        message: string;
        stack?: string;
      }
    | Array<SvgRenderOutput | MeshRenderOutput>
  >;
  exportToFile(
    fileType?: ExportFileTypes,
    memoKey?: string,
    config?: ExportConfiguration,
  ): Promise<Array<{ blob: Blob; name: string }>>;
  getFaceInfo(
    subShapeIndex: number,
    faceIndex: number,
    memoKey?: string,
  ): Promise<{
    type: SurfaceType;
    center: [number, number, number];
    normal: [number, number, number];
  } | null>;
  getEdgeInfo(
    subShapeIndex: number,
    edgeIndex: number,
    memoKey?: string,
  ): Promise<{
    type: CurveType;
    start: [number, number, number];
    end: [number, number, number];
    direction: [number, number, number];
  } | null>;
}

class BuilderApi {
  private worker: Worker;
  private workerApi: CadWorkerService;

  constructor() {
    this.worker = new CadWorker();
    this.workerApi = wrap<CadWorkerService>(this.worker);
  }

  /**
   * Initialize the worker
   */
  async init() {
    return await this.workerApi.init();
  }

  /**
   * Build CAD shapes from code
   */
  async buildFromCode(code: string) {
    return await this.workerApi.buildFromCode(code);
  }

  /**
   * Export shapes to file
   */
  async exportToFile(
    fileType: ExportFileTypes = 'stl',
    memoKey: string = 'default_shapes',
    config?: ExportConfiguration,
  ) {
    return await this.workerApi.exportToFile(fileType, memoKey, config);
  }

  /**
   * Get face information
   */
  async getFaceInfo(
    subShapeIndex: number,
    faceIndex: number,
    memoKey: string = 'default_shapes',
  ) {
    return this.workerApi.getFaceInfo(subShapeIndex, faceIndex, memoKey);
  }

  /**
   * Get edge information
   */
  async getEdgeInfo(
    subShapeIndex: number,
    edgeIndex: number,
    memoKey: string = 'default_shapes',
  ) {
    return this.workerApi.getEdgeInfo(subShapeIndex, edgeIndex, memoKey);
  }

  /**
   * Terminate the worker
   */
  terminate() {
    this.worker.terminate();
  }
}

// Create a singleton instance
let builderApiInstance: BuilderApi | null = null;

/**
 * Get the singleton instance of the BuilderApi
 */
export function getBuilderApi(): BuilderApi {
  if (!builderApiInstance) {
    builderApiInstance = new BuilderApi();
  }
  return builderApiInstance;
}

/**
 * Terminate the current worker instance and reset the singleton
 */
export function terminateBuilderApi() {
  if (builderApiInstance) {
    builderApiInstance.terminate();
    builderApiInstance = null;
  }
}

export default BuilderApi;
