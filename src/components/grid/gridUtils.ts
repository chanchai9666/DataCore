import { GridCell, GridCellKind, GridColumn } from '@glideapps/glide-data-grid';
import { CellValue, ColumnMeta } from '../../types/db';

export function createGridColumns(columns: ColumnMeta[]): GridColumn[] {
  return columns.map((col) => {
    // Estimate width based on title and data_type
    const titleLen = col.name.length;
    const typeLen = col.data_type?.length || 0;
    const width = Math.max(120, Math.min(320, (titleLen + typeLen) * 10 + 60));

    return {
      id: col.name,
      title: col.name,
      width,
      hasMenu: false,
    };
  });
}

export interface ExtractedCellValue {
  type: 'null' | 'text' | 'number' | 'boolean' | 'json' | 'bytes';
  rawValue: unknown;
  displayString: string;
}

export function extractCellValue(val: CellValue): ExtractedCellValue {
  if (val === null || val === undefined || val === 'Null') {
    return {
      type: 'null',
      rawValue: null,
      displayString: 'NULL',
    };
  }

  if (typeof val === 'number') {
    return {
      type: 'number',
      rawValue: val,
      displayString: String(val),
    };
  }

  if (typeof val === 'boolean') {
    return {
      type: 'boolean',
      rawValue: val,
      displayString: String(val),
    };
  }

  if (typeof val === 'string') {
    return {
      type: 'text',
      rawValue: val,
      displayString: val,
    };
  }

  if (typeof val === 'object') {
    const record = val as Record<string, unknown>;

    if (typeof record.Text === 'string') {
      return {
        type: 'text',
        rawValue: record.Text,
        displayString: record.Text,
      };
    }

    if (typeof record.Integer === 'number') {
      return {
        type: 'number',
        rawValue: record.Integer,
        displayString: String(record.Integer),
      };
    }

    if (typeof record.Float === 'number') {
      return {
        type: 'number',
        rawValue: record.Float,
        displayString: String(record.Float),
      };
    }

    if (typeof record.Boolean === 'boolean') {
      return {
        type: 'boolean',
        rawValue: record.Boolean,
        displayString: String(record.Boolean),
      };
    }

    if ('Json' in record) {
      return {
        type: 'json',
        rawValue: record.Json,
        displayString:
          typeof record.Json === 'string'
            ? record.Json
            : JSON.stringify(record.Json),
      };
    }

    if (typeof record.Bytes === 'string') {
      return {
        type: 'bytes',
        rawValue: record.Bytes,
        displayString: `[Binary: ${record.Bytes.length} bytes]`,
      };
    }

    return {
      type: 'json',
      rawValue: val,
      displayString: JSON.stringify(val),
    };
  }

  return {
    type: 'text',
    rawValue: val,
    displayString: String(val),
  };
}

export function createCellContent(
  val: CellValue,
  _column?: ColumnMeta
): GridCell {
  const extracted = extractCellValue(val);

  if (extracted.type === 'null') {
    return {
      kind: GridCellKind.Text,
      data: '',
      displayData: 'NULL',
      allowOverlay: true,
      readonly: false,
      themeOverride: {
        textDark: '#888888',
        textMedium: '#888888',
        textLight: '#888888',
        bgCell: 'rgba(128, 128, 128, 0.08)',
      },
    };
  }

  if (extracted.type === 'number') {
    const num = Number(extracted.rawValue);
    return {
      kind: GridCellKind.Number,
      data: isNaN(num) ? 0 : num,
      displayData: extracted.displayString,
      allowOverlay: true,
      readonly: false,
    };
  }

  if (extracted.type === 'boolean') {
    const isTrue = extracted.rawValue === true;
    return {
      kind: GridCellKind.Text,
      data: extracted.displayString,
      displayData: extracted.displayString,
      allowOverlay: false,
      readonly: false,
      themeOverride: {
        textDark: isTrue ? '#10b981' : '#ef4444',
        textMedium: isTrue ? '#10b981' : '#ef4444',
      },
    };
  }

  return {
    kind: GridCellKind.Text,
    data: extracted.displayString,
    displayData: extracted.displayString,
    allowOverlay: true,
    readonly: false,
  };
}
