import Foundation
import Observation

/// Shared observable store for terminal preferences.
///
/// Serves as the single source of truth for font size, terminal width,
/// and custom width history, persisting to UserDefaults automatically.
/// Injected via `.environment()` so all views stay in sync.
@Observable
@MainActor
final class TerminalPreferencesStore {
    static let shared = TerminalPreferencesStore()

    // MARK: - Keys

    private enum Keys {
        static let defaultFontSize = "defaultFontSize"
        static let defaultTerminalWidth = "defaultTerminalWidth"
        static let customTerminalWidths = "customTerminalWidths"
    }

    // MARK: - Font Size

    var fontSize: CGFloat = {
        let v = UserDefaults.standard.double(forKey: Keys.defaultFontSize)
        return v > 0 ? v : 14
    }() {
        didSet {
            UserDefaults.standard.set(fontSize, forKey: Keys.defaultFontSize)
        }
    }

    // MARK: - Terminal Width

    var terminalWidth: TerminalWidth = {
        let raw = UserDefaults.standard.integer(forKey: Keys.defaultTerminalWidth)
        return TerminalWidth.from(value: raw)
    }() {
        didSet {
            UserDefaults.standard.set(terminalWidth.value, forKey: Keys.defaultTerminalWidth)
        }
    }

    var customWidths: [Int] {
        get { UserDefaults.standard.array(forKey: Keys.customTerminalWidths) as? [Int] ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: Keys.customTerminalWidths) }
    }

    func addCustomWidth(_ width: Int) {
        var widths = self.customWidths
        if !widths.contains(width), width >= 20, width <= 500 {
            widths.append(width)
            if widths.count > 5 {
                widths.removeFirst()
            }
            self.customWidths = widths
        }
    }
}
