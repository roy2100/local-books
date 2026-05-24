use base64::{engine::general_purpose::STANDARD, Engine};
use epub::doc::EpubDoc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::ZipArchive;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub path: String,
    pub cover: Option<String>,
    pub added_at: u64,
    pub source_folder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct Library {
    #[serde(default)]
    pub books: Vec<Book>,
    #[serde(default)]
    pub folders: Vec<String>,
}

fn library_path<R: tauri::Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().app_data_dir().unwrap().join("library.json")
}

fn load_library<R: tauri::Runtime>(app: &AppHandle<R>) -> Library {
    let path = library_path(app);
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Library::default()
    }
}

fn save_library<R: tauri::Runtime>(app: &AppHandle<R>, library: &Library) {
    let path = library_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let data = serde_json::to_string_pretty(library).unwrap_or_default();
    let _ = fs::write(&path, data);
}

fn extract_epub_metadata(epub_path: &Path) -> Option<(String, String, Option<String>)> {
    let mut doc = EpubDoc::new(epub_path).ok()?;

    let title = doc.get_title().unwrap_or_else(|| {
        epub_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Title")
            .to_string()
    });

    let author = doc
        .mdata("creator")
        .map(|m| m.value.trim().to_string())
        .unwrap_or_else(|| "Unknown Author".to_string());

    let cover_base64 = doc.get_cover().map(|(data, mime)| {
        format!("data:{};base64,{}", mime, STANDARD.encode(&data))
    });

    Some((title, author, cover_base64))
}

fn scan_folder_for_epubs(folder: &str, source_folder: &str) -> Vec<Book> {
    let mut books = Vec::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    for entry in WalkDir::new(folder)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("epub") {
            let path_str = path.to_string_lossy().to_string();
            let (title, author, cover) = extract_epub_metadata(path).unwrap_or_else(|| {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown Title")
                    .to_string();
                (name, "Unknown Author".to_string(), None)
            });

            books.push(Book {
                id: Uuid::new_v4().to_string(),
                title,
                author,
                path: path_str,
                cover,
                added_at: now,
                source_folder: Some(source_folder.to_string()),
            });
        }
    }

    books
}

// ── Spine / TOC types ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct SpineItem {
    pub href: String,
    pub id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct TocEntry {
    pub label: String,
    pub href: String,
    pub children: Vec<TocEntry>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BookContents {
    pub spine: Vec<SpineItem>,
    pub toc: Vec<TocEntry>,
}

// ── Main EPUB contents parser ─────────────────────────────────────────────────

fn nav_point_to_toc_entry(np: &epub::doc::NavPoint) -> TocEntry {
    TocEntry {
        label: np.label.clone(),
        href: np.content.to_string_lossy().replace('\\', "/"),
        children: np.children.iter().map(nav_point_to_toc_entry).collect(),
    }
}

fn parse_epub_contents(epub_path: &Path) -> Option<BookContents> {
    let doc = EpubDoc::new(epub_path).ok()?;

    let spine: Vec<SpineItem> = doc
        .spine
        .iter()
        .filter(|s| s.linear)
        .filter_map(|s| {
            let resource = doc.resources.get(&s.idref)?;
            let href = resource.path.to_string_lossy().replace('\\', "/");
            Some(SpineItem { href, id: s.idref.clone() })
        })
        .collect();

    let toc: Vec<TocEntry> = doc.toc.iter().map(nav_point_to_toc_entry).collect();

    Some(BookContents { spine, toc })
}

// ── Script injected into every EPUB HTML chapter ──────────────────────────────

const READER_SCRIPT: &str = r#"<style>
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.22); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.42); }
</style>
<script>
(function(){
  document.addEventListener('click', function(e) {
    var a = e.target;
    while (a && a.tagName !== 'A') a = a.parentElement;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({type:'epub-navigate', href: a.href}, '*');
  }, true);
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'epub-theme') return;
    var el = document.getElementById('__reader_css__');
    if (!el) {
      el = document.createElement('style');
      el.id = '__reader_css__';
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) head.insertBefore(el, head.firstChild);
    }
    el.textContent = e.data.css;
  });
  window.parent.postMessage({type:'epub-ready'}, '*');
})();
</script>"#;

fn inject_reader_script(buf: Vec<u8>) -> Vec<u8> {
    let html = match String::from_utf8(buf) {
        Ok(s) => s,
        Err(e) => return e.into_bytes(),
    };
    let lower = html.to_lowercase();
    let pos = lower
        .rfind("</body>")
        .or_else(|| lower.rfind("</html>"))
        .unwrap_or(html.len());
    format!("{}{}{}", &html[..pos], READER_SCRIPT, &html[pos..]).into_bytes()
}

/// Splits `epub://localhost/{book_id}/{file_path}` into `(book_id, file_path)`.
/// `file_path` is empty when no path after the id, or equals "book.epub" for the binary.
fn parse_epub_uri(uri: &str) -> (&str, &str) {
    let after_host = uri
        .split("://")
        .nth(1)
        .unwrap_or("")
        .trim_start_matches("localhost/")
        .trim_start_matches('/');
    // Strip query string before splitting on path separator
    let path = after_host.split('?').next().unwrap_or(after_host);
    match path.find('/') {
        Some(idx) => (&path[..idx], path[idx + 1..].trim_start_matches('/')),
        None => (path, ""),
    }
}

fn mime_type_for(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".css") { "text/css" }
    else if p.ends_with(".xhtml") || p.ends_with(".html") || p.ends_with(".htm") { "text/html; charset=utf-8" }
    else if p.ends_with(".jpg") || p.ends_with(".jpeg") { "image/jpeg" }
    else if p.ends_with(".png") { "image/png" }
    else if p.ends_with(".gif") { "image/gif" }
    else if p.ends_with(".svg") { "image/svg+xml" }
    else if p.ends_with(".opf") { "application/oebps-package+xml" }
    else if p.ends_with(".ncx") { "application/x-dtbncx+xml" }
    else if p.ends_with(".xml") { "application/xml" }
    else if p.ends_with(".ttf") { "font/ttf" }
    else if p.ends_with(".otf") { "font/otf" }
    else if p.ends_with(".woff") { "font/woff" }
    else if p.ends_with(".woff2") { "font/woff2" }
    else { "application/octet-stream" }
}

// epub:// protocol handler — serves either the full EPUB binary or individual files within it.
// epub://localhost/{id}/book.epub  → full binary (epub.js binary mode)
// epub://localhost/{id}/OEBPS/Styles/style.css → single file from the ZIP with correct MIME
fn serve_epub_protocol(
    ctx: tauri::UriSchemeContext<'_, impl tauri::Runtime>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let app = ctx.app_handle();
    let err = |status: u16, msg: &'static str| {
        tauri::http::Response::builder()
            .status(status)
            .header("Access-Control-Allow-Origin", "*")
            .body(msg.as_bytes().to_vec())
            .unwrap()
    };

    let uri = request.uri().to_string();
    let (book_id, file_path) = parse_epub_uri(&uri);

    if book_id.is_empty() {
        return err(400, "missing book id");
    }

    let library = load_library(app);
    let Some(book) = library.books.iter().find(|b| b.id == book_id) else {
        return err(404, "book not found");
    };

    // No path (or the synthetic "book.epub") → serve full binary so epub.js can open it
    if file_path.is_empty() || file_path == "book.epub" {
        return match fs::read(&book.path) {
            Ok(bytes) => tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "application/epub+zip")
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap(),
            Err(_) => err(500, "failed to read epub"),
        };
    }

    // Specific path → extract that file from the ZIP and serve it with correct MIME type
    let file = match fs::File::open(&book.path) {
        Ok(f) => f,
        Err(_) => return err(500, "failed to open epub"),
    };
    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return err(500, "failed to parse epub"),
    };
    let mut entry = match archive.by_name(file_path) {
        Ok(e) => e,
        Err(_) => return err(404, "file not found in epub"),
    };
    let mut buf = Vec::new();
    if entry.read_to_end(&mut buf).is_err() {
        return err(500, "failed to read file from epub");
    }

    let mime = mime_type_for(file_path);
    let body = if mime.starts_with("text/html") {
        inject_reader_script(buf)
    } else {
        buf
    };

    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap()
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder_path| {
        let _ = tx.send(folder_path);
    });
    rx.recv()
        .ok()
        .flatten()
        .map(|p| p.to_string())
}

#[tauri::command]
async fn import_folder(app: AppHandle, folder_path: String) -> Result<Library, String> {
    let mut library = load_library(&app);

    if library.folders.contains(&folder_path) {
        return Err("该文件夹已导入".to_string());
    }

    let new_books = scan_folder_for_epubs(&folder_path, &folder_path);
    library.folders.push(folder_path);
    library.books.extend(new_books);
    save_library(&app, &library);

    Ok(library)
}

#[tauri::command]
async fn get_library(app: AppHandle) -> Library {
    load_library(&app)
}

#[tauri::command]
async fn remove_book(app: AppHandle, book_id: String) -> Library {
    let mut library = load_library(&app);
    library.books.retain(|b| b.id != book_id);
    save_library(&app, &library);
    library
}

#[tauri::command]
async fn remove_folder(app: AppHandle, folder_path: String) -> Library {
    let mut library = load_library(&app);
    library.folders.retain(|f| f != &folder_path);
    library
        .books
        .retain(|b| b.source_folder.as_deref() != Some(&folder_path));
    save_library(&app, &library);
    library
}

#[tauri::command]
async fn refresh_folder(app: AppHandle, folder_path: String) -> Result<Library, String> {
    let mut library = load_library(&app);
    library
        .books
        .retain(|b| b.source_folder.as_deref() != Some(&folder_path));
    let new_books = scan_folder_for_epubs(&folder_path, &folder_path);
    library.books.extend(new_books);
    save_library(&app, &library);
    Ok(library)
}

#[tauri::command]
async fn get_book_contents(app: AppHandle, book_id: String) -> Result<BookContents, String> {
    let library = load_library(&app);
    let book = library
        .books
        .iter()
        .find(|b| b.id == book_id)
        .ok_or_else(|| "book not found".to_string())?;
    parse_epub_contents(Path::new(&book.path)).ok_or_else(|| "failed to parse epub".to_string())
}

#[tauri::command]
async fn open_reader_window(
    app: AppHandle,
    book_id: String,
    title: String,
) -> Result<(), String> {
    // Use first 8 chars of UUID as window label (must be valid identifier)
    let label = format!("reader-{}", book_id.replace('-', "").get(..12).unwrap_or("x"));

    if let Some(win) = app.get_webview_window(&label) {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Inject book context before React loads — Reader.tsx reads these globals
    let safe_title = title.replace('\\', "\\\\").replace('\'', "\\'");
    let script = format!(
        "window.__READER_BOOK_ID__='{book_id}';window.__READER_BOOK_TITLE__='{safe_title}';"
    );

    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(&title)
    .inner_size(1100.0, 750.0)
    .min_inner_size(700.0, 500.0)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .initialization_script(&script)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("epub", serve_epub_protocol)
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            import_folder,
            get_library,
            remove_book,
            remove_folder,
            refresh_folder,
            open_reader_window,
            get_book_contents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use zip::write::SimpleFileOptions;

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// Builds a minimal but valid EPUB zip in memory.
    fn make_epub(title: &str, author: &str, cover_jpg: Option<&[u8]>) -> Vec<u8> {
        let cursor = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);

        let stored = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default();

        // mimetype must be first and uncompressed
        zip.start_file("mimetype", stored).unwrap();
        zip.write_all(b"application/epub+zip").unwrap();

        zip.start_file("META-INF/container.xml", deflated).unwrap();
        zip.write_all(
            br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
        )
        .unwrap();

        let cover_item = if cover_jpg.is_some() {
            r#"<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>"#
        } else {
            ""
        };

        let opf = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>
  </metadata>
  <manifest>{cover_item}</manifest>
  <spine/>
</package>"#
        );
        zip.start_file("OEBPS/content.opf", deflated).unwrap();
        zip.write_all(opf.as_bytes()).unwrap();

        if let Some(data) = cover_jpg {
            zip.start_file("OEBPS/cover.jpg", deflated).unwrap();
            zip.write_all(data).unwrap();
        }

        zip.finish().unwrap().into_inner()
    }

    /// Writes bytes to a NamedTempFile with a .epub suffix.
    fn temp_epub(bytes: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new().suffix(".epub").tempfile().unwrap();
        f.write_all(bytes).unwrap();
        f
    }

    // ── URI parsing ───────────────────────────────────────────────────────────

    #[test]
    fn book_id_extracted_with_epub_suffix() {
        assert_eq!(parse_epub_uri("epub://localhost/abc-123/book.epub").0, "abc-123");
    }

    #[test]
    fn book_id_extracted_bare() {
        assert_eq!(parse_epub_uri("epub://localhost/abc-123").0, "abc-123");
    }

    #[test]
    fn book_id_extracted_trailing_slash() {
        assert_eq!(parse_epub_uri("epub://localhost/abc-123/").0, "abc-123");
    }

    #[test]
    fn book_id_empty_when_root_only() {
        assert_eq!(parse_epub_uri("epub://localhost/").0, "");
    }

    #[test]
    fn file_path_extracted() {
        assert_eq!(
            parse_epub_uri("epub://localhost/abc-123/OEBPS/Styles/style.css").1,
            "OEBPS/Styles/style.css"
        );
    }

    #[test]
    fn book_id_query_param_ignored() {
        assert_eq!(parse_epub_uri("epub://localhost/abc-123?v=1").0, "abc-123");
    }

    // ── Library serialization ─────────────────────────────────────────────────

    #[test]
    fn library_round_trips_through_json() {
        let original = Library {
            books: vec![Book {
                id: "id-1".into(),
                title: "Rust Programming".into(),
                author: "Steve K".into(),
                path: "/books/rust.epub".into(),
                cover: None,
                added_at: 1_700_000_000,
                source_folder: Some("/books".into()),
            }],
            folders: vec!["/books".into()],
        };

        let json = serde_json::to_string(&original).unwrap();
        let restored: Library = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.books.len(), 1);
        assert_eq!(restored.books[0].title, "Rust Programming");
        assert_eq!(restored.books[0].author, "Steve K");
        assert_eq!(restored.books[0].added_at, 1_700_000_000);
        assert_eq!(restored.folders, vec!["/books"]);
    }

    #[test]
    fn empty_json_object_deserializes_to_default_library() {
        let lib: Library = serde_json::from_str("{}").unwrap();
        assert!(lib.books.is_empty());
        assert!(lib.folders.is_empty());
    }

    #[test]
    fn book_with_null_cover_survives_round_trip() {
        let book = Book {
            id: "x".into(),
            title: "T".into(),
            author: "A".into(),
            path: "/p".into(),
            cover: None,
            added_at: 0,
            source_folder: None,
        };
        let json = serde_json::to_string(&book).unwrap();
        let back: Book = serde_json::from_str(&json).unwrap();
        assert!(back.cover.is_none());
        assert!(back.source_folder.is_none());
    }

    // ── EPUB metadata extraction ──────────────────────────────────────────────

    #[test]
    fn extracts_title_and_author() {
        let bytes = make_epub("Moby Dick", "Herman Melville", None);
        let tmp = temp_epub(&bytes);
        let (title, author, cover) = extract_epub_metadata(tmp.path()).unwrap();
        assert_eq!(title, "Moby Dick");
        assert_eq!(author, "Herman Melville");
        assert!(cover.is_none());
    }

    #[test]
    fn extracts_cover_as_base64_data_url() {
        // Minimal JFIF JPEG bytes (22 bytes, 1×1 pixel)
        let tiny_jpg: &[u8] = &[
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00,
            0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
        ];
        let bytes = make_epub("Cover Test", "Author", Some(tiny_jpg));
        let tmp = temp_epub(&bytes);
        let (_, _, cover) = extract_epub_metadata(tmp.path()).unwrap();
        let cover = cover.expect("expected a cover");
        assert!(cover.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn missing_title_falls_back_to_filename_stem() {
        // OPF with no <dc:title>
        let cursor = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        zip.start_file(
            "mimetype",
            SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored),
        )
        .unwrap();
        zip.write_all(b"application/epub+zip").unwrap();
        zip.start_file("META-INF/container.xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#)
            .unwrap();
        zip.start_file("OEBPS/content.opf", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"></metadata><manifest/><spine/></package>"#)
            .unwrap();
        let raw = zip.finish().unwrap().into_inner();
        let tmp = temp_epub(&raw);

        let (title, author, _) = extract_epub_metadata(tmp.path()).unwrap();
        // Filename stem is some temp name, but must be non-empty
        assert!(!title.is_empty());
        assert_eq!(author, "Unknown Author");
    }

    #[test]
    fn returns_none_for_invalid_zip() {
        let tmp = temp_epub(b"this is not a zip file");
        assert!(extract_epub_metadata(tmp.path()).is_none());
    }

    // ── Folder scanning ───────────────────────────────────────────────────────

    #[test]
    fn scan_finds_epub_in_folder() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = make_epub("Scanned Book", "Scanned Author", None);
        std::fs::write(dir.path().join("book.epub"), &bytes).unwrap();

        let books = scan_folder_for_epubs(
            dir.path().to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Scanned Book");
        assert_eq!(books[0].author, "Scanned Author");
        assert_eq!(
            books[0].source_folder.as_deref(),
            Some(dir.path().to_str().unwrap())
        );
        assert!(!books[0].id.is_empty());
    }

    #[test]
    fn scan_ignores_non_epub_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"text").unwrap();
        std::fs::write(dir.path().join("report.pdf"), b"PDF").unwrap();

        let books = scan_folder_for_epubs(
            dir.path().to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );

        assert!(books.is_empty());
    }

    #[test]
    fn scan_recurses_into_subdirectories() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("classics");
        std::fs::create_dir(&sub).unwrap();
        let bytes = make_epub("Deep Book", "Deep Author", None);
        std::fs::write(sub.join("deep.epub"), bytes).unwrap();

        let books = scan_folder_for_epubs(
            dir.path().to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Deep Book");
    }

    #[test]
    fn scan_returns_multiple_epubs() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..3 {
            let bytes = make_epub(&format!("Book {i}"), "Author", None);
            std::fs::write(dir.path().join(format!("book{i}.epub")), bytes).unwrap();
        }

        let books = scan_folder_for_epubs(
            dir.path().to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );

        assert_eq!(books.len(), 3);
        // Every book gets a unique UUID
        let ids: std::collections::HashSet<_> = books.iter().map(|b| &b.id).collect();
        assert_eq!(ids.len(), 3);
    }
}
