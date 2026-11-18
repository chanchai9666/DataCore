use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Computes the `.rejects.csv` path alongside the import file.
/// For `/path/to/data.csv` -> `/path/to/data.rejects.csv`.
/// For `/path/to/data.csv.gz` -> `/path/to/data.csv.rejects.csv`.
pub fn rejects_file_path_for(import_file_path: &str) -> PathBuf {
    let p = Path::new(import_file_path);
    let lower = import_file_path.to_lowercase();
    if lower.ends_with(".gz") || lower.ends_with(".gzip") || lower.ends_with(".zst") || lower.ends_with(".zstd") {
        PathBuf::from(format!("{}.rejects.csv", import_file_path))
    } else {
        p.with_extension("rejects.csv")
    }
}

/// Lazily writes rejected rows (with row number and reason) to a `*.rejects.csv` file.
pub struct RejectsWriter {
    path: PathBuf,
    headers: Vec<String>,
    writer: Option<csv::Writer<BufWriter<File>>>,
    count: usize,
}

impl RejectsWriter {
    pub fn new(import_file_path: &str, headers: Vec<String>) -> Self {
        Self {
            path: rejects_file_path_for(import_file_path),
            headers,
            writer: None,
            count: 0,
        }
    }

    pub fn write_reject(
        &mut self,
        row_number: usize,
        reason: &str,
        row: &[String],
    ) -> Result<(), AppError> {
        if self.writer.is_none() {
            let file = File::create(&self.path).map_err(|e| {
                AppError::Other(format!(
                    "Failed to create rejects file '{}': {}",
                    self.path.display(),
                    e
                ))
            })?;
            let mut csv_w = csv::WriterBuilder::new().from_writer(BufWriter::new(file));
            let mut header_row = Vec::with_capacity(2 + self.headers.len());
            header_row.push("row_number".to_string());
            header_row.push("reject_reason".to_string());
            header_row.extend(self.headers.iter().cloned());
            csv_w
                .write_record(&header_row)
                .map_err(|e| AppError::Other(format!("Failed to write rejects header: {}", e)))?;
            self.writer = Some(csv_w);
        }

        if let Some(ref mut w) = self.writer {
            let mut record = Vec::with_capacity(2 + row.len());
            record.push(row_number.to_string());
            record.push(reason.to_string());
            record.extend(row.iter().cloned());
            w.write_record(&record)
                .map_err(|e| AppError::Other(format!("Failed to write reject row: {}", e)))?;
            self.count += 1;
        }
        Ok(())
    }

    pub fn finish(&mut self) -> Result<Option<String>, AppError> {
        if let Some(ref mut w) = self.writer {
            w.flush()
                .map_err(|e| AppError::Other(format!("Failed to flush rejects file: {}", e)))?;
            Ok(Some(self.path.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportCheckpoint {
    pub file_path: String,
    pub table: String,
    pub committed_rows: usize,
    pub imported_rows: usize,
    pub skipped_rows: usize,
}

pub fn checkpoint_file_path(import_file_path: &str) -> PathBuf {
    PathBuf::from(format!("{}.checkpoint.json", import_file_path))
}

pub fn load_checkpoint(import_file_path: &str, table: &str) -> Option<ImportCheckpoint> {
    let cp_path = checkpoint_file_path(import_file_path);
    let data = std::fs::read_to_string(cp_path).ok()?;
    let cp: ImportCheckpoint = serde_json::from_str(&data).ok()?;
    if cp.table == table {
        Some(cp)
    } else {
        None
    }
}

pub fn save_checkpoint(import_file_path: &str, cp: &ImportCheckpoint) -> Result<(), AppError> {
    let cp_path = checkpoint_file_path(import_file_path);
    let json = serde_json::to_string_pretty(cp)
        .map_err(|e| AppError::Other(format!("Failed to serialize checkpoint: {}", e)))?;
    std::fs::write(&cp_path, json).map_err(|e| {
        AppError::Other(format!(
            "Failed to write checkpoint '{}': {}",
            cp_path.display(),
            e
        ))
    })
}

pub fn remove_checkpoint(import_file_path: &str) {
    let cp_path = checkpoint_file_path(import_file_path);
    let _ = std::fs::remove_file(cp_path);
}
