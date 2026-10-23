// Draws the macOS app icon source: the artwork on a rounded square with the transparent margin and the
// soft shadow of Apple's icon template (824 x 824 shape in a 1024 x 1024 canvas). macOS does not round
// an .icns icon itself, so the rounding has to be part of the image.
//
// Usage: swift scripts/make-mac-icon.swift <artwork.png> <output.png>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let canvas: CGFloat = 1024
let shape: CGFloat = 824
let cornerRadius: CGFloat = 185

guard CommandLine.arguments.count == 3,
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
  let artwork = CGImageSourceCreateImageAtIndex(source, 0, nil),
  let context = CGContext(
    data: nil, width: Int(canvas), height: Int(canvas), bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
else {
  FileHandle.standardError.write(Data("Usage: make-mac-icon.swift <artwork.png> <output.png>\n".utf8))
  exit(1)
}

let rect = CGRect(x: (canvas - shape) / 2, y: (canvas - shape) / 2, width: shape, height: shape)
let path = CGPath(roundedRect: rect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)

context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -12), blur: 24, color: CGColor(gray: 0, alpha: 0.3))
context.addPath(path)
context.setFillColor(CGColor(gray: 0.5, alpha: 1))
context.fillPath()
context.restoreGState()

context.saveGState()
context.addPath(path)
context.clip()
context.interpolationQuality = .high
context.draw(artwork, in: rect)
context.restoreGState()

guard let image = context.makeImage(),
  let destination = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { exit(1) }
CGImageDestinationAddImage(destination, image, nil)
exit(CGImageDestinationFinalize(destination) ? 0 : 1)
