// Encodes a folder of JPEG frames to an H.264 MP4 using the frame times of a `times.json` file.
//
//   swift scripts/encode-frames.swift <frames-dir> <out.mp4>
//
// <frames-dir> holds `0001.jpg`, `0002.jpg`… and `times.json`: an array of seconds, one per frame (the moment the
// frame was shown). Written for scripts/record-clips.mjs; macOS only (AVFoundation), no ffmpeg needed.
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
  print("usage: encode-frames.swift <frames-dir> <out.mp4>")
  exit(1)
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let times = try JSONDecoder().decode([Double].self, from: Data(contentsOf: dir.appendingPathComponent("times.json")))
guard let first = NSImage(contentsOf: dir.appendingPathComponent("0001.jpg")),
  let firstRep = first.representations.first
else { print("no frames"); exit(1) }
let width = firstRep.pixelsWide - firstRep.pixelsWide % 2
let height = firstRep.pixelsHigh - firstRep.pixelsHigh % 2

try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func buffer(_ url: URL) -> CVPixelBuffer? {
  guard let image = NSImage(contentsOf: url), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { return nil }
  var pixels: CVPixelBuffer?
  CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32ARGB, nil, &pixels)
  guard let pb = pixels else { return nil }
  CVPixelBufferLockBaseAddress(pb, [])
  let ctx = CGContext(
    data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)
  ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
  CVPixelBufferUnlockBaseAddress(pb, [])
  return pb
}

for (index, time) in times.enumerated() {
  let url = dir.appendingPathComponent(String(format: "%04d.jpg", index + 1))
  guard let pb = buffer(url) else { continue }
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
  adaptor.append(pb, withPresentationTime: CMTime(seconds: time, preferredTimescale: 600))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "saved \(out.path)" : "failed: \(String(describing: writer.error))")
