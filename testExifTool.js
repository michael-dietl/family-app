const { extractGPSWithExifTool } = require('./src/services/exif');

// Beispielbildpfad anpassen
const testImagePath = '/path/to/image.jpg';

extractGPSWithExifTool(testImagePath);