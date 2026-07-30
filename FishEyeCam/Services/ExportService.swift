import Foundation
import UIKit
import Photos

// MARK: - Export Service

/// Handles exporting edited images to Photos library or sharing.
class ExportService {

    enum ExportError: LocalizedError {
        case noImage
        case saveFailed(Error)
        case permissionDenied

        var errorDescription: String? {
            switch self {
            case .noImage: return "没有可导出的图片"
            case .saveFailed(let e): return "保存失败: \(e.localizedDescription)"
            case .permissionDenied: return "请在设置中允许访问相册"
            }
        }
    }

    // MARK: - Save to Photos

    static func saveToPhotos(_ image: UIImage) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw ExportError.permissionDenied
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            } completionHandler: { success, error in
                if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: ExportError.saveFailed(error ?? NSError()))
                }
            }
        }
    }

    // MARK: - Share Sheet

    static func shareImage(_ image: UIImage, from viewController: UIViewController) {
        let activityVC = UIActivityViewController(
            activityItems: [image],
            applicationActivities: nil
        )
        activityVC.popoverPresentationController?.sourceView = viewController.view
        viewController.present(activityVC, animated: true)
    }

    // MARK: - Export as JPEG Data

    static func exportAsJPEG(_ image: UIImage, quality: CGFloat = 0.95) -> Data? {
        return image.jpegData(compressionQuality: quality)
    }

    // MARK: - Export as PNG Data

    static func exportAsPNG(_ image: UIImage) -> Data? {
        return image.pngData()
    }
}
