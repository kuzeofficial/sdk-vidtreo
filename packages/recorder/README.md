# @vidtreo/example

Video transcoding package using mediabunny. Transcodes videos to MP4 format with configurable settings, optimized for Bun runtime.

## Installation

```bash
npm install @vidtreo/example
```

## Usage

### Basic Usage

```typescript
import { transcodeVideo } from '@vidtreo/example';

// Transcode from a Blob
const videoBlob = new Blob([videoData], { type: 'video/mp4' });
const result = await transcodeVideo(videoBlob);
console.log(result.buffer); // ArrayBuffer with transcoded video
console.log(result.blob); // Blob with transcoded video

// Transcode from a File
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const result = await transcodeVideo(file);

// Transcode from a file path (Bun only)
const result = await transcodeVideo('/path/to/video.mp4');
```

### Custom Configuration

```typescript
import { transcodeVideo, DEFAULT_TRANSCODE_CONFIG } from '@vidtreo/example';

// Use custom configuration
const result = await transcodeVideo(videoBlob, {
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 2000000, // 2Mbps
  packetCount: 2000,
});

// Partial configuration (merges with defaults)
const result = await transcodeVideo(videoBlob, {
  width: 640,
  height: 480,
});
```

## Configuration

The default configuration is:

```typescript
{
  format: 'mp4',        // Always MP4 output
  fps: 30,              // 30 frames per second
  width: 1280,          // 1280 pixels
  height: 720,          // 720 pixels
  bitrate: 500000,      // 500kbps
  audioCodec: 'aac',    // AAC audio codec
  preset: 'medium',     // Medium quality preset
  packetCount: 1200,    // Maximum packet count for video track
}
```

### Configuration Options

- `format`: Output format (always `'mp4'`)
- `fps`: Target frame rate in frames per second
- `width`: Target video width in pixels
- `height`: Target video height in pixels
- `bitrate`: Target video bitrate in bits per second
- `audioCodec`: Audio codec to use (always `'aac'`)
- `preset`: Quality preset (always `'medium'`)
- `packetCount`: Maximum packet count for video track metadata (optimization hint)

## API Reference

### `transcodeVideo(input, config?)`

Transcodes a video file to MP4 format.

**Parameters:**
- `input`: `Blob | File | string` - Input video source (Blob, File, or file path string)
- `config`: `Partial<TranscodeConfig>` - Optional configuration object (merges with defaults)

**Returns:** `Promise<TranscodeResult>`

**Throws:** `Error` if transcoding fails or input is invalid

### `TranscodeResult`

```typescript
interface TranscodeResult {
  buffer: ArrayBuffer;  // Transcoded video as ArrayBuffer
  blob: Blob;          // Transcoded video as Blob
}
```

### `DEFAULT_TRANSCODE_CONFIG`

Default configuration object. Can be imported and used as a base for custom configurations.

## Supported Input Formats

The package supports all formats supported by mediabunny:
- MP4 (.mp4, .m4v)
- WebM (.webm)
- QuickTime (.mov)
- Matroska (.mkv)
- OGG (.ogv)
- And more...

## Bun Optimizations

This package leverages Bun's native capabilities:
- Uses `Bun.file()` for efficient file reading when file paths are provided
- Optimized for Bun's runtime and test runner
- Native ArrayBuffer handling

## Examples

### Transcode and Save to File (Bun)

```typescript
import { transcodeVideo } from '@vidtreo/example';
import { writeFile } from 'fs/promises';

const result = await transcodeVideo('/path/to/input.mp4');
await Bun.write('/path/to/output.mp4', result.buffer);
```

### Transcode with Progress Tracking

```typescript
import { transcodeVideo } from '@vidtreo/example';

console.log('Starting transcoding...');
const result = await transcodeVideo(videoBlob);
console.log('Transcoding complete!');
console.log(`Output size: ${result.buffer.byteLength} bytes`);
```

## License

MIT

