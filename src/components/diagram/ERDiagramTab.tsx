import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Key,
  Layers,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchERDiagramData,
  computeAutoLayout,
  exportERDiagramAsSvg,
  generateERDiagramSql,
} from '../../api/erDiagramApi';
import type { ERDiagramData, ERTable } from '../../types/db';

export interface ERDiagramTabProps {
  connectionId: string;
  driver?: string;
  schemaName?: string;
  theme?: 'dark' | 'light';
}

export const ERDiagramTab: React.FC<ERDiagramTabProps> = ({
  connectionId,
  driver = 'sqlite',
  schemaName,
  theme = 'dark',
}) => {
  const [data, setData] = useState<ERDiagramData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport transformation
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging table
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ mouseX: number; mouseY: number; tableX: number; tableY: number }>({
    mouseX: 0,
    mouseY: 0,
    tableX: 0,
    tableY: 0,
  });

  // UI state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [hoveredRelId, setHoveredRelId] = useState<string | null>(null);
  const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [copiedDdl, setCopiedDdl] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load data
  const loadDiagram = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const diagram = await fetchERDiagramData(connectionId, driver, schemaName);
      setData(diagram);
    } catch (err: any) {
      console.error('Failed to load ER diagram:', err);
      setError(err?.message || 'Failed to introspect database schema.');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, driver, schemaName]);

  useEffect(() => {
    loadDiagram();
  }, [loadDiagram]);

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Math.round((z - 0.15) * 100) / 100));
  const handleZoomReset = () => {
    setZoom(1.0);
    setPan({ x: 40, y: 40 });
  };

  const handleFitView = () => {
    if (!data || data.tables.length === 0 || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    data.tables.forEach((t) => {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + 280);
      maxY = Math.max(maxY, t.y + 200);
    });

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;

    const scaleX = clientWidth / graphWidth;
    const scaleY = clientHeight / graphHeight;
    const newZoom = Math.min(1.2, Math.max(0.3, Math.min(scaleX, scaleY)));

    setZoom(Math.round(newZoom * 100) / 100);
    setPan({
      x: (clientWidth - graphWidth * newZoom) / 2 - minX * newZoom,
      y: (clientHeight - graphHeight * newZoom) / 2 - minY * newZoom,
    });
  };

  // Re-run auto layout
  const handleAutoLayout = () => {
    if (!data) return;
    const laidOut = computeAutoLayout(data.tables, data.relationships);
    setData({
      ...data,
      tables: laidOut,
    });
    toast.success('Diagram rearranged automatically.');
  };

  // Toggle table collapse
  const toggleCollapse = (tableId: string) => {
    setCollapsedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  // Canvas Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggingTableId) return;
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    } else if (draggingTableId && data) {
      const dx = (e.clientX - dragStartPosRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartPosRef.current.mouseY) / zoom;
      const newX = Math.max(0, dragStartPosRef.current.tableX + dx);
      const newY = Math.max(0, dragStartPosRef.current.tableY + dy);

      setData({
        ...data,
        tables: data.tables.map((t) =>
          t.id === draggingTableId ? { ...t, x: Math.round(newX), y: Math.round(newY) } : t
        ),
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingTableId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(2.5, Math.max(0.25, Math.round(z * zoomFactor * 100) / 100)));
  };

  // Start dragging a table card
  const handleTableMouseDown = (e: React.MouseEvent, table: ERTable) => {
    e.stopPropagation();
    setDraggingTableId(table.id);
    setSelectedTableId(table.id);
    dragStartPosRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      tableX: table.x,
      tableY: table.y,
    };
  };

  // Export handlers
  const handleExportSvg = () => {
    if (!data) return;
    const svgStr = exportERDiagramAsSvg(data, theme);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${schemaName || 'database'}_er_diagram.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ER Diagram exported as SVG.');
  };

  const handleExportSql = () => {
    if (!data) return;
    const sql = generateERDiagramSql(data, driver);
    navigator.clipboard.writeText(sql);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
    toast.success('DDL Schema copied to clipboard.');
  };

  // Filtered tables by search
  const filteredTableIds = useMemo(() => {
    if (!data || !searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return new Set(
      data.tables
        .filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.columns.some((c) => c.name.toLowerCase().includes(q))
        )
        .map((t) => t.id)
    );
  }, [data, searchQuery]);

  // Map of table positions for connector curves
  const tablePosMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number; isCollapsed: boolean }>();
    if (!data) return map;
    data.tables.forEach((t) => {
      map.set(t.id, { x: t.x, y: t.y, isCollapsed: collapsedTables.has(t.id) });
    });
    return map;
  }, [data, collapsedTables]);

  // Set of related column keys for O(1) foreign key lookup
  const relatedColumnKeys = useMemo(() => {
    const set = new Set<string>();
    if (!data) return set;
    for (const r of data.relationships) {
      set.add(`${r.fromTable}.${r.fromColumn}`);
      set.add(`${r.toTable}.${r.toColumn}`);
    }
    return set;
  }, [data?.relationships]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted select-none">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-medium text-text">Loading ER Diagram...</p>
        <p className="text-xs text-muted/80 mt-1">Introspecting schema tables and foreign keys</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
        <h3 className="text-sm font-semibold text-text">Unable to build ER Diagram</h3>
        <p className="text-xs text-muted mt-1 max-w-md text-center">{error}</p>
        <button
          type="button"
          onClick={loadDiagram}
          className="mt-4 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="flex-1 flex flex-col relative overflow-hidden select-none bg-slate-100 dark:bg-[#0b0f17] text-text"
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Search Box */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel/90 backdrop-blur border border-line shadow-lg text-xs">
            <Search className="w-3.5 h-3.5 text-muted" />
            <input
              type="text"
              placeholder="Search tables or columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-text placeholder-muted/60 w-44"
            />
            {filteredTableIds && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                Matching: {filteredTableIds.size}
              </span>
            )}
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-panel/90 backdrop-blur border border-line shadow-lg text-xs font-mono text-muted">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>{data.tables.length} tables</span>
            <span className="text-muted/40">•</span>
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            <span>{data.relationships.length} relations</span>
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Auto Layout */}
          <button
            type="button"
            data-testid="er-auto-layout"
            onClick={handleAutoLayout}
            title="Auto-arrange tables"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-panel/90 backdrop-blur border border-line hover:border-accent hover:text-text shadow-lg text-xs font-medium text-muted transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Auto Layout</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center rounded-md bg-panel/90 backdrop-blur border border-line shadow-lg p-0.5 text-xs text-muted">
            <button
              type="button"
              data-testid="er-zoom-out"
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 hover:text-text hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="er-zoom-reset"
              onClick={handleZoomReset}
              title="Reset Zoom to 100%"
              className="px-1.5 py-0.5 text-[11px] font-mono hover:text-text hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              data-testid="er-zoom-in"
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1 hover:text-text hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitView}
              title="Fit to Screen"
              className="p-1 hover:text-text hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors border-l border-line/50 ml-0.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export Menu */}
          <div className="relative">
            <button
              type="button"
              data-testid="er-export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white shadow-lg text-xs font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showExportMenu && (
              <div
                className="absolute right-0 mt-1 w-44 rounded-md bg-panel border border-line shadow-xl py-1 text-xs z-40"
                onClick={() => setShowExportMenu(false)}
              >
                <button
                  type="button"
                  onClick={handleExportSvg}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Export as SVG Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportSql}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                >
                  {copiedDdl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-purple-400" />
                  )}
                  <span>Copy SQL Schema (DDL)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Transformable Canvas */}
      <div
        className="w-full h-full origin-top-left absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: isPanning ? 'none' : 'transform 0.05s ease-out',
        }}
      >
        {/* SVG Connectors Layer */}
        <svg
          className="absolute inset-0 overflow-visible pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <marker
              id="er-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
            </marker>
            <marker
              id="er-arrow-hover"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
          </defs>

          {data.relationships.map((rel) => {
            const src = tablePosMap.get(rel.fromTable);
            const tgt = tablePosMap.get(rel.toTable);
            if (!src || !tgt) return null;

            const isHovered = hoveredRelId === rel.id;
            const isSelected =
              selectedTableId === rel.fromTable || selectedTableId === rel.toTable;

            const cardWidth = 260;
            const isSourceLeft = src.x < tgt.x;
            const startX = isSourceLeft ? src.x + cardWidth : src.x;
            const startY = src.y + 24;
            const endX = isSourceLeft ? tgt.x : tgt.x + cardWidth;
            const endY = tgt.y + 24;

            const dx = Math.max(40, Math.abs(endX - startX) * 0.5);
            const cp1x = isSourceLeft ? startX + dx : startX - dx;
            const cp2x = isSourceLeft ? endX - dx : endX + dx;
            const pathData = `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`;

            const strokeColor = isHovered
              ? '#10b981'
              : isSelected
              ? '#60a5fa'
              : 'rgba(96, 165, 250, 0.4)';
            const strokeWidth = isHovered ? 2.5 : isSelected ? 2 : 1.5;

            return (
              <g
                key={rel.id}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredRelId(rel.id)}
                onMouseLeave={() => setHoveredRelId(null)}
              >
                {/* Thick invisible stroke for easier hover hit */}
                <path d={pathData} fill="none" stroke="transparent" strokeWidth="14" />
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isSelected ? undefined : '4 2'}
                  markerEnd={isHovered ? 'url(#er-arrow-hover)' : 'url(#er-arrow)'}
                />
                <circle cx={startX} cy={startY} r="3" fill={strokeColor} />
                <circle cx={endX} cy={endY} r="3" fill={strokeColor} />
              </g>
            );
          })}
        </svg>

        {/* Table Cards Layer */}
        {data.tables.map((table) => {
          const isCollapsed = collapsedTables.has(table.id);
          const isSelected = selectedTableId === table.id;
          const isMatched =
            filteredTableIds === null || filteredTableIds.has(table.id);

          return (
            <div
              key={table.id}
              style={{
                transform: `translate(${table.x}px, ${table.y}px)`,
                width: '260px',
                opacity: isMatched ? 1 : 0.25,
              }}
              onClick={() => setSelectedTableId(table.id)}
              className={`absolute rounded-lg border shadow-xl bg-panel transition-shadow duration-100 ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-blue-500/10'
                  : 'border-line hover:border-line-hover'
              }`}
            >
              {/* Table Card Header (Draggable) */}
              <div
                onMouseDown={(e) => handleTableMouseDown(e, table)}
                className="flex items-center justify-between px-2.5 py-2 bg-black/10 dark:bg-white/5 rounded-t-lg border-b border-line cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(table.id);
                    }}
                    className="p-0.5 rounded text-muted hover:text-text hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="font-semibold text-xs text-text truncate">
                    {table.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/5 text-muted shrink-0">
                  {table.columns.length}
                </span>
              </div>

              {/* Table Columns List */}
              {!isCollapsed && (
                <div className="py-1 px-1 divide-y divide-line/30 max-h-72 overflow-y-auto">
                  {table.columns.map((col) => {
                    const isRelated = relatedColumnKeys.has(`${table.name}.${col.name}`);

                    return (
                      <div
                        key={col.name}
                        className={`flex items-center justify-between px-2 py-1 text-xs font-mono transition-colors rounded ${
                          col.isPrimaryKey ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {col.isPrimaryKey ? (
                            <Key className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : isRelated ? (
                            <Network className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <span className="w-3" />
                          )}
                          <span
                            className={`truncate ${
                              col.isPrimaryKey
                                ? 'font-semibold text-amber-700 dark:text-amber-300'
                                : isRelated
                                ? 'text-indigo-700 dark:text-indigo-300 font-medium'
                                : 'text-text'
                            }`}
                          >
                            {col.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted truncate ml-2">
                          {col.dataType}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ERDiagramTab;
