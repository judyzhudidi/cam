import SwiftUI
import MetalKit

// MARK: - Editor View

struct EditorView: View {
    @ObservedObject var viewModel: EditorViewModel
    @State private var showImagePicker = false
    @State private var selectedItem: PhotosUI.PhotosPickerItem?

    var body: some View {
        VStack(spacing: 0) {
            // Top toolbar
            topBar

            // Metal canvas with touch overlay
            GeometryReader { geo in
                ZStack {
                    // Metal rendering view
                    MetalCanvasView(viewModel: viewModel)
                        .clipShape(RoundedRectangle(cornerRadius: 0))

                    // Touch interaction overlay
                    TouchOverlayView(
                        center: $viewModel.center,
                        radius: $viewModel.radius,
                        mode: viewModel.mode,
                        viewSize: geo.size
                    )
                }
            }
            .background(Color.black)

            // Bottom controls
            bottomControls
        }
        .background(Color(white: 0.08))
        .overlay(exportOverlay)
        .alert("导出失败", isPresented: .init(
            get: { viewModel.exportError != nil },
            set: { if !$0 { viewModel.exportError = nil } }
        )) {
            Button("确定") { viewModel.exportError = nil }
        } message: {
            Text(viewModel.exportError ?? "")
        }
        .sheet(isPresented: $viewModel.showShareSheet) {
            if let image = viewModel.exportedImage {
                ShareSheet(items: [image])
            }
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button {
                viewModel.sourceImage = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }

            Spacer()

            Text(viewModel.mode.displayName)
                .font(.headline)
                .foregroundStyle(.white)

            Spacer()

            Button {
                viewModel.resetToDefaults()
            } label: {
                Image(systemName: "arrow.counterclockwise")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 52)
        .background(Color(white: 0.08))
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: 16) {
            // Strength slider
            VStack(spacing: 8) {
                HStack {
                    Text("强度")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.6))
                    Spacer()
                    Text(String(format: "%.0f%%", viewModel.strength * 100))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.6))
                }

                Slider(value: $viewModel.strength, in: 0...1.5)
                    .tint(.white)
            }

            // Radius slider (only for bulge mode)
            if viewModel.mode == .bulge {
                VStack(spacing: 8) {
                    HStack {
                        Text("半径")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.6))
                        Spacer()
                        Text(String(format: "%.0f%%", viewModel.radius * 100))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.6))
                    }

                    Slider(value: $viewModel.radius, in: 0.05...0.6)
                        .tint(.white)
                }
            }

            // Mode toggle + Export buttons
            ToolbarView(viewModel: viewModel)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .background(Color(white: 0.08))
    }

    // MARK: - Export Success Overlay

    @ViewBuilder
    private var exportOverlay: some View {
        if viewModel.showExportSuccess {
            VStack {
                Spacer()
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("已保存到相册")
                        .foregroundStyle(.white)
                        .font(.subheadline.weight(.medium))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(.bottom, 120)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.spring(duration: 0.3), value: viewModel.showExportSuccess)
        }

        if viewModel.isExporting {
            Color.black.opacity(0.5).ignoresSafeArea()
            ProgressView()
                .scaleEffect(1.5)
                .tint(.white)
        }
    }
}

// MARK: - Metal Canvas View (UIViewRepresentable)

struct MetalCanvasView: UIViewRepresentable {
    @ObservedObject var viewModel: EditorViewModel

    func makeUIView(context: Context) -> MTKView {
        let mtkView = MTKView()
        mtkView.device = viewModel.renderer?.metalDevice
        mtkView.delegate = context.coordinator
        mtkView.colorPixelFormat = .bgra8Unorm
        mtkView.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        mtkView.enableSetNeedsDisplay = false
        mtkView.isPaused = false
        mtkView.preferredFramesPerSecond = 60
        mtkView.contentMode = .scaleAspectFit
        mtkView.autoResizeDrawable = true
        mtkView.isUserInteractionEnabled = false // touches handled by overlay
        return mtkView
    }

    func updateUIView(_ uiView: MTKView, context: Context) {
        context.coordinator.viewModel = viewModel
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    class Coordinator: NSObject, MTKViewDelegate {
        var viewModel: EditorViewModel

        init(viewModel: EditorViewModel) {
            self.viewModel = viewModel
        }

        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

        func draw(in view: MTKView) {
            let uniforms = viewModel.currentUniforms()
            viewModel.renderer?.render(to: view, uniforms: uniforms)
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
