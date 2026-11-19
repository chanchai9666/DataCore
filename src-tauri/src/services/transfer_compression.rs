use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressionFormat {
    None,
    Gzip,
    Zstd,
}

/// Detects compression format from the file extension (case-insensitive).
pub fn detect_compression(file_path: &str) -> CompressionFormat {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".gz") || lower.ends_with(".gzip") {
        CompressionFormat::Gzip
    } else if lower.ends_with(".zst") || lower.ends_with(".zstd") {
        CompressionFormat::Zstd
    } else {
        CompressionFormat::None
    }
}

/// Strips a trailing compression extension (`.gz`, `.gzip`, `.zst`, `.zstd`) if present.
pub fn strip_compression_ext(file_path: &str) -> &str {
    let lower = file_path.to_lowercase();
    for ext in [".gzip", ".zstd", ".gz", ".zst"] {
        if lower.ends_with(ext) {
            return &file_path[..file_path.len() - ext.len()];
        }
    }
    file_path
}

struct AtomicCountingWriter<W: Write> {
    inner: W,
    bytes: Arc<AtomicU64>,
}

impl<W: Write> Write for AtomicCountingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.bytes.fetch_add(n as u64, Ordering::Relaxed);
        Ok(n)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// Asynchronous streaming file writer that offloads gzip/zstd compression and
/// disk I/O to a dedicated `tokio::task::spawn_blocking` thread via an `mpsc` channel
/// so the Tokio async runtime is never blocked.
pub struct AsyncCompressedFileWriter {
    tx: Option<mpsc::Sender<Vec<u8>>>,
    handle: Option<JoinHandle<Result<u64, AppError>>>,
    bytes_written: Arc<AtomicU64>,
}

impl AsyncCompressedFileWriter {
    pub fn create(file_path: &str, compression: CompressionFormat) -> Result<Self, AppError> {
        let file = File::create(file_path).map_err(|e| {
            AppError::Other(format!(
                "Failed to create export file '{}': {}",
                file_path, e
            ))
        })?;
        let bytes_written = Arc::new(AtomicU64::new(0));
        let bytes_clone = bytes_written.clone();

        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(8);

        let handle = tokio::task::spawn_blocking(move || -> Result<u64, AppError> {
            let counting = AtomicCountingWriter {
                inner: BufWriter::with_capacity(64 * 1024, file),
                bytes: bytes_clone.clone(),
            };

            match compression {
                CompressionFormat::None => {
                    let mut writer = counting;
                    while let Some(chunk) = rx.blocking_recv() {
                        writer
                            .write_all(&chunk)
                            .map_err(|e| AppError::Other(format!("File write error: {}", e)))?;
                    }
                    writer
                        .flush()
                        .map_err(|e| AppError::Other(format!("File flush error: {}", e)))?;
                }
                CompressionFormat::Gzip => {
                    let mut encoder = GzEncoder::new(counting, Compression::default());
                    while let Some(chunk) = rx.blocking_recv() {
                        encoder
                            .write_all(&chunk)
                            .map_err(|e| AppError::Other(format!("Gzip write error: {}", e)))?;
                    }
                    let mut inner = encoder
                        .finish()
                        .map_err(|e| AppError::Other(format!("Gzip finish error: {}", e)))?;
                    inner
                        .flush()
                        .map_err(|e| AppError::Other(format!("Gzip flush error: {}", e)))?;
                }
                CompressionFormat::Zstd => {
                    let mut encoder = zstd::stream::write::Encoder::new(counting, 3)
                        .map_err(|e| AppError::Other(format!("Zstd init error: {}", e)))?;
                    while let Some(chunk) = rx.blocking_recv() {
                        encoder
                            .write_all(&chunk)
                            .map_err(|e| AppError::Other(format!("Zstd write error: {}", e)))?;
                    }
                    let mut inner = encoder
                        .finish()
                        .map_err(|e| AppError::Other(format!("Zstd finish error: {}", e)))?;
                    inner
                        .flush()
                        .map_err(|e| AppError::Other(format!("Zstd flush error: {}", e)))?;
                }
            }

            Ok(bytes_clone.load(Ordering::Relaxed))
        });

        Ok(Self {
            tx: Some(tx),
            handle: Some(handle),
            bytes_written,
        })
    }

    pub fn bytes_written_so_far(&self) -> u64 {
        self.bytes_written.load(Ordering::Relaxed)
    }

    pub async fn write_all(&mut self, data: &[u8]) -> Result<(), AppError> {
        if data.is_empty() {
            return Ok(());
        }
        let tx = self
            .tx
            .as_ref()
            .ok_or_else(|| AppError::Other("Writer already closed".to_string()))?;
        tx.send(data.to_vec()).await.map_err(|_| {
            AppError::Other("Compression writer task terminated unexpectedly".to_string())
        })
    }

    pub async fn finish(mut self) -> Result<u64, AppError> {
        drop(self.tx.take());
        if let Some(handle) = self.handle.take() {
            handle
                .await
                .map_err(|e| AppError::Other(format!("Compression task join error: {}", e)))?
        } else {
            Ok(self.bytes_written.load(Ordering::Relaxed))
        }
    }

    pub async fn abort(mut self) {
        drop(self.tx.take());
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
    }
}

/// Opens a file and wraps it with the appropriate streaming decompressor based on extension.
/// Intended to be used inside `tokio::task::spawn_blocking` so decompression never blocks Tokio.
pub fn open_decompressed_reader(file_path: &str) -> Result<Box<dyn Read + Send>, AppError> {
    let file = File::open(file_path)
        .map_err(|e| AppError::Other(format!("Failed to open file '{}': {}", file_path, e)))?;
    let buf_reader = BufReader::with_capacity(64 * 1024, file);

    match detect_compression(file_path) {
        CompressionFormat::None => Ok(Box::new(buf_reader)),
        CompressionFormat::Gzip => Ok(Box::new(GzDecoder::new(buf_reader))),
        CompressionFormat::Zstd => {
            let decoder = zstd::stream::read::Decoder::new(buf_reader)
                .map_err(|e| AppError::Other(format!("Zstd decoder init error: {}", e)))?;
            Ok(Box::new(decoder))
        }
    }
}
