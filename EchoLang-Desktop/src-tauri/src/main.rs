#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::error::Error;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager};

const SERVER_HOST: &str = "127.0.0.1";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
}

impl BackendState {
    fn set(&self, child: Child) {
        if let Ok(mut current) = self.child.lock() {
            *current = Some(child);
        }
    }

    fn stop(&self) {
        let Ok(mut current) = self.child.lock() else { return };
        let Some(mut child) = current.take() else { return };
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .setup(|app| {
            let (child, port) = start_backend(app.handle())?;
            app.state::<BackendState>().set(child);

            let window = app
                .get_webview_window("main")
                .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "EchoLang 主窗口不存在"))?;
            let url = url::Url::parse(&format!("http://{SERVER_HOST}:{port}"))
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
            window.navigate(url)?;
            window.show()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("EchoLang Tauri 初始化失败")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                app_handle.state::<BackendState>().stop();
            }
        });
}

fn start_backend(app: &AppHandle) -> Result<(Child, u16), Box<dyn Error>> {
    let source_dir = resolve_source_dir(app)?;
    let server_path = source_dir.join("server.mjs");
    if !server_path.is_file() {
        return Err(io::Error::new(io::ErrorKind::NotFound, format!("找不到后端文件：{}", server_path.display())).into());
    }

    let node_path = if cfg!(debug_assertions) {
        std::env::var_os("ECHOLANG_NODE_PATH").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("node"))
    } else {
        source_dir.join("node.exe")
    };
    if !cfg!(debug_assertions) && !node_path.is_file() {
        return Err(io::Error::new(io::ErrorKind::NotFound, format!("找不到内置 Node.js 运行时：{}", node_path.display())).into());
    }

    let port = find_free_port()?;
    let config_dir = resolve_config_dir(app, &source_dir)?;
    let mut command = Command::new(&node_path);
    command
        // Keep the entry point relative to the working directory. This avoids
        // Windows Node.js interpreting a drive-prefixed argument as `D:` when
        // the path contains non-ASCII characters.
        .arg("server.mjs")
        .current_dir(&source_dir)
        .env("PORT", port.to_string())
        .env("ECHOLANG_CONFIG_DIR", config_dir)
        .env_remove("ELECTRON_RUN_AS_NODE")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        io::Error::new(io::ErrorKind::Other, format!("无法启动 EchoLang 后端：{error}"))
    })?;
    if let Some(stdout) = child.stdout.take() {
        forward_output(stdout, "backend");
    }
    if let Some(stderr) = child.stderr.take() {
        forward_output(stderr, "backend error");
    }

    if let Err(error) = wait_for_backend(&mut child, port) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok((child, port))
}

fn resolve_source_dir(app: &AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").canonicalize()?);
    }
    Ok(app.path().resource_dir()?.join("runtime"))
}

fn resolve_config_dir(app: &AppHandle, source_dir: &Path) -> Result<PathBuf, Box<dyn Error>> {
    if cfg!(debug_assertions) {
        return Ok(source_dir.to_path_buf());
    }
    Ok(app.path().config_dir()?.join("EchoLang"))
}

fn find_free_port() -> io::Result<u16> {
    let listener = TcpListener::bind((SERVER_HOST, 0))?;
    Ok(listener.local_addr()?.port())
}

fn wait_for_backend(child: &mut Child, port: u16) -> Result<(), Box<dyn Error>> {
    for _ in 0..150 {
        if let Some(status) = child.try_wait()? {
            return Err(io::Error::new(io::ErrorKind::Other, format!("EchoLang 后端提前退出：{status}")).into());
        }
        if probe_backend(port).unwrap_or(false) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(io::Error::new(io::ErrorKind::TimedOut, format!("EchoLang 后端在端口 {port} 上启动超时")).into())
}

fn probe_backend(port: u16) -> io::Result<bool> {
    let mut stream = TcpStream::connect_timeout(&format!("{SERVER_HOST}:{port}").parse().unwrap(), Duration::from_millis(250))?;
    stream.set_read_timeout(Some(Duration::from_millis(250)))?;
    stream.write_all(format!("GET /api/health HTTP/1.1\r\nHost: {SERVER_HOST}\r\nConnection: close\r\n\r\n").as_bytes())?;
    let mut response = [0_u8; 128];
    let length = stream.read(&mut response).unwrap_or(0);
    Ok(std::str::from_utf8(&response[..length]).unwrap_or_default().contains(" 200 "))
}

fn forward_output<R>(stream: R, label: &'static str)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            eprintln!("[EchoLang {label}] {line}");
        }
    });
}
