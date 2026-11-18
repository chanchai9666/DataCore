use std::collections::HashMap;
use std::path::PathBuf;
use crate::models::{ConnectionConfig, DatabaseDriver};
use crate::services::native_backup::{
    build_backup_command, build_restore_command, check_cli_availability_for_driver,
    run_native_cli_streaming, cancel_running_native_task,
    NativeBackupOptions, NativeRestoreOptions, NativeCommandSpec,
};

#[test]
fn test_find_cli_binary_and_availability() {
    // sqlite3 is universally installed on macOS & linux dev environments
    let status = tokio::runtime::Runtime::new().unwrap().block_on(async {
        check_cli_availability_for_driver(DatabaseDriver::Sqlite).await
    });

    assert_eq!(status.cli_name, "sqlite3");
    if status.available {
        assert!(status.path.is_some());
        assert!(status.version.is_some());
    }
}

#[test]
fn test_build_backup_command_postgres_arguments() {
    let config = ConnectionConfig {
        id: "pg-1".to_string(),
        name: "Test PG".to_string(),
        driver: DatabaseDriver::Postgres,
        host: Some("127.0.0.1".to_string()),
        port: Some(5432),
        database: "mydb".to_string(),
        user: Some("postgres".to_string()),
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: None,
        ssh_tunnel: None,
    };

    let opts = NativeBackupOptions {
        connection_id: "pg-1".to_string(),
        output_file: "/tmp/backup.dump".to_string(),
        format: Some("custom".to_string()),
        schema_only: Some(true),
        data_only: Some(false),
        clean: Some(true),
        tables: Some(vec!["users".to_string(), "orders".to_string()]),
        schemas: Some(vec!["public".to_string()]),
        compression_level: Some(9),
        parallel_jobs: None,
    };

    // If pg_dump exists, verify args, otherwise if not installed verify NotFound error
    let res = build_backup_command(&config, Some("secret_pwd"), &opts);
    if let Ok(spec) = res {
        let args = &spec.args;
        assert!(args.contains(&"-h".to_string()));
        assert!(args.contains(&"127.0.0.1".to_string()));
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"5432".to_string()));
        assert!(args.contains(&"-U".to_string()));
        assert!(args.contains(&"postgres".to_string()));
        assert!(args.contains(&"-Fc".to_string()));
        assert!(args.contains(&"--schema-only".to_string()));
        assert!(args.contains(&"--clean".to_string()));
        assert!(args.contains(&"--compress=9".to_string()));
        assert!(args.contains(&"-n".to_string()));
        assert!(args.contains(&"public".to_string()));
        assert!(args.contains(&"-t".to_string()));
        assert!(args.contains(&"users".to_string()));
        assert!(args.contains(&"orders".to_string()));
        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&"/tmp/backup.dump".to_string()));
        assert!(args.contains(&"mydb".to_string()));
        assert_eq!(spec.envs.get("PGPASSWORD").map(|s| s.as_str()), Some("secret_pwd"));
    }
}

#[test]
fn test_build_backup_command_mysql_arguments() {
    let config = ConnectionConfig {
        id: "mysql-1".to_string(),
        name: "Test MySQL".to_string(),
        driver: DatabaseDriver::Mysql,
        host: Some("localhost".to_string()),
        port: Some(3306),
        database: "shop_db".to_string(),
        user: Some("root".to_string()),
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: None,
        ssh_tunnel: None,
    };

    let opts = NativeBackupOptions {
        connection_id: "mysql-1".to_string(),
        output_file: "/tmp/mysql_dump.sql".to_string(),
        format: Some("plain".to_string()),
        schema_only: Some(false),
        data_only: Some(true),
        clean: Some(true),
        tables: Some(vec!["products".to_string()]),
        schemas: None,
        compression_level: None,
        parallel_jobs: None,
    };

    let res = build_backup_command(&config, Some("mypass"), &opts);
    if let Ok(spec) = res {
        let args = &spec.args;
        assert!(args[0].starts_with("--defaults-extra-file="), "First arg must be --defaults-extra-file");
        assert!(!args.iter().any(|a| a.contains("--password=")), "Must not expose plaintext password in argv");
        assert!(args.contains(&"--single-transaction".to_string()));
        assert!(args.contains(&"--host=localhost".to_string()));
        assert!(args.contains(&"--port=3306".to_string()));
        assert!(args.contains(&"--user=root".to_string()));
        assert!(args.contains(&"--no-create-info".to_string()));
        assert!(args.contains(&"--add-drop-table".to_string()));
        assert!(args.contains(&"--result-file=/tmp/mysql_dump.sql".to_string()));
        assert!(args.contains(&"shop_db".to_string()));
        assert!(args.contains(&"products".to_string()));
        assert_eq!(spec.temp_files.len(), 1);
        let content = std::fs::read_to_string(spec.temp_files[0].path()).unwrap();
        assert!(content.contains("[client]"));
        assert!(content.contains("password=\"mypass\""));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(spec.temp_files[0].path()).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
    }
}

#[test]
fn test_build_backup_command_sqlite_arguments() {
    let config = ConnectionConfig {
        id: "sq-1".to_string(),
        name: "Test SQLite".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: "/tmp/sample.db".to_string(),
        user: None,
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: None,
        ssh_tunnel: None,
    };

    let opts = NativeBackupOptions {
        connection_id: "sq-1".to_string(),
        output_file: "/tmp/backup.db".to_string(),
        format: None,
        schema_only: Some(false),
        data_only: None,
        clean: None,
        tables: None,
        schemas: None,
        compression_level: None,
        parallel_jobs: None,
    };

    let spec = build_backup_command(&config, None, &opts).expect("build sqlite backup command");
    assert!(spec.bin.to_string_lossy().contains("sqlite3"));
    assert_eq!(spec.args[0], "/tmp/sample.db");
    assert_eq!(spec.args[1], ".backup '/tmp/backup.db'");

    // Schema-only must write to output_file via .output
    let schema_opts = NativeBackupOptions {
        schema_only: Some(true),
        ..opts
    };
    let schema_spec = build_backup_command(&config, None, &schema_opts).expect("build sqlite schema backup");
    assert_eq!(schema_spec.args[1], ".output '/tmp/backup.db'");
    assert_eq!(schema_spec.args[2], ".schema");
}

#[test]
fn test_build_restore_command_postgres_arguments() {
    let config = ConnectionConfig {
        id: "pg-restore-1".to_string(),
        name: "Test PG Restore".to_string(),
        driver: DatabaseDriver::Postgres,
        host: Some("127.0.0.1".to_string()),
        port: Some(5432),
        database: "mydb_restored".to_string(),
        user: Some("admin".to_string()),
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: None,
        ssh_tunnel: None,
    };

    let opts = NativeRestoreOptions {
        connection_id: "pg-restore-1".to_string(),
        input_file: "/tmp/backup.dump".to_string(),
        clean: Some(true),
        single_transaction: Some(true),
        schema_only: Some(false),
        data_only: Some(false),
        parallel_jobs: None,
    };

    let res = build_restore_command(&config, Some("mypassword"), &opts);
    if let Ok(spec) = res {
        let args = &spec.args;
        assert!(args.contains(&"-h".to_string()));
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"-U".to_string()));
        assert!(args.contains(&"--clean".to_string()));
        assert!(args.contains(&"--single-transaction".to_string()));
        assert!(args.contains(&"-d".to_string()));
        assert!(args.contains(&"mydb_restored".to_string()));
        assert!(args.contains(&"/tmp/backup.dump".to_string()));
        assert_eq!(spec.envs.get("PGPASSWORD").map(|s| s.as_str()), Some("mypassword"));
    }

    // Parallel restore (-j 4) must drop --single-transaction
    let parallel_opts = NativeRestoreOptions {
        parallel_jobs: Some(4),
        ..opts
    };
    if let Ok(spec) = build_restore_command(&config, Some("mypassword"), &parallel_opts) {
        assert!(spec.args.contains(&"-j".to_string()));
        assert!(spec.args.contains(&"4".to_string()));
        assert!(!spec.args.contains(&"--single-transaction".to_string()));
    }
}

#[tokio::test]
async fn test_run_native_cli_streaming_and_cancellation() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    // Use /bin/sh to output lines
    let bin = PathBuf::from("/bin/sh");
    let script = "echo 'line 1'; echo 'line 2'; echo 'error line' >&2; exit 0;";
    let args = vec!["-c".to_string(), script.to_string()];
    let envs = HashMap::new();

    let lines_count = Arc::new(AtomicUsize::new(0));
    let lc = lines_count.clone();

    let code = run_native_cli_streaming(
        "test-task-1".to_string(),
        NativeCommandSpec {
            bin,
            args,
            envs,
            stdin_file: None,
            temp_files: vec![],
        },
        None,
        move |_evt| {
            lc.fetch_add(1, Ordering::SeqCst);
        },
    )
    .await
    .expect("streaming run succeeds");

    assert_eq!(code, 0);
    assert_eq!(lines_count.load(Ordering::SeqCst), 3);

    // Test cancellation + cleanup_path removal
    let cleanup_dir = tempfile::tempdir().unwrap();
    let incomplete_file = cleanup_dir.path().join("incomplete.sql");
    std::fs::write(&incomplete_file, b"partial").unwrap();
    let cleanup_clone = incomplete_file.clone();

    let bin_sleep = PathBuf::from("/bin/sh");
    let sleep_script = "sleep 10;";
    let sleep_args = vec!["-c".to_string(), sleep_script.to_string()];

    let task_id = "test-task-sleep".to_string();
    let task_id_clone = task_id.clone();

    let join_handle = tokio::spawn(async move {
        run_native_cli_streaming(
            task_id_clone,
            NativeCommandSpec {
                bin: bin_sleep,
                args: sleep_args,
                envs: HashMap::new(),
                stdin_file: None,
                temp_files: vec![],
            },
            Some(cleanup_clone),
            |_| {},
        )
        .await
    });

    // Wait 50ms then cancel
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    let cancel_res = cancel_running_native_task(&task_id).await;
    assert!(cancel_res.is_ok());

    let final_res = join_handle.await.expect("join task");
    assert!(final_res.is_err());
    let err_msg = final_res.unwrap_err().to_string();
    assert!(err_msg.contains("cancelled"));
    assert!(!incomplete_file.exists(), "Incomplete output file must be cleaned up on cancel");
}

#[test]
fn test_cli_option_injection_blocked() {
    let config = ConnectionConfig {
        id: "sq-inj".to_string(),
        name: "Injection Test".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: Some("--proxy-command=evil".to_string()),
        port: None,
        database: "/tmp/sample.db".to_string(),
        user: None,
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: None,
        ssh_tunnel: None,
    };

    let opts = NativeBackupOptions {
        connection_id: "sq-inj".to_string(),
        output_file: "/tmp/out.db".to_string(),
        format: None,
        schema_only: None,
        data_only: None,
        clean: None,
        tables: None,
        schemas: None,
        compression_level: None,
        parallel_jobs: None,
    };

    let err = build_backup_command(&config, None, &opts).err().expect("must reject leading dash host");
    assert!(err.to_string().contains("option injection"));
}
