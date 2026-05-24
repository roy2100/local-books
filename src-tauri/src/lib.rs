use base64::{engine::general_purpose::STANDARD, Engine};
use roxmltree::Document;
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
    pub books: Vec<Book>,
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
    let file = fs::File::open(epub_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;

    let opf_path = {
        let mut container = archive.by_name("META-INF/container.xml").ok()?;
        let mut content = String::new();
        container.read_to_string(&mut content).ok()?;
        let doc = Document::parse(&content).ok()?;
        doc.descendants()
            .find(|n| n.tag_name().name() == "rootfile")
            .and_then(|n| n.attribute("full-path"))
            .map(|s| s.to_string())?
    };

    let opf_content = {
        let mut opf_file = archive.by_name(&opf_path).ok()?;
        let mut content = String::new();
        opf_file.read_to_string(&mut content).ok()?;
        content
    };

    let doc = Document::parse(&opf_content).ok()?;

    let title = doc
        .descendants()
        .find(|n| n.tag_name().name() == "title")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| {
            epub_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown Title")
                .to_string()
        });

    let author = doc
        .descendants()
        .find(|n| n.tag_name().name() == "creator")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown Author".to_string());

    let opf_dir = Path::new(&opf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let cover_id = doc
        .descendants()
        .find(|n| {
            n.tag_name().name() == "meta"
                && n.attribute("name").map(|v| v == "cover").unwrap_or(false)
        })
        .and_then(|n| n.attribute("content"))
        .map(|s| s.to_string());

    let cover_path = if let Some(cover_id) = cover_id {
        doc.descendants()
            .find(|n| {
                n.tag_name().name() == "item"
                    && n.attribute("id").map(|v| v == cover_id).unwrap_or(false)
            })
            .and_then(|n| n.attribute("href"))
            .map(|href| {
                if opf_dir.is_empty() {
                    href.to_string()
                } else {
                    format!("{}/{}", opf_dir, href)
                }
            })
    } else {
        doc.descendants()
            .find(|n| {
                n.tag_name().name() == "item"
                    && n.attribute("properties")
                        .map(|v| v.contains("cover-image"))
                        .unwrap_or(false)
            })
            .and_then(|n| n.attribute("href"))
            .map(|href| {
                if opf_dir.is_empty() {
                    href.to_string()
                } else {
                    format!("{}/{}", opf_dir, href)
                }
            })
    };

    let cover_base64 = cover_path.and_then(|cp| {
        let cp = cp.replace('\\', "/");
        let mut entry = archive.by_name(&cp).ok()?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).ok()?;
        let mime = if cp.ends_with(".png") {
            "image/png"
        } else if cp.ends_with(".gif") {
            "image/gif"
        } else {
            "image/jpeg"
        };
        Some(format!("data:{};base64,{}", mime, STANDARD.encode(&buf)))
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

// epub:// protocol handler — serves the raw epub file so epub.js can extract it in the browser
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

    // URL: epub://localhost/{book_id}
    let uri = request.uri().to_string();
    let book_id = uri
        .split("://")
        .nth(1)
        .unwrap_or("")
        .trim_start_matches("localhost/")
        .trim_start_matches('/')
        .split(['/', '?'])
        .next()
        .unwrap_or("")
        .to_string();

    if book_id.is_empty() {
        return err(400, "missing book id");
    }

    let library = load_library(app);
    let Some(book) = library.books.iter().find(|b| b.id == book_id) else {
        return err(404, "book not found");
    };

    match fs::read(&book.path) {
        Ok(bytes) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", "application/epub+zip")
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .unwrap(),
        Err(_) => err(500, "failed to read epub"),
    }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
