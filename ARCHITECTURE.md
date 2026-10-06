# Book Reader Architecture

## 1. Project Purpose
The goal of this project is to build a desktop/offline universal book reader. It will support multiple formats (EPUB, PDF, DOCX, etc.), normalize them into a single consistent internal model, provide a realistic 3D-like page-turning experience, and offer standard library management features (sorting, filtering, searching).

## 2. High-Level Architecture
The application follows a strictly linear data pipeline. The core principle is that the original file format becomes completely irrelevant once the book is imported.
The architecture is separated into three main layers:
- **Data & Import Layer**: Detects format and parses files into the Universal Book Model.
- **Pagination & Layout Layer**: Converts the Universal Book Model into a displayable sequence of Pages and Spreads.
- **Presentation & Rendering Layer**: Renders Spreads and orchestrates page-turn animations.

## 3. Directory Responsibilities
- `src/app/`: Application entry point and global providers.
- `src/components/`: Reusable React components grouped by feature area (`common/`, `library/`, `reader/`, `settings/`).
- `src/book/`: The Universal Book Model definitions, metadata, and core domain state.
- `src/formats/`: Format detection and format-specific importers (EPUB, PDF, etc.).
- `src/pagination/`: Logic for paginating the Universal Book Model into displayable pages and spreads based on layout settings.
- `src/reader/`: The core reading experience, including Spread, Page, and PageTurn components.
- `src/animation/`: Animation engines and logic, strictly segregated by library (`gsap/`, `motion/`, `geometry/`).
- `src/library/`: Library management logic (search, sorting, filtering).
- `src/styles/`: Global styles and design tokens.

## 4. Universal Book Model Concept
To avoid format-specific viewers, every supported book format is first parsed and transformed into a single `Book` model (`src/book/models/index.ts`). A `Book` contains structured `BookMetadata` and an ordered list of `Chapter`s. Each `Chapter` consists of discrete `Block`s (paragraphs, images, headings). 

## 5. Import Pipeline
`File` → `Format Detection` → `Format Importer` → `Universal Book Model`
1. The user selects a file.
2. The detector determines its format (e.g., EPUB).
3. The specific importer reads the file and outputs a `Book` object.
4. The `Book` is stored in the local library and state.

## 6. Pagination Pipeline
`Universal Book Model` → `Pagination Engine` → `Page Model` → `Spread Manager`
1. The pagination engine takes the linear sequence of `Block`s from a `Book` and flow them into discrete `Page` objects based on the current window size, font size, and layout settings.
2. The Spread Manager groups `Page` objects into two-page `Spread`s (left page, right page).

## 7. Reader Architecture
The Reader layer exclusively consumes `Spread`s. It does not know about the original file format. It renders the current `Spread` on screen and prepares adjacent `Spread`s for seamless page-turning.

## 8. Library Architecture
The Library handles the organization of books. It indexes `BookMetadata`, enabling fast search, sorting (by title, author, etc.), and filtering. The library will eventually persist this data locally (e.g., SQLite via Tauri).

## 9. Animation Responsibilities
- **GSAP**: The primary engine for complex, realistic physical page-turn animations.
- **Motion**: Used for React UI transitions (menus, dialogs, cards, routing).
- **Three.js**: Reserved for a future advanced 3D rendering engine. Currently unused.
- **Trig-JS**: Reserved for mathematical page-turn geometry. Currently unused.
*Crucial Rule*: Animation libraries (GSAP, Motion) must never mutate or control the book's domain state, metadata, or pagination logic. They are strictly presentation-layer tools.

## 10. Future Tauri Integration
The application is designed to be packaged as a Windows desktop application via Tauri. Core logic relies on web standards and local offline persistence mechanisms, allowing a smooth transition to Tauri APIs for filesystem access and SQLite storage.

## 11. Architectural Decisions Not to be Changed
- **No Format-Specific Viewers**: All formats MUST be converted to the Universal Book Model.
- **One Primary Page-Animation Engine**: GSAP is the singular engine for page-turns.
- **State Segregation**: Animation tools must not manage domain or pagination state.
- **Offline First**: The core reading and library functionality must work fully offline without a backend server or cloud dependency.

## 12. Universal Book Model Details
- **Universal Book Model vs Page Model**: The Universal Book Model (`src/book/models/`) is a pure representation of the book's *content* (blocks, text runs, images, metadata). The Page Model (`src/pagination/page-model/`) is strictly a representation of *layout and pagination* (which blocks fit on which screen).
- **Metadata Provenance**: Metadata tracks its source (`file-extracted`, `filename-inferred`, `external-provider`, or `user-edited`) at a field-level, preventing loss of confidence tracking.
- **Block Architecture**: The content is a linear sequence of Blocks (using discriminated unions like `HeadingBlock`, `ParagraphBlock`, `ImageBlock`). This avoids HTML/DOM coupling and ensures the model is serializable and format-independent.
- **Inline Text Architecture**: Paragraphs and headings contain `TextRun`s instead of raw strings, allowing formatting (bold, italic, links) without relying on inline HTML tags.
- **Resource References**: Large binaries (images, fonts) are stored externally (e.g., local files, blobs) and referenced in the model via string `resourceId`s, keeping the domain model lightweight.
- **Reading Position Strategy**: The canonical reading position relies on `(bookId, chapterId, blockId, inlineOffset)` rather than brittle page numbers. This allows position preservation even when window size, font, or layout settings change.
- **Format Independence**: Formats like EPUB, PDF, or DOCX are handled strictly by the Importer Layer. No format-specific attributes (like `epubChapterId` or `pdfPageNumber`) exist within the Universal Book Model.

## 13. File Intake and Import Architecture
- **FileInput**: A format-independent representation of the raw incoming file, abstracting away the browser/desktop specific `File`, `Blob`, or raw buffer details (`dataRef`), along with basic file metadata.
- **FormatIdentifier**: A strongly typed string union (e.g. `'epub'`, `'pdf'`, `'txt'`) denoting the intended format, strictly separated from whether an importer is currently implemented for it.
- **FormatDetector**: Analyzes `FileInput` (via MIME, extension, and eventually magic bytes) and returns a `DetectionResult` containing a format prediction and confidence score. It guards against trusting incorrect extensions.
- **BookImporter Interface**: The abstract contract for any specific format parser. Requires exposing `supportedFormats`, a `canImport` check, and an asynchronous `import` function returning an `ImportResult`.
- **ImportResult, ImportWarning, ImportError**: The pipeline explicitly encodes successes, partial successes (with `ImportWarning`s like missing covers or unsupported layouts), and failures using a discriminated union, avoiding relying on uncaught exceptions.
- **ImporterRegistry**: Centralized registry that holds instantiated `BookImporter`s. It queries the relevant importer based on the `DetectionResult`, segregating the concept of *Supported Formats* (known to the model) from *Implemented Formats* (actively registered importers).
- **Future Parser Architecture & Security**: Parsers execute asynchronously to support eventual worker-based offloading (for heavy decompression or OCR). Renderers are isolated from parsing: imported content is untrusted data and strictly normalized into the Universal Book Model. Raw HTML will not be executed or blindly injected.

## 14. Pagination Engine
- **Core Principle**: The paginator is a pure function that converts the Universal Book Model (content) into `Page`s and `Spread`s (layout) without modifying the original Book. It operates strictly on the universal model, unaware of original file formats.
- **PaginationConfig**: Centralizes immutable layout rules (margins, fonts, spacings, line height).
- **TextMeasurer**: An abstraction allowing deterministic layout calculations without coupling the paginator to the DOM or Canvas APIs. A mock deterministic measurer is used for initial tests.
- **BlockLayoutEngine & Line Breaking**: Individual block types (Heading, Paragraph, Image) are delegated to specific layout routines. Paragraphs undergo a word-wrapping algorithm that outputs `Line` and `LineFragment` metrics.
- **Page Elements**: Block layouts generate `PageElement`s (e.g., `TextElement`, `ImageElement`) containing exact absolute geometry (`x`, `y`, `width`, `height`). These elements map directly back to their source `blockId` and `inlineOffset` for highlighting and bookmarking.
- **PaginationResult**: Groups the generated `Page`s and `Spread`s along with any warnings and the configuration used.
- **Deterministic & Pure**: `Book + PaginationConfig = PaginationResult`. Identical inputs always yield the exact same paginated geometry.
- **Limitations & Future Typography**: Current line-breaking is basic word-wrapping. Future phases will introduce complex hyphenation, ligatures, and true font-aware measurements. Tables currently fall back to placeholder generation until complex table splitting is addressed.

## 15. Reader Presentation Architecture
- **Core Principle**: Pagination determines WHAT appears on a page and its absolute position. The Reader determines HOW the page is displayed and handles interaction (zoom, navigation). The Reader does not modify pagination geometry, it purely scales and positions the spreads.
- **BookReader**: Top-level React component. Hosts the reader state (using a Reducer for navigation and zoom bounds) and intercepts global keyboard shortcuts for pagination.
- **ReaderViewport**: Responsible for framing the current spread, maintaining aspect ratios, and applying CSS transforms to achieve zoom without distorting geometry.
- **SpreadRenderer**: Renders the left and right pages together, including a central spine visual. Handles empty pages (e.g. cover spread with empty left side) non-destructively.
- **PageRenderer**: A rigid container rendering a single `Page` model. Respects the absolute dimensions set by the pagination config.
- **PageElementRenderer**: Translates `PageElement`s (text, image, code) into DOM elements applying inline styles mapped exactly from the layout engine's absolute coordinates (x, y, width, height). Untrusted content is rendered via safe React paradigms, circumventing raw HTML injection.
- **Future Animation Layer**: Currently static. Future phases will introduce GSAP/Three.js hooks transitioning between Spread(n) and Spread(n+1). GSAP will NOT dictate book logic, it will solely orchestrate visual traversal.

## 16. Page Turn Animation Architecture
- **Core Principle**: Animation is purely visual presentation layer logic. It does not contaminate the Universal Book Model, the Pagination Engine, or the semantic Page model. 
- **PageTurnController**: Controls the GSAP timeline and acts as the bridge between React `useEffect` and raw DOM animations. Handles starting, reversing, and cleaning up a turn.
- **State Separation**: The Reducer (`ReaderState`) maintains both a logical `currentSpreadIndex` and a visual `nextSpreadIndex`. The logical index ONLY updates when the GSAP `onComplete` fires via a `COMMIT_TURN` action, preventing navigation races.
- **CSS 3D Engine**: Uses hardware-accelerated CSS transforms (`rotateY`, `perspective`, `transform-origin`, `backface-visibility`) rather than Three.js to keep overhead minimal while achieving a highly realistic hinged page feel.
- **Layering**: A unified right-aligned `TurningPage` container acts as the hinge. During a forward turn, it carries the current right page (front) and next left page (back), rotating -180deg. During a backward turn, it carries the prev right page (front) and current left page (back), animating -180deg to 0deg.
- **Reduced Motion**: Respects `prefers-reduced-motion` media queries by bypassing the GSAP timeline and immediately dispatching `COMMIT_TURN`.
- **Transaction Safety**: A `turnId` mechanism protects `COMMIT_TURN` events. If a GSAP sequence is cancelled and `.reverse()` completes, its stale `onComplete` callback will send an invalidated `turnId`, guaranteeing that it cannot override or accidentally commit the logical state, especially during rapid navigation.

## 17. Typography and Measurement
- **TextMeasurer Abstraction**: Pagination runs agnostically of the measurement technique. The layout engine strictly requires a `TextMeasurer` implementation, receiving metrics (`TextMetrics: {width, height}`).
- **MockTextMeasurer**: Used exclusively for testing to guarantee deterministic cross-platform pagination tests. It computes widths algorithmically via linear font-size calculations without invoking DOM APIs.
- **BrowserTextMeasurer**: The production adapter mapping the `TextMeasurer` interface to standard HTML5 `CanvasRenderingContext2D`. Extracts sub-pixel measurement and applies intrinsic font families, font sizes, weights, and styles.
- **Reflow & Idempotency**: Modifying the Layout settings (e.g. `PaginationConfig`) generates an entirely new array of `Page` structures. The raw `Book` domain remains inherently untainted and format-independent. Pagination does not cache data on the book itself.
- **Font Loading**: `BrowserTextMeasurer` expects requested fonts to be resident. Future updates involving embedded web fonts must guarantee font resolution prior to invoking the `Paginator`, as deferred font swaps will aggressively invalidate pagination line boundaries.

## 18. EPUB Import Architecture
- **Boundary Constraint**: The `EPUBImporter` serves as an absolute boundary. EPUB-specific concepts, DOM nodes, XML properties, and unnormalized relative paths NEVER cross into the `Universal Book Model`.
- **Parsing Flow**: `JSZip` -> `META-INF/container.xml` -> `Rootfile (OPF)` -> `Metadata / Manifest / Spine` -> `XhtmlParser`. 
- **Spine is Authoritative**: Reading order is strictly determined by the OPF `<spine>`, overriding filename or ZIP entry order.
- **Resource Resolution**: All internal `href` and `src` attributes are safely normalized using `resolveRelativePath` preventing traversal attacks (`../` escaping the root). External URLs (e.g., `http://`) are not fetched during import.
- **XHTML Security**: Uses `@xmldom/xmldom` to traverse the DOM in a detached environment (safe from execution). Dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`) and inline event handlers are aggressively filtered. Content is mapped into semantic structures like `HeadingBlock`, `ParagraphBlock`, and inline `TextRun`.
- **Supported Features**: EPUB 2/3 basic container parsing, Spine traversal, standard metadata, structural HTML (h1-h6, p, blockquote, pre, lists, hr, img, table), inline formatting (b, i, u, s, sup, sub, code), and image extraction.
- **Unsupported Features**: Embedded fonts, advanced CSS (injected into universal layout), JavaScript, MathML, SVG (unless mapped to basic images).
- **Error Behavior**: Missing container/OPF yields an `ImportFailure`. Broken internal resource links or unparseable chapters are logged as `ImportWarnings` yielding a partial success if some content remains readable.

## 19. Library and Storage Architecture
- **LibraryBook vs Book**: A strict separation exists between a lightweight application-level collection record (`LibraryBook`) and the heavyweight Universal Book Model (`Book`). Listing library metadata does not require loading or parsing full book content.
- **LibraryService**: Orchestrates interactions across the domain. The `importBook` flow utilizes the `FormatDetector` and `ImporterRegistry`, extracts metadata for a new `LibraryBook`, and persists the full Universal Book Model.
- **Repository Interface Abstraction**: Interaction with storage goes strictly through `BookRepository` (handling metadata and reading progress) and `BookContentRepository` (handling full parsed Book content). The library domain NEVER depends directly on SQLite, IndexedDB, or OS-level file systems.
- **In-Memory Volatility**: The Phase 9 implementation relies purely on in-memory mapping (`InMemoryBookRepository`). Changes are volatile and clear on reload. Persistence will occur in the upcoming Tauri/SQLite phase.
- **Reading Progress**: Governed entirely by logical markers `(bookId, chapterId, blockId, inlineOffset)`, NOT page numbers. Percentages and `lastOpenedTimestamp` are cached for UI purposes.
- **Bookmarks**: Represented as a logical position along with a creation timestamp and optional note.
- **File Reference Opaqueing**: `LibraryBook` manages original files via an opaque string `FileReference`. The internal library architecture must NEVER execute `path.join`, interpret `C:\`, or assume browser `File` objects.
- **Query Abstraction**: Searching, sorting (by title, author, dateAdded, etc.), and filtering (by author, genre, format) are expressed as intent via `LibraryQueryOptions`. The repository determines *how* to execute it (JS filtering currently, SQL later).
- **Duplicate Policy**: At minimum, an identical exact `fileReference` is rejected immediately to prevent identical spam. Titles mapping exactly to matching authors trigger metadata collision warnings allowing them to be forcefully accepted as legitimate alternative editions.
