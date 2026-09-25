import { useEffect, useRef, useState } from 'preact/hooks';
import type { McpStatus } from '../../domain/mcp';
import { formatTokens } from '../../domain/usage';
import { Icon } from '../icons';
import type { DetailsSession, DetailsState, FromDetails } from '../detailsProtocol';

export type DockTab = 'overview' | 'mcp' | 'rules';

/** 区画の高さの既定と、つまみで変えられる範囲 */
export const DEFAULT_DOCK_HEIGHT = 220;
const MIN_DOCK_HEIGHT = 80;

/** MCP サーバーを並べる順。手当てが要るものを先に */
const MCP_ORDER: McpStatus[] = ['failed', 'needs-auth', 'pending', 'connected', 'disabled'];

interface SessionDockProps {
  taskId: string;
  session: DetailsSession;
  mcp: DetailsState['mcp'];
  height: number | undefined;
  strings: DetailsState['strings'];
  post: (message: FromDetails) => void;
  initialTab?: DockTab;
}

/**
 * 右サイドバーの下の区画。セッションの情報をタブ（概要・MCP・常に許可）で切り替えて出す。
 * 上端のつまみで高さを変えられ、変えた高さは拡張機能に覚えてもらう
 */
export function SessionDock({
  taskId,
  session,
  mcp,
  height: savedHeight,
  strings,
  post,
  initialTab = 'overview',
}: SessionDockProps) {
  const [tab, setTab] = useState<DockTab>(initialTab);
  const [height, setHeight] = useState(savedHeight ?? DEFAULT_DOCK_HEIGHT);
  const drag = useRef<{ startY: number; startHeight: number } | undefined>(undefined);

  // MCP のタブを開いている間は、タスクが替わるたびに聞き直す
  useEffect(() => {
    if (tab === 'mcp') {
      post({ type: 'mcpServers' });
    }
  }, [tab, taskId]);

  const onSashDown = (e: MouseEvent): void => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startHeight: height };
    let latest = height;
    const onMove = (move: MouseEvent): void => {
      const start = drag.current;
      if (start === undefined) {
        return;
      }
      const max = Math.max(MIN_DOCK_HEIGHT, window.innerHeight - MIN_DOCK_HEIGHT);
      latest = Math.min(
        max,
        Math.max(MIN_DOCK_HEIGHT, start.startHeight + start.startY - move.clientY)
      );
      setHeight(latest);
    };
    const onUp = (): void => {
      drag.current = undefined;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      post({ type: 'dockHeight', height: Math.round(latest) });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const failed =
    mcp?.running === true ? mcp.servers.filter((s) => s.status === 'failed').length : 0;
  const tabButton = (id: DockTab, label: preact.ComponentChildren) => (
    <button
      class="dock-tab"
      role="tab"
      aria-selected={tab === id ? 'true' : 'false'}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div class="dock" style={{ height: `${height}px` }}>
      <div class="dock-sash" title={strings.resizeDock} onMouseDown={onSashDown} />
      <div class="dock-tabs" role="tablist">
        {tabButton('overview', strings.overview)}
        {tabButton(
          'mcp',
          <>
            {strings.mcpTab}
            {failed > 0 && (
              <span class="tab-count" data-status="failed">
                {failed}
              </span>
            )}
          </>
        )}
        {tabButton(
          'rules',
          strings.alwaysAllowedTab.replace('{0}', String(session.alwaysAllowed.length))
        )}
        <span class="dock-tabs-space" />
        {tab === 'mcp' && (
          <button
            class="icon-button refresh"
            title={strings.refresh}
            aria-label={strings.refresh}
            onClick={() => post({ type: 'mcpServers' })}
          >
            <Icon name="refresh" />
          </button>
        )}
      </div>
      <div class="dock-body">
        {tab === 'overview' && <Overview session={session} strings={strings} post={post} />}
        {tab === 'mcp' && <McpList mcp={mcp} strings={strings} />}
        {tab === 'rules' &&
          (session.alwaysAllowed.length === 0 ? (
            <div class="dock-empty">{strings.none}</div>
          ) : (
            <ul class="rules">
              {session.alwaysAllowed.map((rule) => (
                <li class="rule" key={rule}>
                  {rule}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Overview({
  session,
  strings,
  post,
}: {
  session: DetailsSession;
  strings: DetailsState['strings'];
  post: (message: FromDetails) => void;
}) {
  const usage = session.usage;
  return (
    <dl class="session-facts">
      <dt>{strings.context}</dt>
      <dd class="session-context">
        {usage === undefined ? (
          '—'
        ) : (
          <>
            {usage.ratio !== undefined && (
              <span class="meter">
                <span style={{ width: `${Math.min(100, Math.round(usage.ratio * 100))}%` }} />
              </span>
            )}
            <span class="tokens">
              {usage.window === undefined
                ? formatTokens(usage.used)
                : `${formatTokens(usage.used)} / ${formatTokens(usage.window)}`}
            </span>
            <button
              class="icon-button compact"
              title={strings.compact}
              aria-label={strings.compact}
              disabled={!session.canCompact}
              onClick={() => post({ type: 'compact' })}
            >
              <Icon name="fold" />
            </button>
          </>
        )}
      </dd>
      <dt>{strings.model}</dt>
      <dd>{session.model}</dd>
      {session.effort !== undefined && (
        <>
          <dt>{strings.effort}</dt>
          <dd>{session.effort}</dd>
        </>
      )}
      <dt>{strings.permissionMode}</dt>
      <dd>{session.permissionMode}</dd>
      <dt>{strings.directory}</dt>
      <dd title={session.cwd}>{session.cwd}</dd>
    </dl>
  );
}

/** MCP サーバーを問題のある順に 1 行ずつ。失敗には理由、それ以外は状態を添える */
function McpList({ mcp, strings }: { mcp: DetailsState['mcp']; strings: DetailsState['strings'] }) {
  if (mcp === undefined) {
    return null;
  }
  if (!mcp.running) {
    return <div class="dock-empty">{strings.mcpNotRunning}</div>;
  }
  if (mcp.servers.length === 0) {
    return <div class="dock-empty">{strings.none}</div>;
  }
  const sorted = MCP_ORDER.flatMap((status) => mcp.servers.filter((s) => s.status === status));
  return (
    <ul class="mcp-list">
      {sorted.map((server) => (
        <li class="mcp-row" data-status={server.status} key={server.name} title={server.scope}>
          <span class="mcp-name">{server.name}</span>
          <span class="mcp-why" title={server.error}>
            {server.error ?? strings.mcpStatus[server.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
