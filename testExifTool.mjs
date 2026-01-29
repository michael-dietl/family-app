import { extractGPSWithExifTool } from './src/services/exif.js';

// Beispielbildpfad anpassen
const testImagePath = '/path/to/image.jpg';

extractGPSWithExifTool(testImagePath);