# Components

Existing exports and props retained. Import from current common/admin paths; no parallel replacement library.

| Primitive | Contract and states |
| --- | --- |
| Button | Existing variants primary/secondary/danger/outline/ghost and sizes; loading disables action, sets aria-busy, keeps label. Explicit type=button for non-submit actions inside forms. |
| Input | Existing forwardRef/native props; stable generated ID or caller ID links label; invalid state links visible error and preserves caller descriptions. Password toggle has name and pressed state. |
| Select | Native select, same label/error associations as Input; options/value unchanged. |
| Modal | Existing isOpen/onClose/title/size; native dialog supplies modal semantics and focus containment. Labelled title, Escape/backdrop close, previous focus and body overflow restored. Floating toast portal moves into open top-layer dialog, then returns to body when closed. Children retain form actions. |
| DataTable | Existing columns, controlled search and page size; additive caption prop names table/scroll region. Column scopes, current-page announcement, horizontal scroll. Do not change sorting/filter business rules here. |
| Badge | Existing status/context mappings retained; rectangular restrained label; never color alone. |
| Alert | tone info/success/warning/danger; optional title, children; danger announces alert, other feedback status. Use for dynamic feedback, avoid many simultaneous live regions. |
| Loading | Existing message/fullPage; polite status, decorative spinner hidden. |
| EmptyState | Existing actions/navigation preserved; compact panel, specific explanatory copy. |
| ErrorState | message, optional onRetry; visible error via Alert; never infer empty data from failure. Retry only read operations explicitly wired by caller. |

State review matrix: default, hover, focus-visible, disabled, loading, invalid, empty, failure, long content; 375/768/1440px, keyboard and reduced motion. Harness fixtures belong under tests, never routes or production imports. Existing icon-only row actions and untouched consumers require their own audit.
