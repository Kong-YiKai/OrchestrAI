import { memo, useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyNodeChanges,
} from '@xyflow/react';
import type { Connection, Edge, EdgeChange, Node, NodeChange, NodeProps } from '@xyflow/react';
import { MessagesSquare, ShieldCheck } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { TASK_LABELS } from './api';
import { createsCycle } from './plan';
import type { Plan, Task, TaskState } from './api';

type TaskData = { task: Task; role: string; state?: TaskState; reviewers: string };
type TaskNode = Node<TaskData, 'task'>;

const TaskCard = memo(function TaskCard({ data, selected }: NodeProps<TaskNode>) {
  const { task, role, state, reviewers } = data;
  return (
    <div className="orchestra-team-node" data-state={state?.status} data-selected={selected || undefined}>
      <Handle type="target" position={Position.Left} />
      <div className="orchestra-team-node-head">
        <span className="orchestra-team-role">{role}</span>
        {state && <span className="orchestra-team-state">{TASK_LABELS[state.status] ?? state.status}</span>}
      </div>
      <p className="orchestra-team-node-title">{task.title}</p>
      {task.review && (
        <p className="orchestra-team-review">
          {task.review.mode === 'review' ? <ShieldCheck size={12} /> : <MessagesSquare size={12} />}
          {task.review.mode === 'review' ? '互审' : '讨论'} · {reviewers}
        </p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { task: TaskCard };

/**
 * The plan is the only state: nodes and edges are derived from it, drags write task
 * positions back, and a new connection adds a dependency (source runs first).
 */
export default function TeamCanvas({
  plan,
  states,
  editable,
  selected,
  onSelect,
  onChange,
  onRefuse,
}: {
  plan: Plan;
  states?: Record<string, TaskState>;
  editable: boolean;
  selected?: string;
  onSelect: (id?: string) => void;
  onChange: (plan: Plan) => void;
  onRefuse: (message: string) => void;
}) {
  const [edge, setEdge] = useState<string>();
  const names = useMemo(() => new Map(plan.roles.map((r) => [r.id, r.name])), [plan.roles]);
  const nodes = useMemo<TaskNode[]>(
    () =>
      plan.tasks.map((task) => ({
        id: task.id,
        type: 'task',
        position: task.position ?? { x: 0, y: 0 },
        selected: task.id === selected,
        deletable: false,
        data: {
          task,
          role: names.get(task.role) ?? task.role,
          state: states?.[task.id],
          reviewers: (task.review?.reviewers ?? []).map((r) => names.get(r) ?? r).join('、'),
        },
      })),
    [plan.tasks, names, states, selected],
  );
  const edges = useMemo<Edge[]>(
    () =>
      plan.tasks.flatMap((task) =>
        task.depends_on.map((dep) => ({
          id: `${dep}->${task.id}`,
          source: dep,
          target: task.id,
          animated: states?.[task.id]?.status === 'running',
          markerEnd: { type: MarkerType.ArrowClosed },
          deletable: editable,
          selected: edge === `${dep}->${task.id}`,
        })),
      ),
    [plan.tasks, states, editable, edge],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<TaskNode>[]) => {
      const moved = applyNodeChanges(
        changes.filter((c) => c.type === 'position' && c.position),
        nodes,
      );
      if (!changes.some((c) => c.type === 'position' && c.position)) return;
      const at = new Map(moved.map((n) => [n.id, n.position]));
      onChange({
        ...plan,
        tasks: plan.tasks.map((t) => {
          const p = at.get(t.id);
          return p ? { ...t, position: { x: Math.round(p.x), y: Math.round(p.y) } } : t;
        }),
      });
    },
    [nodes, plan, onChange],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === 'select') setEdge((current) => (c.selected ? c.id : current === c.id ? undefined : current));
      }
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (!removed.size) return;
      onChange({
        ...plan,
        tasks: plan.tasks.map((t) => ({
          ...t,
          depends_on: t.depends_on.filter((d) => !removed.has(`${d}->${t.id}`)),
        })),
      });
    },
    [plan, onChange],
  );
  const onConnect = useCallback(
    ({ source, target }: Connection) => {
      if (!source || !target) return;
      if (createsCycle(plan, target, source)) {
        onRefuse('这条连线会形成循环依赖。');
        return;
      }
      const task = plan.tasks.find((t) => t.id === target);
      if (!task || task.depends_on.includes(source)) return;
      if (task.depends_on.length >= 10) {
        onRefuse('一个任务最多依赖 10 个任务。');
        return;
      }
      onChange({
        ...plan,
        tasks: plan.tasks.map((t) => (t.id === target ? { ...t, depends_on: [...t.depends_on, source] } : t)),
      });
    },
    [plan, onChange, onRefuse],
  );

  return (
    <div className="orchestra-team-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={editable ? onNodesChange : undefined}
        onEdgesChange={editable ? onEdgesChange : undefined}
        onConnect={editable ? onConnect : undefined}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(undefined)}
        nodesDraggable={editable}
        nodesConnectable={editable}
        deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
