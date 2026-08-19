import {
  WiroStreamUploadTransportImpl,
  type WiroStreamUploadRequest,
  type WiroStreamUploadTransport,
} from './stream-upload-transport-impl';

declare const require: (moduleName: string) => unknown;

export type {
  WiroStreamUploadProgress,
  WiroStreamUploadRequest,
  WiroStreamUploadTransport,
} from './stream-upload-transport-impl';

export class ExpoWiroStreamUploadTransport implements WiroStreamUploadTransport {
  readonly #implementation = new WiroStreamUploadTransportImpl(
    loadExpoFileSystem,
  );

  upload(request: WiroStreamUploadRequest) {
    return this.#implementation.upload(request);
  }

  dispose(): void {
    this.#implementation.dispose();
  }
}

function loadExpoFileSystem(): readonly [unknown, unknown] {
  return [require('expo-file-system'), require('expo-file-system/legacy')];
}
