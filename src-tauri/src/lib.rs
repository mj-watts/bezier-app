#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|err| format!("Failed to read file: {err}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
  std::fs::write(&path, contents).map_err(|err| format!("Failed to write file: {err}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
