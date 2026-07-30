import SwiftUI
import PhotosUI

// MARK: - Content View (Root)

struct ContentView: View {
    @StateObject private var viewModel = EditorViewModel()
    @State private var showImagePicker = false
    @State private var showCamera = false
    @State private var selectedItem: PhotosPickerItem?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if viewModel.sourceImage != nil {
                EditorView(viewModel: viewModel)
            } else {
                welcomeView
            }
        }
        .photosPicker(isPresented: $showImagePicker, selection: $selectedItem, matching: .images)
        .fullScreenCover(isPresented: $showCamera) {
            ImagePickerView(sourceType: .camera) { image in
                if let image = image {
                    viewModel.loadImage(image)
                }
            }
            .ignoresSafeArea()
        }
        .onChange(of: selectedItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    viewModel.loadImage(image)
                }
            }
        }
    }

    // MARK: - Welcome / Import Screen

    private var welcomeView: some View {
        VStack(spacing: 40) {
            Spacer()

            // App icon area
            VStack(spacing: 16) {
                Image(systemName: "camera.filters")
                    .font(.system(size: 72, weight: .thin))
                    .foregroundStyle(.white.opacity(0.8))

                Text("FishEye Cam")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text("实时拖拽定位鱼眼镜头")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            // Action buttons
            VStack(spacing: 16) {
                Button {
                    showImagePicker = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.title3)
                        Text("从相册选择")
                            .font(.headline)
                    }
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                Button {
                    showCamera = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "camera")
                            .font(.title3)
                        Text("拍照")
                            .font(.headline)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(.white.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(.white.opacity(0.2), lineWidth: 1)
                    )
                }
            }
            .padding(.horizontal, 32)

            Spacer()
                .frame(height: 60)
        }
    }
}
