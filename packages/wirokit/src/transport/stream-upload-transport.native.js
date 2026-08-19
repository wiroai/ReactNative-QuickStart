import * as ExpoFileSystem from 'expo-file-system';
import * as ExpoFileSystemLegacy from 'expo-file-system/legacy';

import { WiroStreamUploadTransportImpl } from './stream-upload-transport-impl';

export class ExpoWiroStreamUploadTransport extends WiroStreamUploadTransportImpl {
  constructor() {
    super(() => [ExpoFileSystem, ExpoFileSystemLegacy]);
  }
}
