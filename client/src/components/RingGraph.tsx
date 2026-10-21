import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';
import { api, type RingGraph as RingGraphData } from '../api';

type GraphNode = NodeObject<RingGraphData['nodes'][number]>;

const HEIGHT = 460;

/** Read a colour token from styles.css so the canvas follows light/dark mode. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function RingGraph() {
  const [data, setData] = useState<RingGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);

  useEffect(() => {
    api.ringGraph().then(
      (graph) => {
        // Start each ring around its own centre so separate rings don't tangle together.
        const nodes = graph.nodes.map((n) => ({
          ...n,
          x: n.ring * 300 + (Math.random() - 0.5) * 60,
          y: (Math.random() - 0.5) * 60,
        }));
        setData({ ...graph, nodes });
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  // Spread the layout out: stronger repulsion keeps the rings apart and labels readable.
  useEffect(() => {
    const graph = graphRef.current;
    if (!data || !graph) return;
    graph.d3Force('charge')?.strength(-220);
    graph.d3Force('link')?.distance(45);
    graph.d3ReheatSimulation();
  }, [data]);

  // The canvas needs an explicit width; follow the container's size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) return <div className="banner error">Could not load the network: {error}</div>;

  const colors = {
    risk: cssVar('--risk'),
    normal: cssVar('--ring'),
    text: cssVar('--text'),
    link: cssVar('--border-strong'),
    bg: cssVar('--surface'),
  };

  const drawNode = (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const color = node.highRisk ? colors.risk : colors.normal;
    ctx.fillStyle = color;
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = 1.5 / scale;

    ctx.beginPath();
    if (node.type === 'customer') {
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
    } else if (node.type === 'device') {
      ctx.rect(x - 5, y - 5, 10, 10);
    } else {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y + 5);
      ctx.lineTo(x - 6, y + 5);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Names for customers; devices and addresses show theirs on hover.
    if (node.type === 'customer') {
      const fontSize = Math.max(11 / scale, 3);
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = colors.text;
      ctx.fillText(node.label, x, y + 9);
    }
  };

  return (
    <div className="ring-graph">
      <div className="legend">
        <span><i className="swatch risk" /> High-risk ring</span>
        <span><i className="swatch normal" /> Other ring</span>
        <span><i className="shape circle" /> Customer</span>
        <span><i className="shape square" /> Device</span>
        <span><i className="shape triangle" /> Address</span>
        <span className="hint">Solid line: uses device · dashed: shipped to</span>
      </div>
      <div ref={wrapRef} className="graph-canvas" style={{ height: HEIGHT }}>
        {!data ? (
          <div className="empty small">Loading network…</div>
        ) : (
          <ForceGraph2D<GraphNode>
            ref={graphRef}
            width={width}
            height={HEIGHT}
            graphData={data}
            nodeLabel={(n) => `${n.label} · ${n.type} · ring risk ${n.riskScore}`}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkColor={() => colors.link}
            linkLineDash={(link) => (link.type === 'SHIPPED_TO' ? [3, 2] : null)}
            linkWidth={1.2}
            cooldownTicks={200}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
          />
        )}
      </div>
    </div>
  );
}
