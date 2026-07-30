import Foundation
import Metal
import MetalKit
import UIKit
import CoreImage

// MARK: - Metal Renderer

/// Handles all Metal rendering: loads shaders, manages textures,
/// renders fisheye effect in real-time, and exports final image.
class MetalRenderer: ObservableObject {

    // Metal core objects
    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let renderPipelineState: MTLRenderPipelineState
    private let computePipelineState: MTLComputePipelineState
    private let ciContext: CIContext

    // Current source texture
    private var sourceTexture: MTLTexture?
    private var sourceImage: UIImage?
    private var textureLoader: MTKTextureLoader

    // MARK: - Uniform struct matching Metal shader

    struct FishEyeUniforms {
        var center: SIMD2<Float>
        var radius: Float
        var strength: Float
        var mode: Float
        var imageSize: SIMD2<Float>
        var aspectRatio: Float
    }

    // MARK: - Init

    init?() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            print("Metal is not supported on this device")
            return nil
        }
        self.device = device

        guard let queue = device.makeCommandQueue() else { return nil }
        self.commandQueue = queue

        self.ciContext = CIContext(mtlDevice: device)
        self.textureLoader = MTKTextureLoader(device: device)

        // Load shader library
        guard let library = device.makeDefaultLibrary() else {
            print("Failed to load Metal shader library")
            return nil
        }

        // Render pipeline (for real-time preview)
        guard let vertexFunc = library.makeFunction(name: "vertexShader"),
              let fragmentFunc = library.makeFunction(name: "fishEyeFragment") else {
            print("Failed to load shader functions")
            return nil
        }

        let renderDesc = MTLRenderPipelineDescriptor()
        renderDesc.vertexFunction = vertexFunc
        renderDesc.fragmentFunction = fragmentFunc
        renderDesc.colorAttachments[0].pixelFormat = .bgra8Unorm

        do {
            self.renderPipelineState = try device.makeRenderPipelineState(descriptor: renderDesc)
        } catch {
            print("Failed to create render pipeline: \(error)")
            return nil
        }

        // Compute pipeline (for export)
        guard let computeFunc = library.makeFunction(name: "fishEyeCompute") else {
            print("Failed to load compute function")
            return nil
        }

        do {
            self.computePipelineState = try device.makeComputePipelineState(function: computeFunc)
        } catch {
            print("Failed to create compute pipeline: \(error)")
            return nil
        }
    }

    // MARK: - Load Image

    func loadImage(_ image: UIImage) {
        self.sourceImage = image

        guard let cgImage = image.cgImage else { return }

        let textureDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .rgba8Unorm,
            width: cgImage.width,
            height: cgImage.height,
            mipmapped: false
        )
        textureDesc.usage = [.shaderRead]

        do {
            let texture = try textureLoader.newTexture(
                cgImage: cgImage,
                options: [
                    .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue),
                    .textureStorageMode: NSNumber(value: MTLStorageMode.shared.rawValue),
                    .SRGB: false
                ]
            )
            self.sourceTexture = texture
        } catch {
            print("Failed to create texture from image: \(error)")
        }
    }

    // MARK: - Real-time Render (to MTKView)

    func render(to view: MTKView, uniforms: FishEyeUniforms) {
        guard let sourceTexture = sourceTexture,
              let drawable = view.currentDrawable,
              let renderPassDesc = view.currentRenderPassDescriptor else { return }

        var mutableUniforms = uniforms

        guard let commandBuffer = commandQueue.makeCommandBuffer(),
              let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: renderPassDesc) else { return }

        encoder.setRenderPipelineState(renderPipelineState)
        encoder.setFragmentTexture(sourceTexture, index: 0)
        encoder.setFragmentBytes(&mutableUniforms, length: MemoryLayout<FishEyeUniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
        encoder.endEncoding()

        commandBuffer.present(drawable)
        commandBuffer.commit()
    }

    // MARK: - Export (render to UIImage at full resolution)

    func exportImage(uniforms: FishEyeUniforms) -> UIImage? {
        guard let sourceTexture = sourceTexture else { return nil }

        let width = sourceTexture.width
        let height = sourceTexture.height

        // Create output texture
        let outDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .rgba8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        outDesc.usage = [.shaderRead, .shaderWrite]
        outDesc.storageMode = .shared

        guard let outTexture = device.makeTexture(descriptor: outDesc) else { return nil }

        var mutableUniforms = uniforms

        guard let commandBuffer = commandQueue.makeCommandBuffer(),
              let encoder = commandBuffer.makeComputeCommandEncoder() else { return nil }

        encoder.setComputePipelineState(computePipelineState)
        encoder.setTexture(sourceTexture, index: 0)
        encoder.setTexture(outTexture, index: 1)
        encoder.setBytes(&mutableUniforms, length: MemoryLayout<FishEyeUniforms>.stride, index: 0)

        let threadGroupSize = MTLSize(width: 16, height: 16, depth: 1)
        let threadGroups = MTLSize(
            width: (width + 15) / 16,
            height: (height + 15) / 16,
            depth: 1
        )
        encoder.dispatchThreadgroups(threadGroups, threadsPerThreadgroup: threadGroupSize)
        encoder.endEncoding()

        commandBuffer.commit()
        commandBuffer.waitUntilCompleted()

        // Read back pixels
        let bytesPerRow = 4 * width
        var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
        outTexture.getBytes(
            &pixels,
            bytesPerRow: bytesPerRow,
            from: MTLRegion(origin: MTLOrigin(x: 0, y: 0, z: 0),
                           size: MTLSize(width: width, height: height, depth: 1)),
            mipmapLevel: 0
        )

        // Create CGImage
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let cgContext = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ), let cgImage = cgContext.makeImage() else { return nil }

        return UIImage(cgImage: cgImage)
    }

    // MARK: - Accessors

    var metalDevice: MTLDevice { device }

    var hasSourceImage: Bool { sourceTexture != nil }

    var sourceImageSize: CGSize {
        guard let tex = sourceTexture else { return .zero }
        return CGSize(width: tex.width, height: tex.height)
    }
}
