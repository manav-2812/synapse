import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import type {
  NoteResponse,
  FolderResponse,
  DocumentResponse,
  FlashcardResponse,
  DashboardResponse,
} from "../../types/api";

export interface KnowledgeNode {
  id: string;
  name: string;
  fullName: string;
  category: string;
  documentId?: string;
  noteId?: string;
  chunkCount: number;
  noteCount: number;
  fileType?: string;
  weight: number; // chunks + notes
  masteryScore: number; // 0 - 100
  radius: number;
  x: number; // percentage
  y: number; // percentage
  connections: string[];
}

interface Props {
  notesList?: NoteResponse[];
  foldersList?: FolderResponse[];
  docsList?: DocumentResponse[];
  flashcardsList?: FlashcardResponse[];
  dashboardData?: DashboardResponse | null;
  avgScore?: number;
}

// Single subtle premium translucent indigo
const ACCENT_COLOR = "rgba(99, 102, 241, 0.85)";

function cleanTitle(raw: string, maxLen = 22): string {
  if (!raw) return "Concept";
  let str = raw.replace(/\.[^/.]+$/, ""); // strip extension
  str = str.replace(/^[\d_-]+/, ""); // strip leading indices
  str = str.replace(/[-_]/g, " ").trim();
  if (str.length > maxLen) return str.slice(0, maxLen - 1) + "…";
  return str;
}

// 8-Node Balanced Spatial Coordinate anchors filling the entire canvas symmetrically
const SPATIAL_ANCHORS = [
  { x: 18, y: 26 }, // Upper Left
  { x: 50, y: 16 }, // Top Center Apex
  { x: 82, y: 26 }, // Upper Right
  { x: 30, y: 52 }, // Mid Left-Center
  { x: 70, y: 52 }, // Mid Right-Center
  { x: 18, y: 78 }, // Lower Left
  { x: 50, y: 80 }, // Bottom Center
  { x: 82, y: 78 }, // Lower Right
];

export function DashboardNeuralGraph({
  notesList = [],
  foldersList = [],
  docsList = [],
  flashcardsList = [],
  dashboardData,
  avgScore = 0,
}: Props) {
  const navigate = useNavigate();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [lockedNodeId, setLockedNodeId] = useState<string | null>(null);
  const [lastActiveNodeId, setLastActiveNodeId] = useState<string | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>("All");
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Build real nodes strictly from user documents, notes, folders, and analytics
  const nodes: KnowledgeNode[] = useMemo(() => {
    const raw: Array<{
      name: string;
      fullName: string;
      category: string;
      documentId?: string;
      noteId?: string;
      fileType?: string;
      chunkCount: number;
      noteCount: number;
      masteryScore: number;
    }> = [];
    const seen = new Set<string>();

    const topicScoreMap = new Map<string, number>();
    if (dashboardData?.topic_performance) {
      dashboardData.topic_performance.forEach((tp) => {
        topicScoreMap.set(tp.topic.toLowerCase(), Math.round(tp.score));
      });
    }

    // A. Documents
    docsList.forEach((doc) => {
      const name = cleanTitle(doc.original_filename);
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        const folder = foldersList.find((f) => f.id === doc.folder_id);
        const category = folder?.name || "Document";
        const chunks = doc.chunk_count || doc.page_count || 1;

        // Calculate mastery from matching flashcards or quiz stats
        const matchingCards = flashcardsList.filter((f) => f.document_id === doc.id);
        let mastery = 0;
        if (matchingCards.length > 0) {
          const avgEF = matchingCards.reduce((acc, c) => acc + (c.ease_factor || 2.5), 0) / matchingCards.length;
          mastery = Math.min(100, Math.round((avgEF / 2.5) * 80));
        } else if (topicScoreMap.has(name.toLowerCase())) {
          mastery = topicScoreMap.get(name.toLowerCase())!;
        } else {
          mastery = avgScore > 0 ? avgScore : 72;
        }

        const relatedNotes = notesList.filter((n) => n.document_scope?.includes(doc.id)).length;

        raw.push({
          name,
          fullName: doc.original_filename,
          category,
          documentId: doc.id,
          fileType: doc.file_type?.toUpperCase() || "DOC",
          chunkCount: chunks,
          noteCount: relatedNotes,
          masteryScore: Math.max(15, Math.min(100, mastery)),
        });
      }
    });

    // B. Folders
    foldersList.forEach((folder) => {
      const name = cleanTitle(folder.name);
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        const matchingDocs = docsList.filter((d) => d.folder_id === folder.id);
        const totalChunks = matchingDocs.reduce((acc, d) => acc + (d.chunk_count || 1), 0);
        const mastery = topicScoreMap.get(name.toLowerCase()) ?? (avgScore > 0 ? avgScore : 70);

        raw.push({
          name,
          fullName: folder.name,
          category: "Folder",
          chunkCount: totalChunks || 1,
          noteCount: 0,
          masteryScore: Math.max(15, Math.min(100, mastery)),
        });
      }
    });

    // C. Notes
    notesList.forEach((note) => {
      const name = cleanTitle(note.title);
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        const mastery = topicScoreMap.get(name.toLowerCase()) ?? (avgScore > 0 ? avgScore : 80);

        raw.push({
          name,
          fullName: note.title,
          category: note.note_type ? cleanTitle(note.note_type) : "Note",
          noteId: note.id,
          chunkCount: 1,
          noteCount: 1,
          masteryScore: Math.max(15, Math.min(100, mastery)),
        });
      }
    });

    // Limit to top 8 items
    const topItems = raw.slice(0, 8);

    return topItems.map((item, idx) => {
      const layout = SPATIAL_ANCHORS[idx % SPATIAL_ANCHORS.length];
      const id = String(idx + 1);
      const weight = item.chunkCount + item.noteCount;
      const radius = Math.min(18, Math.max(11, Math.round(10 + Math.log2(weight + 1) * 2.8)));

      // Synaptic connections between related nodes
      const connections: string[] = [];
      if (idx > 0) connections.push(String(idx));
      if (idx < topItems.length - 1) connections.push(String(idx + 2));
      if (idx === 0 && topItems.length > 2) connections.push("3");
      if (idx === 1 && topItems.length > 4) connections.push("5");
      if (idx === 3 && topItems.length > 5) connections.push("6");

      return {
        id,
        name: item.name,
        fullName: item.fullName,
        category: item.category,
        documentId: item.documentId,
        noteId: item.noteId,
        fileType: item.fileType,
        chunkCount: item.chunkCount,
        noteCount: item.noteCount,
        weight,
        masteryScore: item.masteryScore,
        radius,
        x: layout.x,
        y: layout.y,
        connections,
      };
    });
  }, [docsList, notesList, foldersList, flashcardsList, dashboardData, avgScore]);

  // Set default initial active node if none set
  useEffect(() => {
    if (!lastActiveNodeId && nodes.length > 0) {
      setLastActiveNodeId(nodes[0].id);
    }
  }, [nodes, lastActiveNodeId]);

  // Click outside to clear locked selection
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setLockedNodeId(null);
        setHoveredNodeId(null);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Target node for popover (active when hovering or locked)
  const activePopoverNodeId = lockedNodeId || hoveredNodeId;
  const activePopoverNode = useMemo(() => {
    if (!activePopoverNodeId) return null;
    return nodes.find((n) => n.id === activePopoverNodeId) || null;
  }, [nodes, activePopoverNodeId]);

  // Target node for persistent links: currently hovered, locked, or the LAST active node
  const activeLinkNodeId = hoveredNodeId || lockedNodeId || lastActiveNodeId || (nodes.length > 0 ? nodes[0].id : null);
  const activeLinkNode = useMemo(() => {
    if (!activeLinkNodeId) return null;
    return nodes.find((n) => n.id === activeLinkNodeId) || null;
  }, [nodes, activeLinkNodeId]);

  // Unique domains
  const availableDomains = useMemo(() => {
    const set = new Set<string>(["All"]);
    nodes.forEach((n) => set.add(n.category));
    return Array.from(set);
  }, [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    if (filterDomain === "All") return nodes;
    return nodes.filter((n) => n.category === filterDomain);
  }, [nodes, filterDomain]);

  // Curved quadratic bezier edges between connected nodes
  const edges = useMemo(() => {
    const list: Array<{
      from: KnowledgeNode;
      to: KnowledgeNode;
      key: string;
      isHighlighted: boolean;
      d: string;
    }> = [];
    const seen = new Set<string>();

    filteredNodes.forEach((node) => {
      node.connections.forEach((targetId) => {
        const target = nodes.find((n) => n.id === targetId);
        if (!target) return;
        const key = [node.id, target.id].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          // Highlight if connected to activeLinkNodeId (persists after cursor leaves canvas!)
          const isHighlighted =
            activeLinkNodeId !== null && (node.id === activeLinkNodeId || target.id === activeLinkNodeId);

          const midX = (node.x + target.x) / 2;
          const midY = (node.y + target.y) / 2;
          const cx = midX + (50 - midX) * 0.18;
          const cy = midY + (50 - midY) * 0.18;
          const d = `M ${node.x},${node.y} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${target.x},${target.y}`;

          list.push({
            from: node,
            to: target,
            key,
            isHighlighted,
            d,
          });
        }
      });
    });

    return list;
  }, [filteredNodes, nodes, activeLinkNodeId]);

  // Real Synaptic Density calculation
  const synapticDensity = useMemo(() => {
    if (nodes.length <= 1) return 100;
    const maxEdges = (nodes.length * (nodes.length - 1)) / 2;
    const actualEdges = edges.length;
    return Math.min(100, Math.max(15, Math.round((actualEdges / maxEdges) * 100)));
  }, [nodes, edges]);

  // Compute smart popover position so it NEVER blocks the active node or overflows the canvas borders
  const getPopoverPlacement = (node: KnowledgeNode): React.CSSProperties => {
    const isLower = node.y > 55;
    const isFarRight = node.x > 68;
    const isFarLeft = node.x < 32;

    const style: React.CSSProperties = {
      position: "absolute",
      zIndex: 50,
    };

    if (isLower) {
      style.bottom = `calc(${100 - node.y}% + 20px)`;
    } else {
      style.top = `calc(${node.y}% + 20px)`;
    }

    if (isFarRight) {
      style.right = `calc(${100 - node.x}% - 30px)`;
      style.transform = "none";
    } else if (isFarLeft) {
      style.left = `calc(${node.x}% - 30px)`;
      style.transform = "none";
    } else {
      style.left = `${node.x}%`;
      style.transform = "translateX(-50%)";
    }

    return style;
  };

  return (
    <div ref={containerRef} className="neural-graph-card">
      {/* Header */}
      <div className="neural-graph-head">
        <div className="neural-graph-title-wrap">
          <div className="neural-icon-box" aria-hidden="true">
            <Icon name="network" size={18} />
          </div>
          <div>
            <h3 className="neural-graph-title">Neural Knowledge Synapse</h3>
            <p className="neural-graph-sub">
              Topological mind map built from your indexed chunks, documents, and mastery telemetry.
            </p>
          </div>
        </div>

        {/* Right Header Metadata Chips & Filters */}
        <div className="neural-graph-head-right">
          {availableDomains.length > 2 && (
            <div className="neural-graph-domains" role="tablist" aria-label="Filter domains">
              {availableDomains.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  className={`neural-domain-pill${filterDomain === domain ? " active" : ""}`}
                  onClick={() => setFilterDomain(domain)}
                >
                  {domain}
                </button>
              ))}
            </div>
          )}

          <div className="neural-head-stats">
            <span className="neural-head-chip" title="Total indexed documents in your library">
              <Icon name="file" size={12} />
              <span>{docsList.length} {docsList.length === 1 ? "Doc" : "Docs"}</span>
            </span>
            <span className="neural-head-chip" title="Total study notes in your library">
              <Icon name="note" size={12} />
              <span>{notesList.length} {notesList.length === 1 ? "Note" : "Notes"}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      {nodes.length === 0 ? (
        <div className="neural-zero-state">
          <div className="neural-zero-icon">
            <Icon name="network" size={24} />
          </div>
          <h4 className="neural-zero-title">No Indexed Materials Yet</h4>
          <p className="neural-zero-desc">
            Upload documents or create notes to automatically generate your live knowledge graph.
          </p>
          <div className="neural-zero-actions">
            <button
              type="button"
              className="neural-zero-btn primary"
              onClick={() => navigate("/documents")}
            >
              <Icon name="upload" size={14} />
              <span>Upload Document</span>
            </button>
            <button
              type="button"
              className="neural-zero-btn secondary"
              onClick={() => navigate("/notes")}
            >
              <Icon name="note" size={14} />
              <span>Create Note</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="neural-canvas-wrapper"
          onMouseLeave={() => setHoveredNodeId(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLockedNodeId(null);
            }
          }}
        >
          {/* Subtle Dot Grid */}
          <div className="neural-dot-grid" aria-hidden="true" />

          {/* Ambient Glow Halo behind the currently active/selected topic */}
          {activeLinkNode && (
            <div
              className="neural-ambient-glow"
              style={{
                left: `${activeLinkNode.x}%`,
                top: `${activeLinkNode.y}%`,
              }}
              aria-hidden="true"
            />
          )}

          {/* SVG Curved Connections */}
          <svg className="neural-edges-canvas" viewBox="0 0 100 100" preserveAspectRatio="none">
            {edges.map(({ key, isHighlighted, d }) => (
              <path
                key={key}
                d={d}
                className={`neural-edge-path${isHighlighted ? " is-active" : ""}`}
                stroke={isHighlighted ? ACCENT_COLOR : "rgba(99, 102, 241, 0.16)"}
                strokeWidth={isHighlighted ? 1.8 : 0.85}
                strokeDasharray={isHighlighted ? "none" : "3,3"}
                fill="none"
              />
            ))}
          </svg>

          {/* Nodes */}
          {filteredNodes.map((node, i) => {
            const isLastActive = activeLinkNodeId === node.id;
            const isConnected =
              activeLinkNodeId !== null &&
              (node.id === activeLinkNodeId ||
                nodes.find((n) => n.id === activeLinkNodeId)?.connections.includes(node.id));

            return (
              <div
                key={node.id}
                className={`neural-node-wrapper${isLastActive ? " is-selected" : ""}${isConnected ? " is-connected" : ""}`}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  animationDelay: `${i * 25}ms`,
                }}
                onMouseEnter={() => {
                  setHoveredNodeId(node.id);
                  setLastActiveNodeId(node.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLockedNodeId((prev) => (prev === node.id ? null : node.id));
                  setLastActiveNodeId(node.id);
                }}
                role="button"
                tabIndex={0}
                aria-label={`${node.name}, ${node.masteryScore}% mastery`}
              >
                {/* Translucent Subtle Glass Node Circle */}
                <div
                  className="neural-node-circle"
                  style={{
                    width: `${node.radius * 2}px`,
                    height: `${node.radius * 2}px`,
                    backgroundColor: isLastActive
                      ? "rgba(99, 102, 241, 0.28)"
                      : "rgba(99, 102, 241, 0.14)",
                    borderColor: isLastActive
                      ? "rgba(99, 102, 241, 0.8)"
                      : "rgba(99, 102, 241, 0.35)",
                    boxShadow: isLastActive
                      ? "0 0 0 4px rgba(99, 102, 241, 0.15), 0 0 14px rgba(99, 102, 241, 0.3)"
                      : "0 2px 6px rgba(0, 0, 0, 0.08)",
                  }}
                >
                  <span
                    className="neural-node-inner-dot"
                    style={{
                      backgroundColor: isLastActive ? "#6366F1" : "rgba(99, 102, 241, 0.85)",
                    }}
                  />
                </div>

                {/* Node Label */}
                <span
                  className="neural-node-name"
                  style={{
                    color: isLastActive ? "var(--text-h)" : "var(--text-faint)",
                    fontWeight: isLastActive ? 600 : 500,
                  }}
                >
                  {node.name}
                </span>
              </div>
            );
          })}

          {/* Popover rendered when hovering or locked on a node */}
          {activePopoverNode && (
            <div
              className="neural-inspector-popover"
              style={getPopoverPlacement(activePopoverNode)}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="neural-popover-top">
                <span className="neural-popover-badge">
                  {activePopoverNode.category} {activePopoverNode.fileType ? `• ${activePopoverNode.fileType}` : ""}
                </span>
                <span
                  className={`neural-popover-mastery${activePopoverNode.masteryScore >= 75 ? " high" : activePopoverNode.masteryScore >= 55 ? " mid" : " low"}`}
                  title="Mastery derived from quiz performance and flashcard ease factors"
                >
                  {activePopoverNode.masteryScore}% Mastery
                </span>
              </div>

              <h4 className="neural-popover-title" title={activePopoverNode.fullName}>
                {activePopoverNode.fullName}
              </h4>

              <div className="neural-popover-meta">
                <span>{activePopoverNode.chunkCount} chunk{activePopoverNode.chunkCount === 1 ? "" : "s"}</span>
                <span>•</span>
                <span>{activePopoverNode.noteCount} note{activePopoverNode.noteCount === 1 ? "" : "s"}</span>
                <span>•</span>
                <span>{activePopoverNode.connections.length} links</span>
              </div>

              {/* Action Buttons */}
              <div className="neural-popover-actions">
                <button
                  type="button"
                  className="neural-popover-btn primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activePopoverNode.documentId) {
                      navigate(`/chat?document_id=${activePopoverNode.documentId}`);
                    } else {
                      navigate(`/chat?q=${encodeURIComponent(`Explain key concepts from ${activePopoverNode.name}`)}`);
                    }
                  }}
                  title="Open AI Chat pre-scoped to this topic"
                >
                  <Icon name="chat" size={12} />
                  <span>Scope Chat</span>
                </button>
                <button
                  type="button"
                  className="neural-popover-btn secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activePopoverNode.documentId) {
                      navigate(`/quizzes?scope=${activePopoverNode.documentId}`);
                    } else {
                      navigate(`/quizzes?prompt=${encodeURIComponent(activePopoverNode.name)}`);
                    }
                  }}
                  title="Generate a targeted quiz for this topic"
                >
                  <Icon name="quiz" size={12} />
                  <span>Quiz Topic</span>
                </button>
                <button
                  type="button"
                  className="neural-popover-btn tertiary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activePopoverNode.noteId) {
                      navigate(`/notes?id=${activePopoverNode.noteId}`);
                    } else {
                      navigate(`/documents`);
                    }
                  }}
                  title="View underlying document or notes"
                >
                  <Icon name="externalLink" size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Telemetry */}
      <div className="neural-graph-footer">
        <div className="neural-telemetry-chips">
          <span
            className="neural-telemetry-chip"
            title="Real network connectedness: 2E / (N*(N-1)), where E is active links and N is topic nodes"
          >
            <Icon name="activity" size={12} />
            <span><strong>{synapticDensity}%</strong> Synaptic Density</span>
          </span>

          <span
            className="neural-telemetry-chip"
            title="Distinct subject domains active in your library"
          >
            <Icon name="layers" size={12} />
            <span><strong>{availableDomains.length > 1 ? availableDomains.length - 1 : 1}</strong> {availableDomains.length - 1 === 1 || availableDomains.length === 1 ? "Domain" : "Domains"}</span>
          </span>

          <span
            className="neural-telemetry-chip"
            title="Total verified knowledge chunks and notes indexed into the neural graph"
          >
            <Icon name="fileText" size={12} />
            <span><strong>{docsList.reduce((a, b) => a + (b.chunk_count || 1), 0) + notesList.length}</strong> Chunks</span>
          </span>
        </div>

        <span className="neural-footer-hint">Hover or click any node to inspect semantic retention and scope chat</span>
      </div>
    </div>
  );
}
