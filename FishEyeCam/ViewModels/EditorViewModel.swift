import SwiftUI
import Combine
import MetalKit

// MARK: - Editor ViewModel

@MainActor
class EditorViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var sourceImage: UIImage?
    @Published var mode: FishEyeMode = .bulge
    @Published var strength: CGFloat = 0.5
    @Published var radius: CGFloat = 0.25
    @Published var center: CGPoint = CGPoint(x: 0.5, y: 0.5) // normalized
    @Published var isExporting = false
    @Published var showExportSuccess = false
    @Published var exportError: String?
    @Published var showShareSheet = false
    @Published var exportedImage: UIImage?

    // MARK: - Metal

    let renderer: MetalRenderer?
    private let pipeline = FilterPipeline()

    // MARK: - Defaults

    struct Defaults {
        static let barrelStrength: CGFloat = 0.5
        static let bulgeStrength: CGFloat = 0.6
        static let bulgeRadius: CGFloat = 0.25
        static let center = CGPoint(x: 0.5, y: 0.5)
    }

    // MARK: - Init

    init() {
        self.renderer = MetalRenderer()
        let fishEyeFilter = FishEyeFilter()
        pipeline.addFilter(fishEyeFilter)
    }

    // MARK: - Load Image

    func loadImage(_ image: UIImage) {
        // Downscale very large images for performance
        let maxDimension: CGFloat = 4096
        let size = image.size
        if max(size.width, size.height) > maxDimension {
            let scale = maxDimension / max(size.width, size.height)
            let newSize = CGSize(width: size.width * scale, height: size.height * scale)
            UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
            image.draw(in: CGRect(origin: .zero, size: newSize))
            let resized = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            self.sourceImage = resized ?? image
        } else {
            self.sourceImage = image
        }

        renderer?.loadImage(self.sourceImage!)
        resetToDefaults()
    }

    // MARK: - Reset

    func resetToDefaults() {
        center = Defaults.center
        strength = mode == .barrel ? Defaults.barrelStrength : Defaults.bulgeStrength
        radius = Defaults.bulgeRadius
    }

    // MARK: - Mode Switch

    func switchMode(to newMode: FishEyeMode) {
        mode = newMode
        strength = mode == .barrel ? Defaults.barrelStrength : Defaults.bulgeStrength
    }

    // MARK: - Get Uniforms for Metal

    func currentUniforms() -> MetalRenderer.FishEyeUniforms {
        let imgSize = renderer?.sourceImageSize ?? CGSize(width: 1, height: 1)
        return MetalRenderer.FishEyeUniforms(
            center: SIMD2<Float>(Float(center.x), Float(center.y)),
            radius: Float(radius),
            strength: Float(strength),
            mode: Float(mode.rawValue),
            imageSize: SIMD2<Float>(Float(imgSize.width), Float(imgSize.height)),
            aspectRatio: Float(imgSize.width / imgSize.height)
        )
    }

    // MARK: - Export

    func exportToPhotos() async {
        guard renderer?.hasSourceImage == true else {
            exportError = "请先选择一张图片"
            return
        }

        isExporting = true
        defer { isExporting = false }

        let uniforms = currentUniforms()
        guard let image = renderer?.exportImage(uniforms: uniforms) else {
            exportError = "渲染导出失败"
            return
        }

        do {
            try await ExportService.saveToPhotos(image)
            showExportSuccess = true
            // Auto-dismiss after 2 seconds
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            showExportSuccess = false
        } catch {
            exportError = error.localizedDescription
        }
    }

    func prepareShare() {
        guard renderer?.hasSourceImage == true else { return }
        let uniforms = currentUniforms()
        exportedImage = renderer?.exportImage(uniforms: uniforms)
        if exportedImage != nil {
            showShareSheet = true
        }
    }
}
