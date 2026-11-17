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
guard args.count == 7 else {
  fail("Usage: make-franco-artwork.swift <Franco.svg> <output.png> <background> <hat> <mustache> <outline|none>")
}
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
let shapes = artwork.paths.map { attributes -> (String, CGPath, CGColor) in
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
// Corner brackets: the bronze ones of the campaign cards and the setup panel, in the moustache colour. They sit
// inside the curve of the rounded icon shape (its radius is 185/824 of the shape, so ~230 px on this canvas).
let bracketInset: CGFloat = 96
let bracketArm: CGFloat = 104
let bracketWidth: CGFloat = 14
context.setStrokeColor(overrides["franco-mustache"]!)
context.setLineWidth(bracketWidth)
context.setLineCap(.butt)
context.setLineJoin(.miter)
for (sx, sy) in [(1, 1), (-1, 1), (1, -1), (-1, -1)] as [(CGFloat, CGFloat)] {
  let cornerX = sx > 0 ? bracketInset : 1024 - bracketInset
  let cornerY = sy > 0 ? bracketInset : 1024 - bracketInset
  context.move(to: CGPoint(x: cornerX + sx * bracketArm, y: cornerY))
  context.addLine(to: CGPoint(x: cornerX, y: cornerY))
  context.addLine(to: CGPoint(x: cornerX, y: cornerY + sy * bracketArm))
  context.strokePath()
}
// Fit the actual silhouette, centered with 9% breathing room on all sides.
let bounds = shapes.reduce(CGRect.null) { $0.union($1.1.boundingBoxOfPath) }
let scale = 840 / max(bounds.width, bounds.height)
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
