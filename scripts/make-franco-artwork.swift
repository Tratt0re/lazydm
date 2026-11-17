// Renders Franco.svg's polygon paths to square app artwork, without browser dependencies.
// This deliberately supports only Franco's absolute M/L/Z paths; fail on unsupported SVG edits.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}
func color(_ hex: String) -> CGColor {
  let value = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
  guard value.count == 6, let rgb = UInt32(value, radix: 16) else {
    fail("Expected a six-digit hex color, got: \(hex)")
  }
  return CGColor(srgbRed: CGFloat((rgb >> 16) & 255) / 255,
                 green: CGFloat((rgb >> 8) & 255) / 255,
                 blue: CGFloat(rgb & 255) / 255, alpha: 1)
}
let args = CommandLine.arguments
guard args.count == 7 || args.count == 8 else {
  fail("Usage: make-franco-artwork.swift <Franco.svg> <output.png> <background> <hat> <mustache> <outline|none> [face|full]")
}
// "face" (default): only the eye and the moustache, large. "full": the whole Franco with the engraved dividers.
let faceOnly = args.count == 7 || args[7] == "face"
let background = color(args[3])
let overrides = ["franco-hat": color(args[4]), "franco-mustache": color(args[5])]
let outline: CGColor? = args[6] == "none" ? nil : color(args[6])

final class Artwork: NSObject, XMLParserDelegate {
  var paths: [[String: String]] = []
  func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?,
              qualifiedName: String?, attributes: [String: String]) {
    if element == "path" { paths.append(attributes) }
  }
}
guard let parser = XMLParser(contentsOf: URL(fileURLWithPath: args[1])) else { fail("Cannot open SVG") }
let artwork = Artwork()
parser.delegate = artwork
guard parser.parse(), !artwork.paths.isEmpty else { fail("Invalid or empty Franco SVG") }

func polygon(_ data: String) -> CGPath {
  let pattern = "[MLZ]|[-+]?(?:[0-9]*\\.[0-9]+|[0-9]+)(?:[eE][-+]?[0-9]+)?"
  let regex = try! NSRegularExpression(pattern: pattern)
  let range = NSRange(data.startIndex..., in: data)
  let matches = regex.matches(in: data, range: range)
  let remainder = regex.stringByReplacingMatches(in: data, range: range, withTemplate: "")
  guard remainder.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    fail("Unsupported SVG path command; Franco artwork supports absolute M/L/Z only")
  }
  let tokens = matches.map { String(data[Range($0.range, in: data)!]) }
  let path = CGMutablePath()
  var index = 0
  while index < tokens.count {
    let command = tokens[index]; index += 1
    if command == "Z" { path.closeSubpath(); continue }
    guard (command == "M" || command == "L"), index + 1 < tokens.count,
          let x = Double(tokens[index]), let y = Double(tokens[index + 1]) else {
      fail("Invalid SVG polygon")
    }
    let point = CGPoint(x: x, y: y)
    if command == "M" { path.move(to: point) } else { path.addLine(to: point) }
    index += 2
  }
  return path
}
let facePaths: Set<String> = ["franco-eye", "franco-pupil", "franco-mustache"]
let shapes = artwork.paths.filter { !faceOnly || facePaths.contains($0["id"] ?? "") }.map { attributes -> (String, CGPath, CGColor) in
  guard let id = attributes["id"], let data = attributes["d"], let fill = attributes["fill"] else {
    fail("Franco paths must have id, d and fill attributes")
  }
  let resolved: CGColor
  if let override = overrides[id] { resolved = override } else { resolved = color(fill) }
  return (id, polygon(data), resolved)
}
guard let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
  bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("Cannot create canvas") }
context.setFillColor(background)
context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
if !faceOnly {
// Engraved dividers along the top and bottom edge: the app's hairline with a big diamond between two small ones
// (`.arc-engraved-divider`), in the moustache colour. They sit clear of the silhouette and of the rounded corners.
let dividerInset: CGFloat = 76
let dividerHalfWidth: CGFloat = 330
let dividerGap: CGFloat = 118
let dividerLine: CGFloat = 7
func diamond(_ center: CGPoint, _ half: CGFloat) {
  context.move(to: CGPoint(x: center.x - half, y: center.y))
  context.addLine(to: CGPoint(x: center.x, y: center.y + half))
  context.addLine(to: CGPoint(x: center.x + half, y: center.y))
  context.addLine(to: CGPoint(x: center.x, y: center.y - half))
  context.closePath()
}
context.setStrokeColor(overrides["franco-mustache"]!)
context.setLineWidth(dividerLine)
context.setLineCap(.butt)
context.setLineJoin(.miter)
for y in [dividerInset, 1024 - dividerInset] {
  for side: CGFloat in [-1, 1] {
    context.move(to: CGPoint(x: 512 + side * dividerHalfWidth, y: y))
    context.addLine(to: CGPoint(x: 512 + side * dividerGap, y: y))
  }
  diamond(CGPoint(x: 512, y: y), 30)
  diamond(CGPoint(x: 512 - 76, y: y), 13)
  diamond(CGPoint(x: 512 + 76, y: y), 13)
  context.strokePath()
}
}
// Fit the drawn shapes, centered: the whole silhouette with 9% breathing room, or the face a little smaller.
let bounds = shapes.reduce(CGRect.null) { $0.union($1.1.boundingBoxOfPath) }
let scale = (faceOnly ? 600 : 840) / max(bounds.width, bounds.height)
context.translateBy(x: 512, y: 512)
context.scaleBy(x: scale, y: -scale)
context.translateBy(x: -bounds.midX, y: -bounds.midY)
for (id, path, fill) in shapes {
  if let outline = outline, id == "franco-body" || id == "franco-hat" {
    context.addPath(path)
    context.setStrokeColor(outline)
    context.setLineWidth(2.75 / scale)
    context.setLineJoin(.round)
    context.strokePath()
  }
  context.addPath(path)
  context.setFillColor(fill)
  context.fillPath()
}
guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL,
        UTType.png.identifier as CFString, 1, nil) else { fail("Cannot write artwork") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fail("Failed to save artwork") }
