use super::query::{CellValue, ColumnMeta, QueryResult};
use serde_json::json;

#[test]
fn test_query_result_serialization() {
    let columns = vec![
        ColumnMeta::new("id", "INTEGER", false),
        ColumnMeta::new("username", "TEXT", false),
        ColumnMeta::new("score", "FLOAT", true),
        ColumnMeta::new("is_active", "BOOLEAN", false),
        ColumnMeta::new("metadata", "JSON", true),
        ColumnMeta::new("payload", "BLOB", true),
        ColumnMeta::new("notes", "TEXT", true),
    ];

    let rows = vec![
        vec![
            CellValue::Integer(1),
            CellValue::Text("alice".to_string()),
            CellValue::Float(95.5),
            CellValue::Boolean(true),
            CellValue::Json(json!({"role": "admin", "level": 10})),
            CellValue::Bytes("aGVsbG8gd29ybGQ=".to_string()),
            CellValue::Null,
        ],
        vec![
            CellValue::Integer(2),
            CellValue::Text("bob".to_string()),
            CellValue::Float(-12.34),
            CellValue::Boolean(false),
            CellValue::Null,
            CellValue::Null,
            CellValue::Text("special notes".to_string()),
        ],
    ];

    let result = QueryResult {
        columns,
        rows,
        execution_time_ms: 42,
        rows_affected: Some(2),
    };

    // Test serialization to JSON string
    let json_str = serde_json::to_string(&result).expect("Failed to serialize QueryResult");
    assert!(!json_str.is_empty());

    // Test serialization to serde_json::Value
    let json_val = serde_json::to_value(&result).expect("Failed to convert QueryResult to Value");
    assert_eq!(json_val["execution_time_ms"], 42);
    assert_eq!(json_val["rows_affected"], 2);
    assert_eq!(json_val["columns"].as_array().unwrap().len(), 7);
    assert_eq!(json_val["rows"].as_array().unwrap().len(), 2);

    // Verify ColumnMeta JSON structure
    let first_col = &json_val["columns"][0];
    assert_eq!(first_col["name"], "id");
    assert_eq!(first_col["data_type"], "INTEGER");
    assert_eq!(first_col["nullable"], false);

    // Verify row values
    let first_row = &json_val["rows"][0];
    assert_eq!(first_row[0], json!({"Integer": 1}));
    assert_eq!(first_row[1], json!({"Text": "alice"}));
    assert_eq!(first_row[2], json!({"Float": 95.5}));
    assert_eq!(first_row[3], json!({"Boolean": true}));
    assert_eq!(first_row[4], json!({"Json": {"role": "admin", "level": 10}}));
    assert_eq!(first_row[5], json!({"Bytes": "aGVsbG8gd29ybGQ="}));
    assert_eq!(first_row[6], json!("Null"));

    // Test round-trip deserialization
    let deserialized: QueryResult =
        serde_json::from_str(&json_str).expect("Failed to deserialize QueryResult");
    assert_eq!(deserialized, result);
}

#[test]
fn test_cell_value_all_variants_roundtrip() {
    let variants = vec![
        CellValue::Null,
        CellValue::Text("hello world".to_string()),
        CellValue::Integer(-9223372036854775807),
        CellValue::Integer(9223372036854775807),
        CellValue::Float(0.0),
        CellValue::Float(std::f64::consts::PI),
        CellValue::Boolean(true),
        CellValue::Boolean(false),
        CellValue::Json(json!({"array": [1, 2, 3], "nested": {"ok": true}})),
        CellValue::Bytes("AQIDBAU=".to_string()),
    ];

    for variant in variants {
        let serialized = serde_json::to_string(&variant).expect("Serialize variant");
        let deserialized: CellValue =
            serde_json::from_str(&serialized).expect("Deserialize variant");
        assert_eq!(variant, deserialized);
    }
}

#[test]
fn test_cell_value_conversions_and_display() {
    let null_val = CellValue::Null;
    assert!(null_val.is_null());
    assert_eq!(null_val.to_display_string(), "NULL");
    assert_eq!(null_val.as_text(), None);

    let text_val: CellValue = "sample text".into();
    assert!(!text_val.is_null());
    assert_eq!(text_val.as_text(), Some("sample text"));
    assert_eq!(text_val.to_display_string(), "sample text");

    let int_val: CellValue = 12345i64.into();
    assert_eq!(int_val.as_i64(), Some(12345));
    assert_eq!(int_val.to_display_string(), "12345");

    let float_val: CellValue = 12.5f64.into();
    assert_eq!(float_val.as_f64(), Some(12.5));
    assert_eq!(float_val.to_display_string(), "12.5");

    let bool_val: CellValue = true.into();
    assert_eq!(bool_val.as_bool(), Some(true));
    assert_eq!(bool_val.to_display_string(), "true");

    let json_val: CellValue = json!({"key": "value"}).into();
    assert!(json_val.as_json().is_some());
    assert_eq!(json_val.to_display_string(), "{\"key\":\"value\"}");

    let bytes_val = CellValue::Bytes("aGVsbG8=".to_string());
    assert_eq!(bytes_val.as_bytes_base64(), Some("aGVsbG8="));
    assert_eq!(bytes_val.to_display_string(), "[Binary: 8 bytes]");
}

#[test]
fn test_column_meta_pk_auto_increment_serialization() {
    let col = ColumnMeta::new("user_id", "BIGINT", false)
        .with_primary_key(true)
        .with_auto_increment(true);

    assert_eq!(col.is_primary_key, Some(true));
    assert_eq!(col.is_auto_increment, Some(true));

    let json_str = serde_json::to_string(&col).expect("serialize col");
    assert!(json_str.contains("\"is_primary_key\":true"));
    assert!(json_str.contains("\"is_auto_increment\":true"));

    let deserialized: ColumnMeta = serde_json::from_str(&json_str).expect("deserialize col");
    assert_eq!(deserialized, col);

    // Omitted fields default to None
    let simple_json = r#"{"name":"title","data_type":"TEXT","nullable":true}"#;
    let simple_col: ColumnMeta = serde_json::from_str(simple_json).expect("deserialize simple col");
    assert_eq!(simple_col.is_primary_key, None);
    assert_eq!(simple_col.is_auto_increment, None);
}
