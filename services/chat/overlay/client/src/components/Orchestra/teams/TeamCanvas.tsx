import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge, EdgeChange, FinalConnectionState, Node, NodeChange, NodeProps } from '@xyflow/react';
import { CheckCircle2, CircleAlert, Loader2, MessagesSquare, PauseCircle, ShieldCheck } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { NODE_LABELS, describeActivity, isActive, isEditable } from './api';
import { addTask, createsCycle, stateOf } from './plan';
import type { Plan, Run, Task, TaskState } from './api';

type TaskData = { task: Task; role: string; state: TaskState; reviewers: string; activity: string; current: boolean };
type TaskNode = Node<TaskData, 'task'>;

const ICONS: Partial<Record<TaskState['status'], JSX.Element>> = {
  running: <Loader2 size={12} className="animate-spin" />,
  queued: <Loader2 size={12} />,
  pausing: <PauseCircle size={12} />,
  paused: <PauseCircle size={12} />,
  completed: <CheckCircle2 size={12} />,
  failed: <CircleAlert size={12} />,
};

const TaskCard = memo(function TaskCard({ data, selected }: NodeProps<TaskNode>) {
  const { task, role, state, reviewers, activity, current } = data;
  return (
    <div className="orchestra-team-node" data-state={state.status} data-selected={selected || undefined} data-current={current || undefined}>
      <Handle type="target" position={Position.Left} />
      <div className="orchestra-team-node-head">
        <span className="orchestra-team-role">{role}</span>
        <span className="orchestra-team-state">
          {ICONS[state.status]}
          {NODE_LABELS[state.status] ?? state.status}
        </span>
      </div>
      <p className="orchestra-team-node-title">{task.title}</p>
      {task.review && (
        <p className="orchestra-team-review">
          {task.review.mode === 'review' ? <ShieldCheck size={12} /> : <MessagesSquare size={12} />}
          {task.review.mode === 'review' ? '互审' : '讨论'} · {reviewers}
        </p>
      )}
      {activity && <p className="orchestra-team-activity">{activity}</p>}
      {current && <span className="orchestra-team-pointer">当前</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { task: TaskCard };

type Props = {
  plan: Plan;
  run?: Run;
  selected?: string;
  current?: string;
  /** Changing this value centres the canvas on `current`. */
  focus?: number;
  onSelect: (id?: string) => void;
  onChange: (plan: Plan) => void;
  onRefuse: (message: string) => void;
};

/**
 * The plan is the only state: nodes and edges are derived from it, drags write positions
 * back, a connection adds a dependency (source runs first), and dropping a connection on
 * empty canvas or double-clicking it adds a node. Started and finished nodes keep their
 * links and cannot be deleted.
 */
export default function TeamCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ plan, run, selected, current, focus, onSelect, onChange, onRefuse }: Props) {
  const flow = useReactFlow();
  const [edge, setEdge] = useState<string>();
  const names = useMemo(() => new Map(plan.roles.map((r) => [r.id, r.name])), [plan.roles]);
  const editable = useCallback((id: string) => isEditable(stateOf(run, id).status), [run]);
  const nodes = useMemo<TaskNode[]>(
    () =>
      plan.tasks.map((task) => {
        const state = stateOf(run, task.id);
        return {
          id: task.id,
          type: 'task',
          position: task.position ?? { x: 0, y: 0 },
          selected: task.id === selected,
          deletable: isEditable(state.status),
          data: {
            task,
            state,
            current: task.id === current,
            role: names.get(task.role) ?? task.role,
            reviewers: (task.review?.reviewers ?? []).map((r) => names.get(r) ?? r).join('、'),
            activity: state.status === 'running' ? describeActivity(state.activity, names) : '',
          },
        };
      }),
    [plan.tasks, names, run, selected, current],
  );
  const edges = useMemo<Edge[]>(
    () =>
      plan.tasks.flatMap((task) =>
        task.depends_on.map((dep) => ({
          id: `${dep}->${task.id}`,
          source: dep,
          target: task.id,
          animated: isActive(stateOf(run, task.id).status),
          markerEnd: { type: MarkerType.ArrowClosed },
          deletable: editable(task.id),
          selected: edge === `${dep}->${task.id}`,
        })),
      ),
    [plan.tasks, run, editable, edge],
  );

  useEffect(() => {
    if (!focus || !current) return;
    const at = plan.tasks.find((t) => t.id === current)?.position;
    if (at) flow.setCenter(at.x + 110, at.y + 50, { zoom: Math.max(flow.getZoom(), 0.9), duration: 400 });
    // Only an explicit request (focus) moves the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const onNodesChange = useCallback(
    (changes: NodeChange<TaskNode>[]) => {
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      const moves = changes.filter((c) => c.type === 'position' && c.position);
      if (!removed.size && !moves.length) return;
      const at = new Map(applyNodeChanges(moves, nodes).map((n) => [n.id, n.position]));
      if (removed.has(selected ?? '')) onSelect(undefined);
      onChange({
        ...plan,
        tasks: plan.tasks
          .filter((t) => !removed.has(t.id))
          .map((t) => {
            const p = at.get(t.id);
            return {
              ...t,
              depends_on: t.depends_on.filter((d) => !removed.has(d)),
              ...(p && moves.some((m) => 'id' in m && m.id === t.id) ? { position: { x: Math.round(p.x), y: Math.round(p.y) } } : {}),
            };
          }),
      });
    },
    [nodes, plan, onChange, onSelect, selected],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === 'select') setEdge((now) => (c.selected ? c.id : now === c.id ? undefined : now));
      }
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (!removed.size) return;
      onChange({
        ...plan,
        tasks: plan.tasks.map((t) => ({ ...t, depends_on: t.depends_on.filter((d) => !removed.has(`${d}->${t.id}`)) })),
      });
    },
    [plan, onChange],
  );
  const link = useCallback(
    (source: string, target: string) => {
      if (createsCycle(plan, target, source)) return onRefuse('这条连线会形成循环依赖。');
      const task = plan.tasks.find((t) => t.id === target);
      if (!task || task.depends_on.includes(source)) return;
      if (!editable(target)) return onRefuse(`「${task.title}」已经开始或完成，不能再改它的前置节点。`);
      if (task.depends_on.length >= 10) return onRefuse('一个节点最多依赖 10 个节点。');
      onChange({ ...plan, tasks: plan.tasks.map((t) => (t.id === target ? { ...t, depends_on: [...t.depends_on, source] } : t)) });
    },
    [plan, onChange, onRefuse, editable],
  );
  const onConnect = useCallback(({ source, target }: Connection) => source && target && link(source, target), [link]);
  // A link dropped on empty canvas creates the next node there, already connected.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || plan.tasks.length >= 30) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const at = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const from = state.fromNode.id;
      const next = addTask(plan, { x: at.x, y: at.y - 40 }, state.fromHandle?.type === 'source' ? from : undefined);
      const plan2 = state.fromHandle?.type === 'target' && editable(from)
        ? { ...next.plan, tasks: next.plan.tasks.map((t) => (t.id === from ? { ...t, depends_on: [...t.depends_on, next.id] } : t)) }
        : next.plan;
      onChange(plan2);
      onSelect(next.id);
    },
    [flow, plan, onChange, onSelect, editable],
  );

  return (
    <div
      className="orchestra-team-canvas"
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).classList.contains('react-flow__pane') || plan.tasks.length >= 30) return;
        const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const next = addTask(plan, { x: at.x - 110, y: at.y - 40 });
        onChange(next.plan);
        onSelect(next.id);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        connectionRadius={40}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(undefined)}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <p className="orchestra-team-canvas-hint">
        双击空白处添加节点 · 从节点右侧圆点拖到另一个节点左侧圆点，表示先做前者· 拖到空白处会新建并连好下一个节点 · 选中后按 Delete 删除
      </p>
    </div>
  );
}
