use std::sync::{Arc, Mutex};
mod macsploit;
use macsploit::TcpState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Mutex::new(TcpState { stream: None })))
        .invoke_handler(tauri::generate_handler![
            macsploit::attach,
            macsploit::detach,
            macsploit::execute,
            macsploit::settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}