import SwiftUI

// MARK: - Touch Overlay View

/// Transparent overlay that captures touch gestures for:
/// 1. Drag to move fisheye center point
/// 2. Pinch to resize radius (bulge mode only)
/// 3. Visual indicator showing current center + radius
struct TouchOverlayView: View {
    @Binding var center: CGPoint    // normalized [0,1]
    @Binding var radius: CGFloat    // normalized [0,1]
    let mode: FishEyeMode
    let viewSize: CGSize

    @State private var isDragging = false
    @GestureState private var pinchScale: CGFloat = 1.0

    var body: some View {
        ZStack {
            // Touch capture area
            Color.clear
                .contentShape(Rectangle())
                .gesture(dragGesture)
                .gesture(pinchGesture)

            // Center crosshair indicator
            crosshairIndicator
                .position(centerInView)
                .allowsHitTesting(false)

            // Radius ring indicator (bulge mode)
            if mode == .bulge {
                Circle()
                    .stroke(
                        Color.white.opacity(isDragging ? 0.6 : 0.3),
                        style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])
                    )
                    .frame(width: radiusInPoints * 2, height: radiusInPoints * 2)
                    .position(centerInView)
                    .allowsHitTesting(false)
                    .animation(.easeOut(duration: 0.15), value: isDragging)
            }
        }
    }

    // MARK: - Computed Properties

    private var centerInView: CGPoint {
        CGPoint(
            x: center.x * viewSize.width,
            y: center.y * viewSize.height
        )
    }

    private var radiusInPoints: CGFloat {
        radius * min(viewSize.width, viewSize.height)
    }

    // MARK: - Crosshair

    private var crosshairIndicator: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(Color.white.opacity(isDragging ? 0.8 : 0.5), lineWidth: 2)
                .frame(width: 28, height: 28)

            // Inner dot
            Circle()
                .fill(Color.white.opacity(isDragging ? 0.9 : 0.6))
                .frame(width: 6, height: 6)

            // Crosshair lines
            Group {
                Rectangle()
                    .fill(Color.white.opacity(isDragging ? 0.6 : 0.3))
                    .frame(width: 1, height: 20)
                    .offset(y: -24)

                Rectangle()
                    .fill(Color.white.opacity(isDragging ? 0.6 : 0.3))
                    .frame(width: 1, height: 20)
                    .offset(y: 24)

                Rectangle()
                    .fill(Color.white.opacity(isDragging ? 0.6 : 0.3))
                    .frame(width: 20, height: 1)
                    .offset(x: -24)

                Rectangle()
                    .fill(Color.white.opacity(isDragging ? 0.6 : 0.3))
                    .frame(width: 20, height: 1)
                    .offset(x: 24)
            }
        }
        .scaleEffect(isDragging ? 1.2 : 1.0)
        .animation(.spring(duration: 0.2), value: isDragging)
    }

    // MARK: - Gestures

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                isDragging = true
                let normalizedX = value.location.x / viewSize.width
                let normalizedY = value.location.y / viewSize.height
                center = CGPoint(
                    x: min(max(normalizedX, 0), 1),
                    y: min(max(normalizedY, 0), 1)
                )
            }
            .onEnded { _ in
                isDragging = false
            }
    }

    private var pinchGesture: some Gesture {
        MagnifyGesture()
            .updating($pinchScale) { value, state, _ in
                state = value.magnification
            }
            .onChanged { value in
                let newRadius = radius * value.magnification
                radius = min(max(newRadius, 0.05), 0.6)
            }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.gray
        TouchOverlayView(
            center: .constant(CGPoint(x: 0.5, y: 0.5)),
            radius: .constant(0.25),
            mode: .bulge,
            viewSize: CGSize(width: 390, height: 600)
        )
    }
    .frame(width: 390, height: 600)
}
