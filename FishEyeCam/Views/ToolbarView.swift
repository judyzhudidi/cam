import SwiftUI

// MARK: - Toolbar View

/// Bottom toolbar with mode toggle and action buttons.
struct ToolbarView: View {
    @ObservedObject var viewModel: EditorViewModel

    var body: some View {
        VStack(spacing: 16) {
            // Mode selector
            modeSelector

            // Action buttons
            actionButtons
        }
    }

    // MARK: - Mode Selector

    private var modeSelector: some View {
        HStack(spacing: 0) {
            ForEach(FishEyeMode.allCases) { mode in
                Button {
                    withAnimation(.spring(duration: 0.3)) {
                        viewModel.switchMode(to: mode)
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: mode.icon)
                            .font(.subheadline)
                        Text(mode.displayName)
                            .font(.subheadline.weight(.medium))
                    }
                    .foregroundStyle(viewModel.mode == mode ? .black : .white.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(
                        viewModel.mode == mode
                            ? Color.white
                            : Color.white.opacity(0.08)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(3)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 13))
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            // Share button
            Button {
                viewModel.prepareShare()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(.white.opacity(0.12))
                    .clipShape(Circle())
            }

            Spacer()

            // Save button (primary)
            Button {
                Task {
                    await viewModel.exportToPhotos()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.down.to.line")
                        .font(.headline)
                    Text("保存")
                        .font(.headline)
                }
                .foregroundStyle(.black)
                .frame(width: 140, height: 52)
                .background(.white)
                .clipShape(Capsule())
            }
            .disabled(viewModel.isExporting)

            Spacer()

            // Placeholder for balance
            Color.clear
                .frame(width: 52, height: 52)
        }
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        ToolbarView(viewModel: EditorViewModel())
            .padding()
    }
    .background(Color(white: 0.08))
}
