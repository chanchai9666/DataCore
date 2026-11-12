import type { QueryResult, CellValue } from '../types/db';

export interface PlanNode {
  id: string | number;
  parentId?: string | number | null;
  nodeType: string;
  relation?: string;
  cost?: {
    startup?: number;
    total?: number;
    raw?: string;
  };
  estimatedRows?: number;
  actualRows?: number;
  actualTime?: string;
  filter?: string;
  detail: string;
  level: number;
  isIndex: boolean;
  isSeqScan: boolean;
  children?: PlanNode[];
}

export interface ParsedPlan {
  nodes: PlanNode[];
  totalCost?: string;
  estimatedRows?: number;
  actualRows?: number;
  planningTime?: string;
  executionTime?: string;
  hasIndexScan: boolean;
  hasSeqScan: boolean;
}

export function extractCellString(val: CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('Text' in val && typeof val.Text === 'string') return val.Text;
    if ('String' in val && typeof val.String === 'string') return val.String;
    if ('Integer' in val) return String(val.Integer);
    if ('Number' in val) return String(val.Number);
    if ('Json' in val) return typeof val.Json === 'string' ? val.Json : JSON.stringify(val.Json);
    return JSON.stringify(val);
  }
  return String(val);
}

export function parseExecutionPlan(
  planResult: QueryResult | null,
  driver?: string
): ParsedPlan {
  if (!planResult || !planResult.rows || planResult.rows.length === 0) {
    return {
      nodes: [],
      hasIndexScan: false,
      hasSeqScan: false,
    };
  }

  const d = (driver || '').toLowerCase();

  // Try parsing SQLite EXPLAIN QUERY PLAN (id, parent, notused, detail)
  if (d.includes('sqlite') || (planResult.columns.length >= 4 && planResult.columns.some(c => c.name.toLowerCase() === 'detail'))) {
    return parseSqlitePlan(planResult);
  }

  // Extract raw lines from table rows
  const planLines = planResult.rows.map((row) => row.map(extractCellString).join(' '));
  const fullText = planLines.join('\n').trim();

  // Check if output is Postgres JSON or MySQL JSON
  if (fullText.startsWith('[') || fullText.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(fullText);
      if (Array.isArray(parsedJson) && parsedJson[0]?.Plan) {
        return parsePostgresJsonPlan(parsedJson[0].Plan, parsedJson[0]);
      }
    } catch {
      // Fallback to text parser below
    }
  }

  return parseTextPlan(planLines);
}

function parseSqlitePlan(planResult: QueryResult): ParsedPlan {
  const nodes: PlanNode[] = [];
  const parentMap = new Map<number, number>();
  let hasIndexScan = false;
  let hasSeqScan = false;

  for (let i = 0; i < planResult.rows.length; i++) {
    const row = planResult.rows[i];
    const idVal = Number(extractCellString(row[0]));
    const parentVal = Number(extractCellString(row[1]));
    const detail = extractCellString(row[3] || row[row.length - 1]);

    parentMap.set(idVal, parentVal);

    // Compute hierarchy level
    let level = 0;
    let curr = parentVal;
    while (curr !== 0 && parentMap.has(curr) && level < 10) {
      level++;
      curr = parentMap.get(curr)!;
    }

    const isIndex =
      detail.toLowerCase().includes('using index') ||
      detail.toLowerCase().includes('search');
    const isSeq =
      detail.toLowerCase().includes('scan table') ||
      (detail.toLowerCase().includes('scan') && !isIndex);

    if (isIndex) hasIndexScan = true;
    if (isSeq) hasSeqScan = true;

    nodes.push({
      id: idVal,
      parentId: parentVal === 0 ? null : parentVal,
      nodeType: detail,
      detail,
      level,
      isIndex,
      isSeqScan: isSeq,
    });
  }

  return {
    nodes,
    hasIndexScan,
    hasSeqScan,
  };
}

function parsePostgresJsonPlan(planObj: any, rootObj?: any): ParsedPlan {
  const nodes: PlanNode[] = [];
  let hasIndexScan = false;
  let hasSeqScan = false;

  function traverse(obj: any, level: number, parentId: string | null) {
    const nodeId = `node_${nodes.length + 1}`;
    const nodeType = obj['Node Type'] || 'Operation';
    const relation = obj['Relation Name'] || obj['Alias'];
    const totalCost = obj['Total Cost'];
    const startupCost = obj['Startup Cost'];
    const planRows = obj['Plan Rows'];
    const actualRows = obj['Actual Rows'];
    const actualTime = obj['Actual Total Time'] ? `${obj['Actual Total Time']} ms` : undefined;
    const filter = obj['Filter'];

    const isIndex = nodeType.toLowerCase().includes('index') || nodeType.toLowerCase().includes('search');
    const isSeq = nodeType.toLowerCase().includes('seq scan') || nodeType.toLowerCase().includes('scan');

    if (isIndex) hasIndexScan = true;
    if (isSeq) hasSeqScan = true;

    const detail = relation ? `${nodeType} on ${relation}` : nodeType;

    nodes.push({
      id: nodeId,
      parentId,
      nodeType,
      relation,
      cost: {
        startup: startupCost,
        total: totalCost,
        raw: totalCost !== undefined ? `${startupCost ?? 0}..${totalCost}` : undefined,
      },
      estimatedRows: planRows,
      actualRows,
      actualTime,
      filter,
      detail,
      level,
      isIndex,
      isSeqScan: isSeq,
    });

    if (Array.isArray(obj['Plans'])) {
      for (const child of obj['Plans']) {
        traverse(child, level + 1, nodeId);
      }
    }
  }

  traverse(planObj, 0, null);

  const planningTime = rootObj?.['Planning Time'] ? `${rootObj['Planning Time']} ms` : undefined;
  const executionTime = rootObj?.['Execution Time'] ? `${rootObj['Execution Time']} ms` : undefined;

  return {
    nodes,
    totalCost: planObj['Total Cost'] !== undefined ? String(planObj['Total Cost']) : undefined,
    estimatedRows: planObj['Plan Rows'],
    actualRows: planObj['Actual Rows'],
    planningTime,
    executionTime,
    hasIndexScan,
    hasSeqScan,
  };
}

function parseTextPlan(planLines: string[]): ParsedPlan {
  const nodes: PlanNode[] = [];
  let hasIndexScan = false;
  let hasSeqScan = false;
  let totalCost: string | undefined;
  let estimatedRows: number | undefined;
  let actualRows: number | undefined;
  let planningTime: string | undefined;
  let executionTime: string | undefined;

  // Regex patterns
  const costRegex = /cost=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)/i;
  const actualRegex = /actual\s+(?:time=[\d.]+\.\.[\d.]+\s+)?rows=(\d+)/i;

  for (let i = 0; i < planLines.length; i++) {
    const rawLine = planLines[i];
    const trimmed = rawLine.trim();

    if (trimmed.toLowerCase().startsWith('planning time:')) {
      planningTime = trimmed.split(':')[1]?.trim();
      continue;
    }
    if (trimmed.toLowerCase().startsWith('execution time:')) {
      executionTime = trimmed.split(':')[1]?.trim();
      continue;
    }

    if (trimmed.length === 0) continue;

    // Detect indent level
    const leadingSpaces = rawLine.length - rawLine.trimStart().length;
    const hasArrow = trimmed.startsWith('->');
    const indentLevel = Math.min(Math.floor(leadingSpaces / 2), 6);

    // Extract Cost and Rows
    const costMatch = rawLine.match(costRegex);
    let nodeCost: PlanNode['cost'] | undefined;
    let nodeEstRows: number | undefined;
    let nodeActualRows: number | undefined;

    if (costMatch) {
      const startup = parseFloat(costMatch[1]);
      const total = parseFloat(costMatch[2]);
      const rows = parseInt(costMatch[3], 10);
      nodeCost = {
        startup,
        total,
        raw: `${costMatch[1]}..${costMatch[2]}`,
      };
      nodeEstRows = rows;

      // First node with cost sets top-level totalCost and estimatedRows
      if (!totalCost) {
        totalCost = costMatch[2];
      }
      if (estimatedRows === undefined) {
        estimatedRows = rows;
      }
    }

    const actualMatch = rawLine.match(actualRegex);
    if (actualMatch) {
      nodeActualRows = parseInt(actualMatch[1], 10);
      if (actualRows === undefined) {
        actualRows = nodeActualRows;
      }
    }

    // Node Type & Details
    let cleanDetail = trimmed;
    if (cleanDetail.startsWith('->')) {
      cleanDetail = cleanDetail.substring(2).trim();
    }

    const isIndex =
      cleanDetail.toLowerCase().includes('index') ||
      cleanDetail.toLowerCase().includes('search');
    const isSeq =
      cleanDetail.toLowerCase().includes('seq scan') ||
      (cleanDetail.toLowerCase().includes('scan') && !isIndex);

    if (isIndex) hasIndexScan = true;
    if (isSeq) hasSeqScan = true;

    nodes.push({
      id: `text_node_${i}`,
      nodeType: cleanDetail.split('(')[0]?.trim() || cleanDetail,
      detail: cleanDetail,
      level: hasArrow ? Math.max(1, indentLevel) : indentLevel,
      cost: nodeCost,
      estimatedRows: nodeEstRows,
      actualRows: nodeActualRows,
      isIndex,
      isSeqScan: isSeq,
    });
  }

  return {
    nodes,
    totalCost,
    estimatedRows,
    actualRows,
    planningTime,
    executionTime,
    hasIndexScan,
    hasSeqScan,
  };
}
